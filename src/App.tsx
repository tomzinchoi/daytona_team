import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Command,
  Cpu,
  FlaskConical,
  GitBranch,
  Layers3,
  Plus,
  Radio,
  Server,
  Target,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import BenchmarkSpace from "./components/BenchmarkSpace";
import { ACTIVE_MODELS, isActiveModel } from './active-models';
import AnalysisProgress from "./components/AnalysisProgress";
import WorkloadUpload from "./components/WorkloadUpload";
import { composeWorkload, type WorkloadFile } from "./workload-files";
import { labelKo } from "./labels";
import ConfigurationDetail, {
  EvidenceBadge,
  Selection,
} from "./components/ConfigurationDetail";
import { benchmarkApi, apiConfigured } from "./api/client";
import { experimentApi } from "./api/experiments";
import {
  getProviderReports,
  searchEngineExample,
  type ProviderReport,
} from "./api/services";
import { demoSnapshot, DEMO_WORKLOAD } from "./data/demo";
import {
  topologyLabel,
  emptySnapshot,
  type Configuration,
  type Snapshot,
} from "./domain";

const HumanEvalResults = lazy(() => import('./components/HumanEvalResults'));
type Screen =
  | "humaneval"
  | "workload"
  | "search"
  | "benchmark"
  | "results"
  | "recommendations"
  | "selection"
  | "providers";
