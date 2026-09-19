# Benchmark runtime / infrastructure

프런트엔드와 최적화 엔진에 독립적인 TypeScript HTTP 서비스입니다. Daytona 공식 SDK `@daytona/sdk`를 사용합니다. API 키 없이 서버와 테스트를 실행할 수 있지만, 실제 벤치마크는 키와 준비된 모델 스냅샷이 있어야 합니다. 데모 실행이나 임의의 측정값을 반환하지 않습니다.

## 빠른 시작

Node.js 22 이상, pnpm, Python 3.11 이상(러너 테스트용)이 필요합니다. 프로젝트 루트가 아닌 이 디렉터리에서 실행합니다.

```powershell
cd runtime-infra
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm dev
```

기본 주소: `http://127.0.0.1:3001`. `.env`에 키를 추가한 뒤 서버를 재시작합니다. 기본 상태에서 세 공급자는 모두 `NOT_CONFIGURED`입니다. `/health`는 공급자의 준비 여부가 아닌 HTTP 서비스의 생존 여부만 반환합니다.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/providers
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3001/api/benchmark/run?wait=true' -ContentType 'application/json' -InFile examples/run.json
```

키가 없으면 두 번째 요청은 HTTP 503과 명시적인 `PROVIDER_NOT_CONFIGURED` 결과를 반환합니다. 기본 비동기 요청은 HTTP 202 이후 상태 조회에서 `FAILED`가 됩니다.

## 환경변수

| 변수 | 기본값 / 용도 |
| --- | --- |
| `DAYTONA_API_KEY` | 서버 전용 Daytona 키. 없으면 `NOT_CONFIGURED` |
| `DAYTONA_API_URL` | `https://app.daytona.io/api` |
| `DAYTONA_TARGET` | `us` |
| `DAYTONA_SNAPSHOT` | 모델과 런타임이 포함된 **불변 snapshot ID**. 이름은 거부 |
| `BENCHMARK_TIMEOUT_SECONDS` | `300`. 모든 아키텍처에 동일한 추론 시간 제한 |
| `BENCHMARK_MAX_TOKENS` | `512`. 모든 에이전트에 동일한 생성 토큰 제한 |
| `DAYTONA_PROVISION_TIMEOUT_SECONDS` | `120` |
| `HOST` / `PORT` | `127.0.0.1` / `3001` |
| `RUNTIME_API_TOKEN` | 선택. 루프백 이외의 주소로 바인딩할 때 필수. `/health` 외 모든 API에 Bearer 인증 |
| `NOSANA_API_KEY` / `NOSANA_MARKET_ID` | 미래 어댑터의 설정 자리. 값만 넣어도 실행 가능 상태로 바뀌지 않음 |
| `DNSIMPLE_TOKEN` / `DNSIMPLE_ACCOUNT_ID` | DNSimple sandbox account token과 일치하는 account ID |
| `DNSIMPLE_ENVIRONMENT` | `sandbox`. `production`이면 이 MVP에서는 `ERROR`, 쓰기 미지원 |
| `BENCHMARK_IMAGE` | 스냅샷 생성 전용 `registry/image@sha256:...` |
| `BENCHMARK_SNAPSHOT_NAME` | 생성 시 이름, 기본 `benchmark-lab-v1` |

자격증명은 서버 프로세스에만 보관합니다. 샌드박스로 키나 `.env`를 복사하지 않으며, 서버는 원본 SDK 예외나 요청 본문을 응답/로그에 출력하지 않습니다. 브라우저 직접 CORS 허용은 하지 않았습니다. 프런트엔드의 동일 출처 프록시를 사용하세요.

## 실제 Daytona 실행 준비

1. `models/README.md`에 명시한 세 GGUF 모델을 준비합니다. 가능하면 동일한 양자화(Q4_K_M 등)를 사용하고 원본 저장소·revision·라이선스·양자화를 기록합니다.
2. Docker가 있는 머신에서 이미지를 **한 번** 빌드합니다.

   ```sh
   docker build --platform linux/amd64 -f infra/Dockerfile -t YOUR_REGISTRY/benchmark-lab:v1 .
   docker push YOUR_REGISTRY/benchmark-lab:v1
   ```

