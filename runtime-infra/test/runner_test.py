import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import os

spec = importlib.util.spec_from_file_location('runner', Path(__file__).resolve().parents[1] / 'runtime' / 'runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def test_evaluators_use_real_output(self):
        self.assertTrue(runner.evaluate_output(' 42\n', {'type': 'exact_match', 'expected': '42'})['passed'])
        self.assertFalse(runner.evaluate_output('43', {'type': 'exact_match', 'expected': '42'})['passed'])
        self.assertTrue(runner.evaluate_output('a b', {'type': 'contains_all', 'expected': ['a', 'b']})['passed'])
        self.assertFalse(runner.evaluate_output('a', {'type': 'contains_all', 'expected': ['a', 'b']})['passed'])
        self.assertTrue(runner.evaluate_output('{"answer":42}', {'type': 'json_exact', 'expected': {'answer': 42}})['passed'])
        self.assertFalse(runner.evaluate_output('{"answer":true}', {'type': 'json_exact', 'expected': {'answer': 1}})['passed'])
        self.assertFalse(runner.evaluate_output('not json', {'type': 'json_exact', 'expected': {}})['passed'])
        self.assertFalse(runner.evaluate_output('NaN', {'type': 'json_exact', 'expected': {}})['passed'])

    def test_missing_llama_is_explicit(self):
        with patch.object(runner, 'LLAMA_SERVER', '/missing/llama-server'):
            with self.assertRaises(runner.RuntimeLimitation) as error:
                runner.preflight({'architecture': {'agents': []}})
            self.assertEqual(error.exception.code, 'LLAMA_NOT_INSTALLED')

    def test_sequential_agents_receive_original_task_role_and_previous_output(self):
        calls = []
        def unit_test_inference(agent, task, previous, settings, deadline):
            calls.append((task, agent['role'], previous))
            return 'output-' + agent['role']
        payload = {'architecture': {'agents': [{'model': 'qwen3-4b', 'role': role} for role in ['A', 'B', 'C']]}, 'benchmarkCase': {'task': 'original'}, 'settings': {'timeoutSeconds': 10}}
        before = os.getcwd()
        try:
            with tempfile.TemporaryDirectory() as directory:
                os.chdir(directory)
                with patch.object(runner, 'preflight', return_value={}), patch.object(runner, 'infer', side_effect=unit_test_inference):
                    self.assertEqual(runner.run(payload), 0)
                artifact = json.loads(Path('execution.json').read_text(encoding='utf-8'))
                self.assertEqual(artifact['output'], 'output-C')
                self.assertEqual(calls, [('original', 'A', None), ('original', 'B', 'output-A'), ('original', 'C', 'output-B')])
                self.assertGreaterEqual(artifact['elapsedMs'], 0)
                os.chdir(before)
        finally:
            os.chdir(before)

    def test_timeout_stops_later_agents_and_records_failure(self):
        payload = {'architecture': {'agents': [{'model': 'qwen3-4b', 'role': 'A'}] * 3}, 'benchmarkCase': {'task': 'original'}, 'settings': {'timeoutSeconds': 10}}
        before = os.getcwd()
        try:
            with tempfile.TemporaryDirectory() as directory:
                os.chdir(directory)
                with patch.object(runner, 'preflight', return_value={}), patch.object(runner, 'infer', side_effect=runner.RuntimeLimitation('BENCHMARK_TIMEOUT', 'deadline')) as inference:
                    self.assertEqual(runner.run(payload), 1)
                    self.assertEqual(inference.call_count, 1)
                artifact = json.loads(Path('execution.json').read_text(encoding='utf-8'))
                self.assertEqual(artifact['error']['code'], 'BENCHMARK_TIMEOUT')
                self.assertIsNone(artifact['output'])
                os.chdir(before)
        finally:
            os.chdir(before)


if __name__ == '__main__':
    unittest.main()
