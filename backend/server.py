"""
프론트용 API 서버: 문제를 받으면 -> Nosana 모델 3개가 동시에 풀고 -> Daytona 샌드박스에서 채점

설치: pip3 install fastapi uvicorn python-multipart
실행: python3 -m uvicorn server:app --port 8000
(bench.py, humaneval_all.json 과 같은 폴더에서)

POST /run
  {"task_id": "HumanEval/53"}                                   # HumanEval 문제 (테스트로 채점)
  {"prompt": "...", "test": "...", "entry_point": "func_name"}  # 직접 만든 문제 + 테스트
  {"prompt": "피보나치 10번째 수를 출력하는 코드"}                 # 테스트 없이: 실행 성공 여부 + 출력 비교
POST /upload     문제 파일 업로드 (input_live.json 형식) -> 한 번에 채점
POST /run_batch  {"problems": [...]}
GET /problems   시연용/측정용 문제 목록
"""
import json, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

_argv = sys.argv
sys.argv = ["bench.py", "full"]
import bench  # MODELS, ask, extract_code, solve_one 재사용
sys.argv = _argv

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from daytona import Daytona, CreateSandboxFromSnapshotParams

bench.TIMEOUT = 20  # 문제당 제한(초), 넘으면 DNF

app = FastAPI(title="Local model race")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

daytona = Daytona()
BOXES = {}  # 모델별 Daytona 샌드박스 (서버 켤 때 미리 생성해서 재사용)


def make_box(name):
    BOXES[name] = daytona.create(CreateSandboxFromSnapshotParams(
        language="python", auto_stop_interval=0))
    return BOXES[name]


@app.on_event("startup")
def startup():
    with ThreadPoolExecutor(len(bench.MODELS)) as ex:
        list(ex.map(make_box, bench.MODELS))
    print("Daytona sandboxes ready:", list(BOXES))


@app.on_event("shutdown")
def shutdown():
    for b in BOXES.values():
        try:
            b.delete()
        except Exception:
            pass


class RunReq(BaseModel):
    task_id: Optional[str] = None
    prompt: Optional[str] = None
    test: Optional[str] = None
    entry_point: Optional[str] = None


def solve_free(name, cfg, sandbox, prompt):
    """테스트 없는 자유 문제: 코드를 실행해서 에러 없이 도는지 + 출력"""
    row = {"model": name, "task_id": "custom", "passed": False, "time_ms": None,
           "tokens": None, "error": None, "output": None,
           "start_s": round(time.time() - bench.RUN_START, 2), "end_s": None}
    try:
        text, ms, tokens = bench.ask(cfg, {"prompt": prompt})
        row.update(time_ms=ms, tokens=tokens)
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
        m = re.search(r"```(?:python)?\n(.*?)```", text, re.S)
        code = (m.group(1) if m else text).strip()
        row["code"] = code
        res = sandbox.process.code_run(code)
        row["passed"] = res.exit_code == 0
        row["output"] = (res.result or "")[-500:]
        if not row["passed"]:
            row["error"] = row["output"][-200:]
    except Exception as e:
        row["error"] = str(e)[:200]
    row["end_s"] = round(time.time() - bench.RUN_START, 2)
    return row


@app.post("/run")
def run(req: RunReq):
    if req.task_id:
        problem = bench._all[req.task_id]
    elif req.prompt and req.test and req.entry_point:
        problem = {"task_id": "custom", "prompt": req.prompt,
                   "test": req.test, "entry_point": req.entry_point}
    else:
        problem = None  # 테스트 없는 자유 문제

    bench.RUN_START = time.time()

    def one(item):
        name, cfg = item
        box = BOXES.get(name) or make_box(name)
        if problem:
            return bench.solve_one(name, cfg, box, problem)
        return solve_free(name, cfg, box, req.prompt)

    with ThreadPoolExecutor(len(bench.MODELS)) as ex:  # 모델 3개 동시 경주
        rows = list(ex.map(one, bench.MODELS.items()))
    return {"results": sorted(rows, key=lambda r: r["end_s"] or 1e9)}


@app.get("/problems")
def problems():
    out = []
    for f in ("problems_live.json", "problems_demo.json"):
        try:
            for p in json.load(open(f)):
                p["prompt"] = bench._all[p["task_id"]]["prompt"]
                out.append(p)
        except FileNotFoundError:
            pass
    return out


@app.get("/models")
def models():
    return list(bench.MODELS)

