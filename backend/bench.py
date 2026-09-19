"""
Nosana 로컬 모델 3개 x HumanEval 문제 -> Daytona 샌드박스에서 채점 -> results.jsonl

필요: pip install daytona openai anthropic
환경변수: DAYTONA_API_KEY (필수), ANTHROPIC_API_KEY (있으면 Claude 품질 채점)
사용법 (humaneval_all.json 필요):
  python3 bench.py full   # 발표용 측정: 5문제, 60초 제한 -> results_full.jsonl
  python3 bench.py warm   # 시연 직전 예열
  python3 bench.py live   # 무대 시연: 짧은 4문제, 문제당 15초 제한 -> results_live.jsonl
"""
import json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI
from daytona import Daytona, CreateSandboxFromSnapshotParams

# ====== 여기만 채우세요 (curl <URL>/v1/models 로 모델명 확인) ======
MODELS = {
    "gemma4-e2b":  {"base_url": "https://5vx3tKxSRZwzg3SfRQ8pAPid6aUyznW2FnZeCUkkNYDs.node.k8s.prd.nos.ci/v1", "model": "gemma4:e2b"},
    "qwen3.5-9b":  {"base_url": "https://4BUrPw8sui86nvQPXHYCrpUfecMTTYdtQ6x4jGPEjnh3.node.k8s.prd.nos.ci/v1", "model": "qwen3.5:9b"},
    "gpt-oss-20b": {"base_url": "https://Bfgtcmr6BEf2Da9TYHW3xQXm9ApHPYQJmbtn14fjsWaK.node.k8s.prd.nos.ci/v1", "model": "gpt-oss:20b"},
}
# ==================================================================

# 실행 모드: full(발표용 측정) / live(무대 시연, 10초) / warm(시연 직전 예열)
MODE = sys.argv[1] if len(sys.argv) > 1 else "full"
FULL_TASKS = ["HumanEval/0", "HumanEval/1", "HumanEval/10", "HumanEval/145", "HumanEval/32"]
LIVE_TASKS = ["HumanEval/53", "HumanEval/23", "HumanEval/45", "HumanEval/7"]  # 짧은 문제 4개
TIMEOUT = 15 if MODE == "live" else 60          # 문제당 제한, 넘으면 탈락(DNF)
OUT_FILE = f"results_{MODE}.jsonl"
_all = {r["task_id"]: r for r in json.load(open("humaneval_all.json"))}
PROBLEMS = [_all[t] for t in (LIVE_TASKS if MODE == "live" else FULL_TASKS)]
SYSTEM = ("Complete the given Python function. Output the full function definition "
          "including the signature. Output only code, no explanation.")

def extract_code(text, problem):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    m = re.search(r"```(?:python)?\n(.*?)```", text, re.S)
    code = (m.group(1) if m else text).strip("\n").rstrip()
    target = f"def {problem['entry_point']}"
    prefix = problem["prompt"][:problem["prompt"].index(target)]  # import + 헬퍼 함수
    if target in code:
        code = prefix + "\n\n" + code
    else:
        code = problem["prompt"] + code  # 몸통만 뱉은 경우
    lines = code.splitlines()  # __future__ import는 반드시 맨 위로
    future = [l for l in lines if l.startswith("from __future__")]
    return "\n".join(future + [l for l in lines if not l.startswith("from __future__")])

def ask(cfg, problem):
    client = OpenAI(base_url=cfg["base_url"], api_key="nosana", timeout=TIMEOUT, max_retries=0)
    t0 = time.time()
    r = client.chat.completions.create(
        model=cfg["model"],
        messages=[{"role": "system", "content": SYSTEM},
                  {"role": "user", "content": problem["prompt"]}],
    )
    ms = int((time.time() - t0) * 1000)
    tokens = r.usage.completion_tokens if r.usage else None
    return r.choices[0].message.content or "", ms, tokens

