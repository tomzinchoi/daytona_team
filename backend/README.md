# Backend: 로컬 모델 실측 벤치마크

**"어떤 오픈소스 모델이 내 작업에 맞는지, 예측하지 말고 실제로 돌려보고 고른다."**

오픈소스 LLM 3개를 같은 GPU에 올리고, 같은 코딩 문제를 동시에 풀게 한 뒤,
생성된 코드를 격리된 샌드박스에서 실제로 실행해 채점합니다.

## 스폰서 연동

| 스폰서 | 역할 | 코드 위치 (`bench.py`) |
|---|---|---|
| **Nosana** | 오픈소스 LLM 3개를 동일한 NVIDIA RTX 3090에 배포하고 OpenAI 호환 API로 추론 | `MODELS`, `ask()` |
| **Daytona** | 모델마다 격리된 샌드박스를 띄워 생성된 코드를 실행하고 테스트로 채점 | `daytona.create()`, `sandbox.process.code_run()` in `solve_one()` |

## 비교 모델 (Nosana, 모두 RTX 3090)

| 모델 | 회사 | 크기 |
|---|---|---|
| Gemma 4 E2B | Google | 소형 |
| Qwen 3.5 9B | Alibaba | 중형 |
| GPT-OSS 20B | OpenAI | 대형 (MoE) |

## 문제 출처

OpenAI **HumanEval** (2021, *Evaluating Large Language Models Trained on Code*).
사람이 직접 작성한 파이썬 문제 164개, 문제마다 단위 테스트 포함, MIT 라이선스.

- `full` 모드: 난이도·유형별로 선정한 5문제 (`problems_demo.json`)
- `live` 모드: 무대 시연용 짧은 4문제 (`problems_live.json`)

## 실행

```bash
pip3 install daytona openai eval_type_backport
export DAYTONA_API_KEY=...

python3 bench.py warm   # 모델 예열
python3 bench.py live   # 시연용 4문제, 문제당 15초 제한 -> results_live.jsonl
python3 bench.py full   # 측정용 5문제, 문제당 60초 제한 -> results_full.jsonl
```

## 결과 형식 (`results_*.jsonl`, 한 줄에 하나)

```json
{"model": "gemma4-e2b", "task_id": "HumanEval/53", "passed": true,
 "time_ms": 3065, "tokens": 120, "start_s": 0.9, "end_s": 4.0, "code": "..."}
```

- `time_ms`: 응답 시간 (3D 그래프 X축)
- `passed`: 테스트 통과 여부 (Y축)
- `tokens`: 생성 토큰 수 (Z축)
- `start_s`, `end_s`: 경주 리플레이용 타임라인

## 공정성

- 세 모델 모두 같은 GPU, 같은 프롬프트, 같은 채점 코드
- 첫 호출의 모델 로딩 시간은 `warm`으로 제외
- 제한 시간을 넘으면 탈락(DNF)