def run_problems(problems):
    """문제 여러 개: 모델 3개는 동시에, 각 모델은 문제를 차례로 (GPU 대기열 방지)"""
    bench.RUN_START = time.time()

    def per_model(item):
        name, cfg = item
        box = BOXES.get(name) or make_box(name)
        rows = []
        for p in problems:
            if p.get("test") and p.get("entry_point"):
                p.setdefault("task_id", p.get("name", "custom"))
                rows.append(bench.solve_one(name, cfg, box, p))
            else:
                rows.append(solve_free(name, cfg, box, p["prompt"]))
        return rows

    with ThreadPoolExecutor(len(bench.MODELS)) as ex:
        rows = [r for rs in ex.map(per_model, bench.MODELS.items()) for r in rs]
    return {"results": sorted(rows, key=lambda r: r["end_s"] or 1e9)}


class BatchReq(BaseModel):
    problems: list


@app.post("/run_batch")
def run_batch(req: BatchReq):
    """JSON으로 문제 목록 전달: {"problems": [{prompt, test, entry_point}, ...]}"""
    return run_problems(req.problems)


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    """문제 파일 업로드 (input_live.json 형식, JSON 배열 또는 JSONL)"""
    text = (await file.read()).decode("utf-8")
    try:
        problems = json.loads(text)
    except json.JSONDecodeError:
        problems = [json.loads(l) for l in text.splitlines() if l.strip()]
    if isinstance(problems, dict):
        problems = problems.get("problems", [problems])
    return run_problems(problems)


# ======================================================================
# 팀 프론트 연결용: VITE_API_BASE_URL 규격 (/benchmarks)
#   POST /benchmarks            {workload}  -> Snapshot (phase=search)
#   POST /benchmarks/{id}/run               -> Snapshot (phase=benchmark), 백그라운드 실행
#   GET  /benchmarks/{id}                   -> Snapshot (진행 중 / phase=results)
# ======================================================================
import threading, uuid

JOBS = {}
DISPLAY = {"gemma4-e2b": "Gemma 4 E2B", "qwen3.5-9b": "Qwen 3.5 9B", "gpt-oss-20b": "GPT-OSS 20B"}
PROVIDERS = [
    {"name": "Daytona", "role": "생성 코드 실행·채점 샌드박스", "connected": True},
    {"name": "Nosana", "role": "GPU 모델 추론 (RTX 3090 x3)", "connected": True},
    {"name": "DNSimple", "role": "배포 도메인 연결", "connected": False},
]


def parse_workload(text):
    """프론트 입력 -> 문제 목록. 첨부 JSON(input_live.json 형식), HumanEval/번호, 자유 텍스트 지원"""
    problems = []
    parts = re.split(r"첨부 파일: [^\n]*\n", text)
    free = parts[0].strip()
    for chunk in [text] + parts[1:]:
        try:
            data = json.loads(chunk.strip())
        except Exception:
            continue
        if isinstance(data, dict):
            data = data.get("problems", [data])
        if isinstance(data, list):
            problems += [p for p in data if isinstance(p, dict) and p.get("prompt")]
        if chunk is text and problems:
            free = ""
            break
    for tid in re.findall(r"HumanEval/\d+", free):
        if tid in bench._all:
            problems.append(bench._all[tid])
    if problems:
        free = ""
    for i, p in enumerate(problems):
        p.setdefault("task_id", p.get("name") or f"custom-{i+1}")
    if not problems and not free:
        problems = [bench._all[t] for t in bench.LIVE_TASKS]
    return problems, free


def _cfg(job, name):
    rows = job["rows"][name]
    total = len(job["problems"]) or 1
    done = len(rows)
    passed = sum(r["passed"] for r in rows)
    q = round(100 * passed / total, 1) if done else 0.0
    times = [r["time_ms"] for r in rows if r["time_ms"]]
    lat = round((sum(times) / len(times)) / 1000, 1) if times else (float(bench.TIMEOUT) if done else 0.0)
    toks = [r["tokens"] for r in rows if r.get("tokens")]
    finished = job["phase"] != "search" and done >= total
    status = "queued" if job["phase"] == "search" else ("completed" if finished else "running")
    graded = bool(job["problems"] and job["problems"][0].get("test"))
    what = "단위 테스트 통과" if graded else "코드 실행 성공(테스트 없음)"
    c = {
        "id": name, "name": DISPLAY.get(name, name),
        "topology": [{"model": DISPLAY.get(name, name), "role": "solver"}],
        "compute": f"NVIDIA RTX 3090 · Nosana(Ollama) · 문제당 {bench.TIMEOUT}초 제한",
        "evidence": "measured" if finished else "predicted",
        "latency": lat, "quality": q,
        "resource": {"value": round(sum(toks) / len(toks)) if toks else 0, "unit": "생성 토큰/문제", "estimated": False},
        "tests": {"passed": passed, "total": total} if graded and done else None,
        "qualityExplanation": f"Daytona 샌드박스에서 모델이 만든 코드를 실제 실행: {what} {passed}/{total}. "
                              f"응답 시간은 문제당 평균, 제한 초과는 탈락(DNF).",
        "breakdown": [{"label": what + "률", "value": q, "weight": 1}],
        "pareto": False, "recommendation": None,
        "selectedForBenchmark": True, "status": status,
    }
    errs = [r["error"] for r in rows if r.get("error")]
    if finished and not passed and errs:
        c["error"] = errs[-1][:200]
    return c


