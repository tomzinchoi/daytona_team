"""Trusted benchmark harness. Python standard library only; no runtime downloads."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import urllib.error
import urllib.request

MODEL_ROOT = Path('/opt/models')
LLAMA_SERVER = '/opt/llama/bin/llama-server'
MODELS = {
    'qwen3-4b': 'qwen3-4b.gguf',
    'deepseek-r1-distill-qwen-7b': 'deepseek-r1-distill-qwen-7b.gguf',
    'gemma-3-4b': 'gemma-3-4b.gguf',
}
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class RuntimeLimitation(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def write_json(path, value):
    target = Path(path)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    temporary.replace(target)


def preflight(payload):
    if not os.access(LLAMA_SERVER, os.X_OK):
        raise RuntimeLimitation('LLAMA_NOT_INSTALLED', 'llama-server is missing from the snapshot.')
    manifest_path = MODEL_ROOT / 'manifest.json'
    if not manifest_path.is_file():
        raise RuntimeLimitation('MODEL_MANIFEST_MISSING', 'The snapshot model manifest is missing.')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    for agent in payload['architecture']['agents']:
        model = agent['model']
        if model not in MODELS:
            raise RuntimeLimitation('MODEL_UNSUPPORTED', 'The requested model is unsupported.')
        model_file = MODEL_ROOT / MODELS[model]
        entry = manifest.get('models', {}).get(model, {})
        if not model_file.is_file() or model_file.stat().st_size != entry.get('bytes') or len(entry.get('sha256', '')) != 64:
            raise RuntimeLimitation('MODEL_NOT_CACHED', 'The requested GGUF model is not cached with a valid manifest.')
    return manifest


def remaining(deadline):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise RuntimeLimitation('BENCHMARK_TIMEOUT', 'The fixed benchmark execution timeout elapsed.')
    return seconds


def stop_process(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=2)


def infer(agent, task, previous_output, settings, deadline):
    model_file = MODEL_ROOT / MODELS[agent['model']]
    command = [LLAMA_SERVER, '--model', str(model_file), '--alias', agent['model'],
               '--host', '127.0.0.1', '--port', '8080', '--ctx-size', str(settings['contextSize']),
               '--threads', str(settings['threads']), '--parallel', '1', '--n-gpu-layers', '0',
               '--jinja', '--reasoning-format', 'deepseek']
    # No shell interpolation, public port, external inference service, or credentials.
    with open('llama.log', 'ab') as logfile:
        process = subprocess.Popen(command, stdout=logfile, stderr=logfile, start_new_session=True)
        try:
            while True:
                remaining(deadline)
                if process.poll() is not None:
                    raise RuntimeLimitation('MODEL_START_FAILED', 'llama-server exited before becoming ready.')
                try:
                    with HTTP.open('http://127.0.0.1:8080/health', timeout=min(1, remaining(deadline))) as response:
                        if response.status == 200:
                            break
                except (urllib.error.URLError, TimeoutError):
                    time.sleep(min(0.2, remaining(deadline)))
            # One user message works with Gemma's template as well as Qwen/DeepSeek.
            prompt = 'Original task:\n' + task + '\n\nYour role:\n' + agent['role']
            prompt += '\n\nPrevious agent output:\n' + (previous_output if previous_output is not None else '(none)')
            prompt += '\n\nProduce the answer requested by the original task. Do not add commentary outside its requested format.'
            body = json.dumps({
                'model': agent['model'], 'messages': [{'role': 'user', 'content': prompt}],
                'temperature': settings['temperature'], 'seed': settings['seed'],
                'max_tokens': settings['maxTokens'], 'stream': False,
                'cache_prompt': False,
            }).encode('utf-8')
            request = urllib.request.Request('http://127.0.0.1:8080/v1/chat/completions', data=body, headers={'Content-Type': 'application/json'})
            try:
                with HTTP.open(request, timeout=remaining(deadline)) as response:
                    raw = response.read(1_000_001)
                    if len(raw) > 1_000_000:
                        raise RuntimeLimitation('MODEL_OUTPUT_TOO_LARGE', 'Inference response exceeded the output limit.')
                    completion = json.loads(raw)
            except urllib.error.HTTPError as error:
                raise RuntimeLimitation('MODEL_REQUEST_FAILED', 'Local inference returned HTTP ' + str(error.code)) from error
            choice = completion['choices'][0]
            if choice.get('finish_reason') == 'length':
                raise RuntimeLimitation('OUTPUT_TOKEN_LIMIT', 'The model exhausted the fixed output-token budget before completing an answer.')
            output = choice['message'].get('content')
            if not isinstance(output, str) or not output.strip():
                raise RuntimeLimitation('MODEL_OUTPUT_MISSING', 'The model returned no final answer; reasoning-only output is not a completed answer.')
            if len(output) > 100000:
                raise RuntimeLimitation('MODEL_OUTPUT_TOO_LARGE', 'Model answer exceeded the output limit.')
            return output
        finally:
            stop_process(process)


def run(payload):
    manifest = preflight(payload)
    started = time.monotonic()
    deadline = started + payload['settings']['timeoutSeconds']
    agents = []
    output = None
    error = None
    try:
        for agent in payload['architecture']['agents']:
            agent_started = time.monotonic()
            output = infer(agent, payload['benchmarkCase']['task'], output, payload['settings'], deadline)
            agents.append({'model': agent['model'], 'role': agent['role'], 'output': output,
                           'elapsedMs': round((time.monotonic() - agent_started) * 1000, 3)})
    except RuntimeLimitation as failure:
        error = {'code': failure.code, 'message': str(failure)}
    except (TimeoutError, subprocess.TimeoutExpired):
        error = {'code': 'BENCHMARK_TIMEOUT', 'message': 'The fixed execution timeout elapsed.'}
    except Exception:
        error = {'code': 'INFERENCE_FAILED', 'message': 'Local model inference failed. Inspect the sandbox runtime configuration.'}
    write_json('execution.json', {
        'protocolVersion': 1, 'elapsedMs': round((time.monotonic() - started) * 1000, 3),
        'output': output, 'agents': agents, 'error': error, 'modelManifest': manifest,
    })
    return 1 if error else 0


def evaluate_output(output, evaluator):
    if evaluator['type'] == 'exact_match':
        checks = [{'name': 'exact_match (outer whitespace ignored)', 'passed': output.strip() == evaluator['expected'].strip()}]
    elif evaluator['type'] == 'contains_all':
        checks = [{'name': 'contains[' + str(i) + ']', 'passed': value in output} for i, value in enumerate(evaluator['expected'])]
    elif evaluator['type'] == 'json_exact':
        try:
            parsed = json.loads(output, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
            checks = [{'name': 'valid_json', 'passed': True}, {'name': 'json_exact', 'passed': json.dumps(parsed, sort_keys=True, ensure_ascii=False) == json.dumps(evaluator['expected'], sort_keys=True, ensure_ascii=False)}]
        except (ValueError, TypeError):
            checks = [{'name': 'valid_json', 'passed': False}]
    else:
        raise RuntimeLimitation('EVALUATOR_UNSUPPORTED', 'Unknown evaluator type.')
    return {'passed': all(check['passed'] for check in checks), 'checks': checks}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['preflight', 'run', 'evaluate'])
    parser.add_argument('input')
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding='utf-8'))
    try:
        if args.mode == 'preflight':
            preflight(payload)
            return 0
        if args.mode == 'run':
            return run(payload)
        execution = json.loads(Path('execution.json').read_text(encoding='utf-8'))
        if execution['error'] is not None or not isinstance(execution['output'], str):
            raise RuntimeLimitation('NO_MODEL_OUTPUT', 'Cannot evaluate an incomplete execution.')
        result = evaluate_output(execution['output'], payload['benchmarkCase']['evaluator'])
        write_json('evaluation.json', result)
        return 0 if result['passed'] else 1
    except RuntimeLimitation as error:
        print(json.dumps({'code': error.code, 'message': str(error)}))
        return 2
    except Exception:
        print(json.dumps({'code': 'RUNNER_FAILED', 'message': 'Runner input or runtime is invalid.'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