3. 레지스트리에 기록된 digest를 `BENCHMARK_IMAGE`에 설정하고 `DAYTONA_API_KEY`를 넣습니다.
4. `pnpm snapshot:create`로 4 CPU / 16 GiB RAM / 30 GiB disk 스냅샷을 생성합니다. 출력된 ID를 `DAYTONA_SNAPSHOT`에 설정합니다. 이미지에 접근할 수 있는 레지스트리여야 합니다.
5. `pnpm smoke:daytona`로 생성 → 파일 업로드 → 실제 Python 명령 → 결과 다운로드 → 삭제를 확인합니다. 스모크 테스트는 모델 추론을 검증하지 않습니다.
6. `examples/run.json`으로 모델 한 개를 실행한 뒤 `examples/batch.json`의 세 설정을 실행합니다.

Dockerfile은 llama.cpp 소스 commit을 고정하고 CPU용 `llama-server`를 빌드합니다. 이미지 빌드 때 각 모델의 SHA-256과 바이트 크기를 manifest에 기록합니다. 이후 매 벤치마크는 같은 스냅샷을 사용하며 모델이나 의존성을 다운로드하지 않습니다. Python 러너는 표준 라이브러리만 사용합니다. Node는 코딩 평가용으로 이미지에 포함합니다.

Daytona volumes도 모델 가중치 재사용에 사용할 수 있지만, 이 MVP는 mutable 공유 캐시 대신 세 모델을 같은 스냅샷에 포함해 비교 조건을 고정합니다. 새 이미지·새 모델·새 의존성을 사용하면 새 스냅샷과 새 실험으로 취급합니다. 베이스 이미지 태그는 빌드마다 달라질 수 있으므로, 비교에 사용하는 **완성 이미지 digest와 snapshot ID**를 고정해야 합니다.

## API 계약

| 메서드 / 경로 | 응답 |
| --- | --- |
| `GET /api/providers` | `{providers:[{id,kind,status,reason,capabilities}]}` |
| `GET /api/benchmark/policy` | 고정 토큰·시간·샘플링·동시 실행 정책 |
| `POST /api/benchmark/run` | HTTP 202: `{id,status,statusUrl,history,result:null,...}` |
| `POST /api/benchmark/run?wait=true` | 최종 `BenchmarkResult`. 측정 가능 결과 200, 인프라/미설정 실패 503 |
| `GET /api/benchmark/runs/:id` | 상태·이력·최종 결과 |
| `POST /api/benchmark/batch` | 최대 3 아키텍처 × 10 케이스, HTTP 202 `{batchId,statusUrl,runs}` |
| `GET /api/benchmark/batches/:id` | `{batchId,completed,runs}` |
| `POST /api/benchmark/engine/run` | 엔진의 원본 `{architecture,benchmarkCase}`를 변환, HTTP 202 |

기본 요청:

```json
{
  "provider": "daytona",
  "architecture": {
    "id": "qwen-single",
    "agents": [{"model":"qwen3-4b","role":"Solve the task. Return only the answer."}]
  },
  "benchmarkCase": {
    "id":"answer",
    "task":"Return only the number that equals 6 * 7.",
    "evaluator":{"type":"exact_match","expected":"42"}
  }
}
```

`provider`는 `daytona` 또는 `nosana`이며 기본값은 `daytona`입니다. 모델 ID는 `qwen3-4b`, `deepseek-r1-distill-qwen-7b`, `gemma-3-4b`. 에이전트 1–3개를 배열 순서로 실행합니다. 각 에이전트에는 원래 과제, 자신의 역할, 직전 에이전트 출력만 전달합니다. 반복 자율 루프나 장기 메모리는 없습니다.

배치 요청은 `{provider?, architectures:[...], benchmarkCases:[...]}`입니다. 중복 ID와 과도한 크기를 거부합니다. 작업은 한 번에 하나씩 실행하므로 샌드박스 수나 로컬 큐가 무제한 증가하지 않습니다.

상태: `QUEUED → PROVISIONING → PREPARING → RUNNING → EVALUATING → COMPLETED/FAILED`. 설정/프로비저닝/실행 실패 시 앞 단계에서 바로 `FAILED`가 될 수 있습니다. `COMPLETED`는 평가 통과를 뜻하며, 평가 실패는 실제로 측정된 `FAILED`입니다.

### 평가기

- `exact_match`: 앞뒤 공백을 제거한 정확한 문자열 비교.
- `contains_all`: 지정된 비어 있지 않은 문자열이 모두 포함되었는지 검사.
- `json_exact`: 유효한 JSON이며 기대값과 정확히 일치하는지 검사. Markdown/추가 키는 허용하지 않음.
- `node_tests`: 아래 코딩 계약. 모델의 자기평가를 사용하지 않음.