def snapshot(job):
    cfgs = [_cfg(job, n) for n in bench.MODELS]
    snap = {
        "id": job["id"], "workload": job["workload"][:2000], "source": "api", "phase": job["phase"],
        "configurations": cfgs, "providers": PROVIDERS, "integration": "orchestrator",
        "protocol": (f"문제 {len(job['problems'])}개를 Nosana GPU의 오픈소스 모델 {len(cfgs)}개가 동시에 풀고, "
                     f"생성 코드를 Daytona 격리 샌드박스에서 실행해 채점합니다. 같은 GPU·같은 프롬프트·같은 채점 코드."),
        "candidateCatalog": [{"id": c["id"], "name": c["name"], "topology": c["name"]} for c in cfgs],
    }
    if job["phase"] == "results":
        for c in cfgs:  # 파레토: 더 정확하면서 더 빠른 모델이 없으면 True
            c["pareto"] = not any(o is not c and o["quality"] >= c["quality"] and o["latency"] <= c["latency"]
                                  and (o["quality"] > c["quality"] or o["latency"] < c["latency"]) for o in cfgs)
        perf = max(cfgs, key=lambda c: (c["quality"], -c["latency"]))
        ok = [c for c in cfgs if c["quality"] > 0] or cfgs
        eff = min(ok, key=lambda c: (c["latency"], -c["quality"]))
        maxlat = max(c["latency"] for c in cfgs) or 1
        rest = [c for c in cfgs if c is not perf and c is not eff] or cfgs
        bal = max(rest, key=lambda c: c["quality"] / 100 - 0.5 * c["latency"] / maxlat)
        recs = [("performance", perf), ("efficient", eff), ("balanced", bal)]
        for cat, c in recs:
            if c["recommendation"] is None:
                c["recommendation"] = cat
        snap["recommendations"] = [{"category": cat, "configurationId": c["id"]} for cat, c in recs]
    return snap


def _run_job(job):
    bench.RUN_START = time.time()

    def per_model(item):
        name, cfg = item
        box = BOXES.get(name) or make_box(name)
        for p in (job["problems"] or [None]):
            row = bench.solve_one(name, cfg, box, p) if p else solve_free(name, cfg, box, job["free"])
            job["rows"][name].append(row)

    with ThreadPoolExecutor(len(bench.MODELS)) as ex:
        list(ex.map(per_model, bench.MODELS.items()))
    job["phase"] = "results"


class BenchReq(BaseModel):
    workload: str


@app.post("/benchmarks")
def create_benchmark(req: BenchReq):
    problems, free = parse_workload(req.workload)
    if not problems:  # 자유 텍스트는 한 문제로 취급
        problems = [{"task_id": "custom", "prompt": free}]
    job = {"id": uuid.uuid4().hex[:8], "workload": req.workload, "problems": [p for p in problems if p.get("test")] or problems,
           "free": free, "phase": "search", "rows": {n: [] for n in bench.MODELS}}
    if not job["problems"][0].get("test"):
        job["problems"], job["free"] = [], job["problems"][0]["prompt"]
    JOBS[job["id"]] = job
    return snapshot(job)


@app.post("/benchmarks/{bid}/run")
def run_benchmark(bid: str):
    job = JOBS[bid]
    if job["phase"] == "search":
        job["phase"] = "benchmark"
        threading.Thread(target=_run_job, args=(job,), daemon=True).start()
    return snapshot(job)


@app.get("/benchmarks/{bid}")
def get_benchmark(bid: str):
    return snapshot(JOBS[bid])