def judge(problem, code):
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    import anthropic
    try:
        msg = anthropic.Anthropic().messages.create(
            model="claude-sonnet-5", max_tokens=10,
            system="Rate the code's readability and structure from 1 to 10. Output only the number.",
            messages=[{"role": "user", "content": f"Problem:\n{problem['prompt']}\n\nCode:\n{code}"}],
        )
        return int(re.search(r"\d+", msg.content[0].text).group())
    except Exception:
        return None

RUN_START = time.time()

def solve_one(name, cfg, sandbox, p):
    row = {"model": name, "task_id": p["task_id"], "passed": False,
           "time_ms": None, "quality": None, "tokens": None, "error": None,
           "start_s": round(time.time() - RUN_START, 2), "end_s": None}
    try:
        text, ms, tokens = ask(cfg, p)
        row.update(time_ms=ms, tokens=tokens)
        code = extract_code(text, p)
        row["code"] = code
        test = code + "\n\n" + p["test"] + f"\ncheck({p['entry_point']})\nprint('PASS')"
        res = sandbox.process.code_run(test)
        row["passed"] = res.exit_code == 0 and "PASS" in (res.result or "")
        if not row["passed"]:
            row["error"] = (res.result or "")[-200:]
        row["quality"] = judge(p, code)
    except Exception as e:
        row["error"] = str(e)[:200]
    row["end_s"] = round(time.time() - RUN_START, 2)  # 경주 리플레이용 타임라인
    mark = "O" if row["passed"] else "X"
    print(f"[{row['end_s']:6.1f}s] {name:12s} {p['task_id']:14s} {mark}  {row['time_ms'] or 'DNF'}ms", flush=True)
    return row

def run_model(name, cfg, sandbox):
    try:
        if MODE == "live":  # 같은 GPU에서 대기열이 생기지 않게 문제를 차례로
            return [solve_one(name, cfg, sandbox, p) for p in PROBLEMS]
        with ThreadPoolExecutor(len(PROBLEMS)) as ex:
            return list(ex.map(lambda p: solve_one(name, cfg, sandbox, p), PROBLEMS))
    finally:
        sandbox.delete()

if __name__ == "__main__":
    if MODE == "warm":  # 모델을 GPU에 올려두기 (Ollama는 약 5분 쉬면 내려감)
        for name, cfg in MODELS.items():
            t0 = time.time()
            OpenAI(base_url=cfg["base_url"], api_key="nosana", timeout=180).chat.completions.create(
                model=cfg["model"], messages=[{"role": "user", "content": "hi"}], max_tokens=5)
            print(f"{name:14s} ready ({time.time()-t0:.1f}s)")
        sys.exit()

    daytona = Daytona()
    with ThreadPoolExecutor(len(MODELS)) as ex:  # 샌드박스를 먼저 띄워두고
        boxes = list(ex.map(lambda _: daytona.create(
            CreateSandboxFromSnapshotParams(language="python", ephemeral=True)), MODELS))
    print("sandboxes ready. 출발!", flush=True)
    RUN_START = time.time()                       # 여기서부터 경주 시간 측정
    with ThreadPoolExecutor(len(MODELS)) as ex:  # 모델 3개 동시 경주
        futures = [ex.submit(run_model, n, c, b) for (n, c), b in zip(MODELS.items(), boxes)]
        all_rows = [r for f in futures for r in f.result()]

    with open(OUT_FILE, "w") as f:
        for r in all_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\n=== 요약 ({MODE}, 제한 {TIMEOUT}s, 전체 {time.time()-RUN_START:.1f}s) -> {OUT_FILE} ===")
    for name in MODELS:
        rs = [r for r in all_rows if r["model"] == name]
        passed = sum(r["passed"] for r in rs)
        times = [r["time_ms"] for r in rs if r["time_ms"]]
        avg = int(sum(times) / len(times)) if times else 0
        print(f"{name:14s} 통과 {passed}/{len(rs)}  평균 {avg}ms")