```json
{
  "type":"node_tests",
  "files":{"solution.cjs":"module.exports = x => x - 1;"},
  "editableFile":"solution.cjs",
  "testFiles":{"solution.test.cjs":"const test=require('node:test'); const assert=require('node:assert/strict'); test('plusOne',()=>assert.equal(require('./solution.cjs')(1),2));"},
  "testFile":"solution.test.cjs",
  "expectedTests":1
}
```

최종 모델 출력으로 `editableFile` 하나만 교체합니다. 파일 경로를 제한하고 신뢰된 테스트 파일과 입력 파일의 겹침을 거부합니다. `node --check`(5초), `node --test`(15초)를 실행합니다. 테스트의 stdout을 TAP 결과로 믿지 않고 부모 프로세스의 Node 테스트 이벤트에서 수집합니다. 테스트가 실행되지 못했거나 유효한 결과를 얻지 못한 항목은 `skipped`, 평가 상태는 `TIMEOUT`/`ERROR`로 표시합니다. 모델 코드 실행은 외부 네트워크가 차단된 일회용 Daytona 샌드박스 안에서만 이루어집니다. 로컬 테스트는 저장소에 작성된 소규모 고정 테스트 코드만 실행합니다.

## 결과 및 측정 범위

`src/contracts.ts`가 정확한 타입 정의입니다. 주요 필드:

- `measurement`: `MEASURED` 또는 `NOT_AVAILABLE`. Daytona 인프라 실패, 손상된 결과 파일, 누락된 평가 증거는 `NOT_AVAILABLE`.
- `success`, `status`, `error`: 실제 평가/실행 결과. 정상 종료는 자동으로 과제 성공을 의미하지 않음.
- `metrics.elapsedMs`: 샌드박스의 monotonic clock으로 측정한 전체 에이전트 실행 시간. 모델 로딩/종료 포함, 프로비저닝·사전검사·평가 제외.
- `metrics.totalElapsedMs`: 서버가 측정한 전체 lifecycle. 프로비저닝, 준비, 실행, 평가, 파일 수집, 삭제 포함. 큐 대기 제외.
- `metrics.exitStatus`: 실제 추론 러너의 종료 코드. 명령을 실행/수집하지 못하면 null.
- `metrics.evaluatorExitStatus`: 평가 러너 종료 코드. `caseEvidence.buildExitStatus`와 `testExitStatus`는 실제 Node 명령의 종료 코드.
- `memoryBytes`: Linux `getrusage(RUSAGE_CHILDREN).ru_maxrss`로 수집한 종료된 llama-server 자식 프로세스 최대 RSS(bytes). 순차 실행 프로세스의 최대치이며 전체 컨테이너 메모리나 할당 RAM이 아님. 미수집 시 null.
- `cpuUsagePercent`, `gpuUsagePercent`: 미수집이므로 null. CPU/GPU 사용량이나 비용을 추정값으로 채우지 않음.
- `evaluator`, `caseEvidence`, `agents`, `output`: 실제 체크, 코딩 테스트 수, 에이전트별 출력/시간.
- `provenance`: snapshot ID, sandbox ID, 환경/fixture/architecture/runner 해시, 실제 자원 할당, timeout, 토큰 제한, 모델 파일 manifest. 할당된 RAM은 사용량이 아님.
- `cleanup`: 삭제 확인 여부. 실패하면 `FAILED`와 sandbox ID를 반환하고 종료 시 재시도. 생성 응답을 잃으면 실행별 고유 이름으로 조회·삭제를 시도. 삭제 실패 가능성에 대비해 auto-stop, auto-delete, wall-clock TTL도 설정.

SDK 연결 상태 `LIVE`는 실제 읽기 요청 성공을 뜻합니다. 모델 파일 준비 여부는 샌드박스의 사전검사에서 따로 확인합니다. CPU 추론 속도, 모델의 추론 토큰 사용량, 문맥 길이 때문에 시간/토큰 예산을 넘을 수 있으며 이를 실제 실패로 기록합니다. 특히 512 토큰은 추론 모델에 작을 수 있습니다. 실험 도중 특정 모델만 예산을 바꾸지 마세요.