const navigation: {
  id: Screen;
  label: string;
  icon: typeof Box;
  number: string;
}[] = [
  { id: "humaneval", label: "팀 실측 기록", icon: FlaskConical, number: "NEW" },
  { id: "workload", label: "워크로드", icon: Terminal, number: "01" },
  { id: "search", label: "아키텍처 탐색", icon: GitBranch, number: "02" },
  {
    id: "benchmark",
    label: "벤치마크 실행",
    icon: FlaskConical,
    number: "03",
  },
  { id: "results", label: "성능 비교", icon: Box, number: "04" },
  {
    id: "recommendations",
    label: "추천 구성",
    icon: Target,
    number: "05",
  },
  { id: "selection", label: "선택한 구성", icon: Layers3, number: "06" },
  { id: "providers", label: "인프라 상태", icon: Server, number: "07" },
];
export default function App() {
  const [screen, setScreen] = useState<Screen>("workload");
  const [workload, setWorkload] = useState("");
  const [files, setFiles] = useState<WorkloadFile[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const [uploadGeneration, setUploadGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [selectedId, setSelectedId] = useState("");
  const [production, setProduction] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [runStarted, setRunStarted] = useState(false);
  const [showProtocol, setShowProtocol] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [providerReports, setProviderReports] = useState<
    ProviderReport[] | null
  >(null);
  const [providerError, setProviderError] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const providerRequest = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('experiment');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let cancelled = false;
    experimentApi.get(id).then(result => {
      if (cancelled) return;
      if (result.configurations.some(c => c.topology.some(node => !isActiveModel(node.model))))
        throw new Error('현재 화면은 팀이 설정한 Gemma 4 E2B, Qwen 3.5 9B, GPT-OSS 20B 결과만 표시합니다.');
      setSnapshot(result); setWorkload(result.workload); setRunStarted(true);
      setSelectedId(result.configurations.find(c => c.evidence === 'measured')?.id ?? result.configurations[0]?.id ?? ''); setScreen(result.phase);
    }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : '저장된 실험을 불러오지 못했습니다.'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!showProtocol) return;
    const previous = document.activeElement as HTMLElement | null;
    function trap(event: KeyboardEvent) {
      if (event.key === "Escape") setShowProtocol(false);
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".protocol-modal button"),
      );
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [showProtocol]);
  const demo = snapshot.source === "demo";
  const selected =
    snapshot.configurations.find((c) => c.id === selectedId) ??
    snapshot.configurations[0];
  const candidates = snapshot.configurations.filter(
    (c) => c.selectedForBenchmark,
  );
  const measured = snapshot.configurations.filter(
    (c) => (demo ? c.evidence === "illustrative" : c.evidence === "measured") && (c.status === "completed" || c.status === "failed"),
  );
  const exploredCount =
    snapshot.candidateCatalog?.length ?? snapshot.configurations.length;
  const catalog =
    snapshot.candidateCatalog ??
    snapshot.configurations.map((c) => ({
      id: c.id,
      name: c.name,
      topology: topologyLabel(c),
    }));
  const recommendations = (
    ["performance", "balanced", "efficient"] as const
  ).map((role) => ({
    role,
    config: measured.find((c) =>
      snapshot.recommendations
        ? c.id ===
          snapshot.recommendations.find((r) => r.category === role)
            ?.configurationId
        : c.recommendation === role,
    ),
  }));

  async function refreshProviders() {
    if (providerRequest.current) return;
    providerRequest.current = true;
    setProviderBusy(true);
    setProviderError("");
    try {
      setProviderReports(await getProviderReports());
    } catch {
      setProviderReports(null);
      setProviderError(
        "런타임 상태를 조회할 수 없습니다. 실행 서비스 연결을 확인해 주세요.",
      );
    } finally {
      providerRequest.current = false;
      setProviderBusy(false);
    }
  }
  function providerLabel(report?: ProviderReport) {
    if (providerBusy) return "확인 중…";
    if (providerError) return "조회 실패";
    if (!report) return providerReports ? "상태 없음" : "확인 전";
    return report.status === "LIVE" ? "연결됨" : report.status === "ERROR" ? "오류" : "연결 안 됨";
  }
  async function beginEngine() {
    const token = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const result = await experimentApi.create();
      if (token !== generation.current) return;
      setSnapshot(result);
      history.replaceState(null, "", `?experiment=${result.id}`);
      setSelectedId(result.configurations[0].id);
      setProduction(null);
      setRunStarted(true);
      setScreen("search");
    } catch (e) {
      if (token === generation.current)
        setError(e instanceof Error ? e.message : "분석 엔진에 연결할 수 없습니다.");
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (demo || snapshot.phase !== "benchmark" || pollingStopped) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const token = generation.current;
    async function poll() {
      try {
        const next = await (snapshot.integration === "runtime-workload" ? experimentApi.get(snapshot.id) : benchmarkApi.get(snapshot.id));
        if (cancelled || token !== generation.current) return;
        setSnapshot(next);
        if (next.phase === "results") setScreen(current => current === "benchmark" ? "results" : current);
        else timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!cancelled && token === generation.current) {
          setError(
            e instanceof Error ? e.message : "벤치마크 상태를 새로고침하지 못했습니다.",
          );
          setPollingStopped(true);
        }
      }
    }
    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [demo, snapshot.id, snapshot.phase, snapshot.integration, pollingStopped]);

  async function begin(useDemo: boolean) {
    let value: string;
    try { value = useDemo ? DEMO_WORKLOAD : composeWorkload(workload, files); }
    catch (e) { setError(e instanceof Error ? e.message : '입력을 확인해 주세요.'); return; }
    if (!value) {
      setError("작업 설명을 입력하거나 워크로드 파일을 첨부해 주세요.");
      return;
    }
    const token = ++generation.current;
    setError("");
    setBusy(true);
    setProduction(null);
    setPollingStopped(false);
    try {
      const result = useDemo
        ? demoSnapshot(value, "search")
        : await benchmarkApi.create(value);
      if (token !== generation.current) return;
      setSnapshot(result);
      setRunStarted(true);
      setSelectedId(
        result.configurations.find((c) => c.selectedForBenchmark)?.id ??
          result.configurations[0].id,
      );
      setScreen(
        result.phase === "search"
          ? "search"
          : result.phase === "benchmark"
            ? "benchmark"
            : "results",
      );
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error ? e.message : "벤치마크를 시작하지 못했습니다.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function advance() {
    setError("");
    const token = generation.current;
    if (snapshot.integration === "engine-screening") {
      setError(
        "아키텍처 탐색은 연결됐지만 전체 워크로드 실행과 실측 결과 연동은 아직 준비 중입니다. 예시 결과는 데모에서 확인할 수 있습니다.",
      );
      return;
    }
    if (demo) {
      const phase = snapshot.phase === "search" ? "benchmark" : "results";
      setSnapshot(demoSnapshot(snapshot.workload, phase));
      setScreen(phase);
      if (phase === "results") setSelectedId("08");
      return;
    }
    setBusy(true);
    try {
      const next = await (snapshot.integration === "runtime-workload" ? experimentApi.start(snapshot.id) : benchmarkApi.start(snapshot.id));
      if (token === generation.current) {
        setSnapshot(next);
        setScreen(next.phase);
        setPollingStopped(false);
      }
    } catch (e) {
      if (token === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "벤치마크 실행을 시작하지 못했습니다.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function reset() {
    generation.current++;
    history.replaceState(null, "", location.pathname);
    setSnapshot(emptySnapshot());
    setSelectedId("");
    setScreen("workload");
    setRunStarted(false);
    setProduction(null);
    setWorkload("");
    setFiles([]);
    setUploadGeneration(value => value + 1);
    setReadingFiles(false);
    setError("");
    setBusy(false);
    setPollingStopped(false);
  }
  function choose(config: Configuration) {
    setProduction(config);
    setScreen("selection");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function canVisit(id: Screen) {
    return (
      id === "workload" ||
      id === "humaneval" ||
      id === "providers" ||
      (id === "selection" && Boolean(production)) ||
      (runStarted &&
        (id === "search" ||
          (id === "results" && measured.length > 0) ||
          (id === "benchmark" && snapshot.phase !== "search") ||
          (id === "recommendations" && snapshot.phase === "results")))
    );
  }
  const headings: Record<Screen, [string, string]> = {
    humaneval: ["같은 문제, 세 모델의 실제 기록.", "팀 백엔드의 HumanEval 결과를 문제별로 비교하고 새 실행 기록을 불러오세요."],
    workload: [
      "배포 전에, 내 작업으로 검증하세요.",
      "내 워크로드에 맞는 오픈 모델과 실행 구성을 비교하세요.",
    ],
    search: [
      "가능한 구성을 한눈에 살펴보세요.",
      "하나의 워크로드로 모델·에이전트·컴퓨팅 구성을 비교합니다.",
    ],
    benchmark: [
      "동일한 작업, 동일한 평가 기준.",
      "예측에서 실제 벤치마크 근거로 이어갑니다.",
    ],
    results: [
      "품질과 속도, 비용의 균형을 찾으세요.",
      "품질·지연 시간·자원 사용량의 차이를 확인하세요.",
    ],
    recommendations: [
      "내 우선순위에 맞는 선택.",
      "평가한 구성 안에서 내 워크로드에 가장 적합한 조합을 선택하세요.",
    ],
    selection: [
      "다음 단계를 위한 구성이 준비됐습니다.",
      "선택한 구성과 그 근거를 함께 확인하세요.",
    ],
    providers: [
      "연결 상태를 투명하게 확인하세요.",
      "각 단계에서 사용하는 서비스와 실제 연결 상태입니다.",
    ],
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            reset();
          }}
        >
          <span className="brand-mark">A</span>
          <strong>
            atlas<span> /</span>
          </strong>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Command size={15} />
          </span>
          <div> 개인 워크스페이스 <small> 워크로드 기반 구성 비교 </small>
          </div>
          <ChevronRight size={13} />
        </div>
        <div className="nav-label"> 작업 공간 </div>
        <nav aria-label="주요 메뉴">
          {navigation.map(({ id, label, icon: Icon, number }) => (
            <button
              key={id}
              disabled={!canVisit(id)}
              className={screen === id ? "active" : ""}
              onClick={() => setScreen(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
              <small>{number}</small>
            </button>
          ))}
        </nav>
        <button className="new-benchmark" onClick={reset}>
          <Plus size={16} /> 새 벤치마크 </button>
        <div className="sidebar-bottom">
          <div className="runtime-mini">
            <span className="status-dot" />
            <span> Daytona 런타임 </span>
            <small>
              {providerLabel(providerReports?.find((p) => p.id === "daytona"))}
            </small>
          </div>
          <p> 추측은 줄이고, <br /> 더 나은 구성을 선택하세요. </p>
          <span className="mono dim"> ATLAS / 해커톤 에디션 </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"> 워크스페이스 <ChevronRight size={13} />
            <span>{navigation.find((n) => n.id === screen)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className={`badge ${demo ? "demo" : "api"}`}>
              <span className="status-dot" />
              {screen === "humaneval" ? "저장된 실행 기록" : snapshot.source === "empty" ? "아직 실행하지 않음" : demo ? "데모 미리보기" : snapshot.integration === "engine-screening" ? "후보 탐색 · 미실행" : "API 데이터"}
            </span>
            <span className="avatar">AW</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="mini-cross">+</span> 모델 × 아키텍처 × 컴퓨팅 </div>
              <h1>{headings[screen][0]}</h1>
              <p>{headings[screen][1]}</p>
            </div>
            {screen !== "humaneval" && <button
              className="text-button"
              onClick={() => setShowProtocol(true)}
            > 평가 기준 <ArrowUpRight size={14} />
            </button>}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              {pollingStopped && (
                <button
                  onClick={() => {
                    setError("");
                    setPollingStopped(false);
                  }}
                > 상태 다시 확인 </button>
              )}
              <button aria-label="오류 닫기" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {demo && screen !== "humaneval" && (
            <div className="demo-strip">
              <span>
                <span className="status-dot" />
                <strong> 예시 데이터 </strong>
                <span className="divider">/</span>
                {providerReports?.find((p) => p.id === "daytona")?.status === "LIVE"
                  ? "Daytona가 연결됐지만 이 데모에서는 사용하지 않습니다."
                  : "이 데모는 Daytona에서 실행되지 않습니다."}{" "}
                {screen === "benchmark"
                  ? "아래 상태는 예시이며 실제 실행 상태가 아닙니다."
                  : "예시 벤치마크를 단계별로 살펴보세요."}
              </span>
              <span className="mono"> 실제 실행 아님 </span>
            </div>
          )}

          {(busy || (!demo && snapshot.phase === 'benchmark' && !pollingStopped)) && <AnalysisProgress running={snapshot.phase === 'benchmark'} />}
          {snapshot.warnings && snapshot.warnings.length > 0 && <div className="evidence-warnings" role="status">{snapshot.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div>}
          {screen === "humaneval" && <Suspense fallback={<p role="status">팀 실행 기록을 불러오는 중…</p>}><HumanEvalResults /></Suspense>}
          {screen === "workload" && (
            <>
              <div className="workload-grid">
                <section className="workload-card panel">
                  <div className="section-number"> 01 / 워크로드 입력 </div>
                  <h2> 반복하는 AI 작업을 <br /> 알려주세요. </h2>
                  <p> 실제 작업에 맞는 모델과 실행 구성을 찾아보세요. </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (apiConfigured) void begin(false);
                      else {
                        setError(
                          "실제 분석 API가 연결되지 않아 워크로드를 실행하지 않았습니다. 입력은 유지됩니다. 모델 준비와 전체 실행 흐름 연결이 필요합니다.",
                        );
                      }
                    }}
                  >
                    <label htmlFor="workload" className="sr-only"> 반복 작업 설명 </label>
                    <textarea
                      id="workload"
                      value={workload}
                      onChange={(e) => setWorkload(e.target.value)}
                      placeholder="수행할 작업, 원하는 결과, 성공 기준을 입력하세요…"
                      maxLength={100000}
                    />
                    <WorkloadUpload key={uploadGeneration} files={files} onChange={setFiles} onReading={setReadingFiles} />
                    <button
                      className="button primary full"
                      type="submit"
                      disabled={busy || readingFiles}
                    >
                      {busy ? "분석 처리 중…" : "내 워크로드 분석"}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                  <div className="or-rule">
                    <span /> 팀원이 실행한 벤치마크 <span />
                  </div>
                  <button className="demo-example" onClick={() => setScreen("humaneval")}>
                    <span className="example-icon"><FlaskConical size={19} /></span>
                    <span><strong>Nosana × Daytona 실측 기록 보기</strong><small>Gemma 4 E2B · Qwen 3.5 9B · GPT-OSS 20B의 저장된 실행 결과</small></span>
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="or-rule"><span /> 이번 데모의 실행 모델 · 3개 <span /></div>
                  <ul aria-label="실제 실행 모델">{ACTIVE_MODELS.map(model => <li key={model.id}>{model.name} <code>{model.model}</code></li>)}</ul>
                  <p className="workload-explanation">비교 대상은 위 세 모델뿐입니다. 저장된 실행 기록을 확인할 수 있으며, 아직 실행하지 않은 워크로드의 성능은 표시하지 않습니다.</p>
                </section>
                <BenchmarkSpace
                  configurations={snapshot.configurations}
                  selected={selected?.id ?? ""}
                  onSelect={setSelectedId}
                  source={snapshot.source}
                  resourceAxis={snapshot.resourceAxis}
                />
              </div>
              <div className="principles">
                <div>
                  <GitBranch size={18} />
                  <span>
                    <strong> 아키텍처 탐색 </strong>
                    <small> 모델·역할·컴퓨팅을 함께 비교합니다. </small>
                  </span>
                </div>
                <div>
                  <FlaskConical size={18} />
                  <span>
                    <strong> 실제 성능 차이 확인 </strong>
                    <small> 일관된 작업과 설명 가능한 평가 근거. </small>
                  </span>
                </div>
                <div>
                  <Target size={18} />
                  <span>
                    <strong> 근거를 바탕으로 선택 </strong>
                    <small> 내 우선순위로 최종 구성을 결정합니다. </small>
                  </span>
                </div>
              </div>
            </>
          )}

          {runStarted &&
            screen !== "workload" &&
            screen !== "providers" &&
            screen !== "selection" && (
              <div className="run-summary">
                <div className="run-workload">
                  <Terminal size={17} />
                  <div>
                    <span className="eyebrow"> 반복 워크로드 </span>
                    <strong>{snapshot.workload}</strong>
                  </div>
                </div>
                <div className="run-stat">
                  <strong>{exploredCount.toString().padStart(2, "0")}</strong>
                  <span> 탐색한 구성 </span>
                </div>
                <div className="run-stat">
                  <strong>
                    {candidates.length.toString().padStart(2, "0")}
                  </strong>
                  <span> 선별한 구성 </span>
                </div>
                <div className="run-stat">
                  <strong className="lime">
                    {measured.length.toString().padStart(2, "0")}
                  </strong>
                  <span>{demo ? "예시 결과" : "실측 결과"}</span>
                </div>
              </div>
            )}

          {screen === "search" && selected && (
            <>
              <section className="search-panel panel">
                <header className="section-header">
                  <div>
                    <span className="eyebrow"> 02 / 아키텍처 탐색 </span>
                    <h2>{exploredCount} 개 구성을 탐색했습니다. </h2>
                    <p> 상위 {candidates.length} 개를 선별했습니다. {" "}
                      {demo ? "예시 벤치마크" : "실제 벤치마크"}.
                    </p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() => void advance()}
                    disabled={busy || snapshot.phase !== "search"}
                  >
                    {busy
                      ? "시작 중…"
                      : demo
                        ? "벤치마크 단계 미리보기"
                        : "Daytona 벤치마크 시작"}
                    <ArrowRight size={15} />
                  </button>
                </header>
                <div className="candidate-grid">
                  {catalog.map((entry) => {
                    const c = snapshot.configurations.find(
                      (item) => item.id === entry.id,
                    );
                    return (
                      <button
                        key={entry.id}
                        disabled={!c}
                        className={`candidate ${c?.selectedForBenchmark ? "shortlisted" : ""} ${selectedId === entry.id ? "inspected" : ""}`}
                        onClick={() => setSelectedId(entry.id)}
                      >
                        <div>
                          <span className="mono">{entry.id}</span>
                          {c?.selectedForBenchmark ? (
                            <span className="shortlist-label">
                              <Check size={12} /> 선별됨 </span>
                          ) : (
                            <span className="mono dim"> 예측 </span>
                          )}
                        </div>
                        <strong>{entry.topology}</strong>
                        <span>
                          {c
                            ? demo ? `예시 · ${c.quality}% · ${c.latency}초` : c.evidence === "measured" ? `실측 · ${c.quality}% · ${c.latency}초` : "후보 구성 · 아직 벤치마크하지 않음"
                            : "엔진에서 지표를 반환하지 않았습니다."}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="results-grid">
                <BenchmarkSpace
                  configurations={snapshot.configurations}
                  selected={selected.id}
                  onSelect={setSelectedId}
                  source={snapshot.source}
                  resourceAxis={snapshot.resourceAxis}
                />
                <ConfigurationDetail
                  config={selected}
                  demo={demo}
                  onUse={choose}
                />
              </div>
            </>
          )}

          {screen === "benchmark" && selected && (
            <>
              <section className="benchmark-panel panel">
                <header className="section-header">
                  <div>
                    <span className="eyebrow"> 03 / 벤치마크 실행 </span>
                    <h2> 실행 환경: {" "}
                      <span className="daytona-wordmark">
                        Daytona<span>▰</span>
                      </span>
                    </h2>
                    <p>
                      {demo
                        ? "예시 실행 단계입니다. 다음 단계에서 예시 결과를 확인하세요."
                        : "벤치마크 API가 반환한 실제 상태입니다."}
                    </p>
                  </div>
                  {demo ? (
                    <button
                      className="button primary"
                      onClick={() => void advance()}
                    > 예시 결과 보기 <ArrowRight size={16} />
                    </button>
                  ) : (
                    <span className="badge api">
                      <Radio size={12} />
                      {pollingStopped ? "상태 갱신 일시 중지" : "API 상태"}
                    </span>
                  )}
                </header>
                <div className="benchmark-cards">
                  {candidates.map((c) => (
                    <article key={c.id}>
                      <span className="mono dim">{c.name.toUpperCase()}</span>
                      <h3>{topologyLabel(c)}</h3>
                      <div className={`stage-status ${c.status}`}>
                        <CircleDot size={14} />
                        {demo ? "예시 · " : ""}
                        {labelKo(c.status)}
                      </div>
                      <div className="stage-track">
                        {[
                          "provisioning",
                          "running",
                          "evaluating",
                          "completed",
                        ].map((s, i) => (
                          <span
                            key={s}
                            className={
                              [
                                "provisioning",
                                "running",
                                "evaluating",
                                "completed",
                              ].indexOf(c.status) >= i
                                ? "done"
                                : ""
                            }
                          />
                        ))}
                      </div>
                      <small>{c.error ?? c.compute}</small>{c.progress && <p className="case-progress">케이스 {c.progress.completed} / {c.progress.total} 완료{c.progress.currentCase ? ` · ${c.progress.currentCase}` : ""}</p>}
                    </article>
                  ))}
                </div>
                <div className="protocol-inline">
                  <FlaskConical size={14} />
                  {snapshot.protocol}
                </div>
              </section>
              <div className="results-grid">
                <BenchmarkSpace
                  configurations={snapshot.configurations}
                  selected={selected.id}
                  onSelect={setSelectedId}
                  source={snapshot.source}
                  resourceAxis={snapshot.resourceAxis}
                />
                <ConfigurationDetail
                  config={selected}
                  demo={demo}
                  onUse={choose}
                />
              </div>
            </>
          )}

          {(screen === "results" || screen === "recommendations") && selected && (
            <>
              <div className="results-grid">
                <BenchmarkSpace
                  configurations={snapshot.configurations}
                  selected={selected.id}
                  onSelect={setSelectedId}
                  source={snapshot.source}
                  resourceAxis={snapshot.resourceAxis}
                />
                <ConfigurationDetail
                  config={selected}
                  demo={demo}
                  onUse={choose}
                />
              </div>
              <section className="recommendations">
                <header className="recommendation-heading">
                  <div>
                    <span className="eyebrow"> 나에게 맞는 실행 구성 </span>
                    <h2> 세 가지 선택 기준 <span>.</span>
                    </h2>
                  </div>
                  <p> 이번 워크로드에서 평가한 구성 간 비교입니다. </p>
                </header>
                {recommendations.some((r) => r.config) ? (
                  <div className="recommendation-grid">
                    {recommendations.map(({ role, config }) =>
                      config ? (
                        <article
                          key={role}
                          className={`recommendation-card ${role}`}
                        >
                          <div className="recommendation-top">
                            <span>
                              {role === "performance" ? (
                                <Zap size={15} />
                              ) : role === "balanced" ? (
                                <Target size={15} />
                              ) : (
                                <Cpu size={15} />
                              )}
                              <strong>{labelKo(role)}</strong>
                            </span>
                            {role === "balanced" && (
                              <span className="suggested"> 추천 </span>
                            )}
                          </div>
                          <h3>{config.name}</h3>
                          <p>{topologyLabel(config)}</p>
                          <div className="recommendation-metrics">
                            <div>
                              <strong>
                                {config.quality}
                                <small>%</small>
                              </strong>
                              <span> 품질 </span>
                            </div>
                            <div>
                              <strong>
                                {config.latency}
                                <small>s</small>
                              </strong>
                              <span> 지연 시간 </span>
                            </div>
                            <div>
                              <strong>
                                {config.resource.value.toFixed(2)}
                              </strong>
                              <span>
                                {config.resource.unit}
                                {config.resource.estimated ? " · 추정" : ""}
                              </span>
                            </div>
                          </div>
                          <EvidenceBadge config={config} demo={demo} />
                          <button
                            className={`button full ${role === "balanced" ? "primary" : "secondary"}`}
                            onClick={() => choose(config)}
                          > 이 구성 선택 <ArrowUpRight size={15} />
                          </button>
                        </article>
                      ) : (
                        <article
                          key={role}
                          className="recommendation-card unavailable"
                        >
                          <span className="eyebrow">{labelKo(role)}</span>
                          <h3> 정보 없음 </h3>
                          <p> 이 항목을 비교할 수 있는 평가 근거가 아직 없습니다. </p>
                        </article>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="empty-state panel">
                    <FlaskConical />
                    <h3> 측정 근거가 먼저입니다. </h3>
                    <p> 벤치마크 API에서 추천 결과를 받으면 표시됩니다. </p>
                    <button
                      className="button secondary"
                      onClick={() =>
                        setScreen(
                          snapshot.phase === "search" ? "search" : "benchmark",
                        )
                      }
                    > 벤치마크 계속하기 <ArrowRight size={15} />
                    </button>
                  </div>
                )}
                <p className="evidence-note">
                  {demo ? "예시 결과입니다. " : ""}품질 산정 근거는 각 구성의 상세 정보에서 확인할 수 있습니다. 자원 추정치는 청구 비용이 아닙니다. 파레토 여부와 추천 구성의 출처: {demo ? "예시 데이터" : "API"}.
                </p>
              </section>
            </>
          )}
          {screen === "selection" && production && (
            <Selection
              config={production}
              demo={demo}
              onBack={() => setScreen("results")}
            />
          )}
          {screen === "providers" && (
            <>
              <div className="provider-actions">
                <p>
                  {providerError ||
                    (providerReports
                      ? "런타임 API에서 확인한 서비스 상태입니다."
                      : "현재 세션에서 연결 상태를 확인하지 않았습니다.")}
                </p>
                <button
                  className="button secondary"
                  disabled={providerBusy}
                  onClick={() => void refreshProviders()}
                > {providerBusy ? "연결 확인 중…" : "연결 상태 확인"} <Radio size={14} />
                </button>
              </div>
              <section className="provider-grid">
                {snapshot.providers.map((p, i) => {
                  const report = providerReports?.find(
                    (r) => r.id.toLowerCase() === p.name.toLowerCase(),
                  );
                  const connected = !providerBusy && !providerError && report?.status === "LIVE";
                  return (
                    <article className="provider-card panel" key={p.name}>
                      <span className="provider-logo">
                        {i === 0 ? "▰" : i === 1 ? "N" : "D"}
                      </span>
                      <span className="eyebrow">{p.role}</span>
                      <h2>{p.name}</h2>
                      <span
                        className={`badge ${connected ? "api" : "offline"}`}
                      >
                        <span className="status-dot" />
                        {providerLabel(report)}
                      </span>
                      <p>
                        {report?.reason ??
                          "확인된 연결이 없습니다. 연결 상태 확인 버튼으로 조회하세요."}
                      </p>
                    </article>
                  );
                })}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="mini-cross">+</span> 추측 대신, 검증된 근거로. </span>
            <button onClick={() => setScreen("providers")}> 인프라 연결 상태 <ArrowUpRight size={12} />
            </button>
            <span>ATLAS v0.1</span>
          </footer>
        </main>
      </div>
      {showProtocol && (
        <div className="modal-backdrop" onClick={() => setShowProtocol(false)}>
          <section
            className="protocol-modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="protocol-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowProtocol(false);
            }}
          >
            <button
              autoFocus
              className="modal-close"
              aria-label="평가 기준 닫기"
              onClick={() => setShowProtocol(false)}
            >
              <X size={20} />
            </button>
            <FlaskConical size={25} />
            <h2 id="protocol-title"> 평가 기준 </h2>
            <p>{snapshot.protocol}</p>
            <ul>
              <li> 각 항목은 모델·에이전트 아키텍처·컴퓨팅을 포함한 하나의 구성입니다. </li>
              <li> 반투명 요소는 예측값입니다. 실측과 예시 데이터는 별도 표시합니다. </li>
              <li> 품질은 가중치를 포함한 평가 근거를 제공하며, 지연 시간은 초 단위입니다. </li>
              <li> 자원 추정치는 동일한 단위로 비교하며, 서비스 청구 금액이 아닙니다. </li>
              <li> 파레토 여부와 추천 구성은 백엔드 또는 별도의 예시 데이터에서 가져옵니다. </li>
            </ul>
            <button
              className="button primary"
              onClick={() => setShowProtocol(false)}
            > 확인 <Check size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