## 벤치마크 엔진 연결

`POST /api/benchmark/engine/run`은 `benchmark-engine`의 에이전트 순서·역할·명령과 코딩 fixture를 변환합니다. 원본 아키텍처의 SHA-256을 보존하며 임의 명령이나 병렬 토폴로지는 거부합니다. 현재는 JavaScript 파일 하나를 수정하는 케이스만 지원합니다.

요청된 자원·시간·토큰 제한이 고정 랩 정책과 다르면 `COMPUTE_POLICY_MISMATCH`로 거부합니다. 현재 엔진의 `standard` 정책과 연결하려면 4 CPU/16 GiB 스냅샷, `BENCHMARK_TIMEOUT_SECONDS=40`, `BENCHMARK_MAX_TOKENS=768`을 사용하세요. 다른 정책을 조용히 대체하거나 기존 예측 아키텍처에 잘못된 측정 라벨을 붙이지 않습니다.

호출자는 각 아키텍처의 **모든 케이스**를 실행하고 결과가 `MEASURED`이며 provenance가 일치하는지 확인한 후, 엔진의 `createMeasuredResult`에 `caseEvidence`와 실제 lifecycle 시간 합계를 전달해야 합니다. 인프라 실패를 임의의 0점 측정으로 만들면 안 됩니다. 추론이 실제 시작된 후 실패했다면 실행된 시간 및 실행되지 않은 테스트 수가 제공됩니다. 전체 workload 집계·추천 호출·UI 연결은 호출자 소유이며 이 서비스는 최적화를 구현하지 않습니다.

## Nosana / DNSimple

`ComputeProvider`는 `getStatus`, `getCapabilities`, `runBenchmark`, `cleanup`을 정의합니다. Nosana는 같은 러너/fixture를 GPU job으로 제출하고 artifact를 회수할 향후 어댑터입니다. 현재 job submit/poll/download/cancel은 미구현이며 키를 넣어도 `NOT_CONFIGURED`. 실제 Nosana 인증 방식/API 계약은 연결 시점에 확인해야 합니다.

`NetworkProvider`는 벤치마크에서 분리했습니다. DNSimple은 키가 있으면 **sandbox** `/v2/whoami`로 account identity를 검증할 수 있습니다. 레코드 생성/변경 및 production promotion은 미구현입니다. 미래 연결점은 `promote({architectureId, zone, hostname, deploymentHostname})`입니다. 운영 DNS를 수정하는 경로는 없습니다.

## 검증과 한계

```sh
pnpm test
pnpm test:runner
pnpm build
pnpm smoke:daytona
pnpm start
```

테스트의 SDK doubles는 생명주기·실패·정리·공정한 환경 설정을 검증하기 위한 것으로, 공급자 연동 성공의 증거가 아닙니다. 실제 로컬 Node syntax/test 평가도 따로 실행합니다.

처음에는 키가 없어 live smoke가 `SKIPPED`였지만, 작업 도중 `.env`에 Daytona 설정이 추가되어 **실제 스모크 테스트가 통과했습니다**. 생성, 파일 업로드, Python 명령, 결과 다운로드, 삭제 확인까지 검증했습니다. 현재 `DAYTONA_SNAPSHOT`, GGUF 파일, Docker daemon은 없어 모델 추론과 스냅샷 이미지 빌드는 미검증입니다. `VALIDATION.md`에 최종 실행 결과를 기록합니다.

큐/결과는 메모리에만 저장하며 최대 200개입니다. 서버 재시작 시 기록이 사라지고 오래된 완료 작업은 새 작업을 위해 제거됩니다(배치는 전체 단위로 제거). 멀티프로세스/영구 저장/재시작 복구는 구현하지 않았습니다. 강제 종료 시 TTL 외에는 즉시 삭제를 보장할 수 없습니다. 결과 시간은 특정 CPU 샌드박스에서의 값이며 GPU 속도로 일반화하면 안 됩니다.

공식 참고: [Daytona SDK](https://www.daytona.io/docs/en/typescript-sdk/), [Snapshots](https://www.daytona.io/docs/snapshots/), [Volumes](https://www.daytona.io/docs/volumes/), [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [DNSimple sandbox](https://developer.dnsimple.com/sandbox/), [Nosana jobs](https://learn.nosana.com/api/jobs.html), [Node test events](https://github.com/nodejs/node/blob/v22.x/doc/api/test.md).
