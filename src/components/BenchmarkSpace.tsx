import { Component, Suspense, lazy, useState, type ReactNode } from "react";
import { Box, FlaskConical, RotateCcw, Maximize2, Move, Scan } from "lucide-react";
import { plottableConfigurations, resourceLabel, type Configuration, type Snapshot } from "../domain";
import ComparisonTable from './ComparisonTable';
import { labelKo } from '../labels';
const Scene = lazy(() => import("./Scene"));
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function Scatter2D({
  configurations,
  selected,
  onSelect,
}: {
  configurations: Configuration[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const max = Math.max(
    10,
    Math.ceil(Math.max(...configurations.map((c) => c.latency)) / 10) * 10,
  );
  return (
    <div className="fallback">
      <span className="fallback-note">
        2D VIEW · Resource estimate is available in each point’s details
      </span>
      <svg
        viewBox="0 0 700 410"
        role="img"
        aria-label="2D latency versus quality scatter plot"
      >
        {[0, 20, 40, 60, 80, 100].map((n) => (
          <g key={n}>
            <line
              x1="70"
              x2="650"
              y1={340 - n * 2.8}
              y2={340 - n * 2.8}
              stroke="#2d362c"
            />
            <text x="30" y={345 - n * 2.8}>
              {n}%
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((n) => (
          <text key={n} x={65 + n * 145} y="365">
            {(max * n) / 4}s
          </text>
        ))}
        <text x="310" y="398">
          LATENCY →
        </text>
        <text x="70" y="30">
          TASK QUALITY ↑
        </text>
        {configurations.map((c) => (
          <g
            key={c.id}
            role="button"
            tabIndex={0}
            aria-label={`Inspect architecture ${c.id}`}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(c.id);
              }
            }}
          >
            <title>
              {c.name}: {c.quality}% quality, {c.latency}s, {resourceLabel(c)}{" "}
              estimated
            </title>
            <circle
              cx={70 + (c.latency / max) * 580}
              cy={340 - c.quality * 2.8}
              r={c.id === selected ? 10 : 7}
              fill={
                c.recommendation === "performance"
                  ? "#ac9cff"
                  : c.recommendation === "efficient"
                    ? "#64dcca"
                    : "#c3f478"
              }
              fillOpacity={c.evidence === "predicted" ? 0.35 : 1}
              stroke={c.pareto || c.id === selected ? "#e8ffd1" : "none"}
              strokeWidth="2"
            />
            {c.selectedForBenchmark && (
              <text x={80 + (c.latency / max) * 580} y={330 - c.quality * 2.8}>
                #{c.id}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
export default function BenchmarkSpace({
  configurations: suppliedConfigurations,
  selected,
  onSelect,
  source,
}: {
  configurations: Configuration[];
  selected: string;
  onSelect: (id: string) => void;
  source: Snapshot["source"];
}) {
  const [mode, setMode] = useState<"3d" | "2d">("2d");
  const [failed, setFailed] = useState(false);
  const [resetKey, setReset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<Configuration | null>(null);
  const configurations = plottableConfigurations(suppliedConfigurations, source);
  if (configurations.length === 0) return (
    <section className="space panel evidence-empty" aria-label="벤치마크 결과 대기">
      <span className="eyebrow">아직 워크로드를 실행하지 않았습니다</span>
      <FlaskConical size={36} aria-hidden="true" />
      <h2>벤치마크 결과가 없습니다.</h2>
      <p>{suppliedConfigurations.length > 0
        ? "아키텍처 후보만 탐색했습니다. 후보 선정에 사용한 추정치는 실제 벤치마크 성능이 아닙니다."
        : "워크로드 실행과 평가가 끝나면 성능을 비교할 수 있습니다. 아직 점수나 실행 시간을 측정하지 않았습니다."}</p>
      <dl className="unmeasured-metrics">
        <div><dt>작업 품질</dt><dd>미측정</dd></div>
        <div><dt>지연 시간</dt><dd>미측정</dd></div>
        <div><dt>테스트</dt><dd>미실행</dd></div>
      </dl>
    </section>
  );
  const fallback = (
    <ComparisonTable
      configurations={configurations}
      selected={selected}
      onSelect={onSelect}
      source={source}
    />
  );
  return (
    <section
      className={`space panel ${expanded ? "expanded" : ""}`}
      aria-label="벤치마크 성능 비교"
    >
      <header className="panel-header">
        <div>
          <Box size={16} />
          <h2>AI 모델 성능 비교</h2>
          <span className="mono dim">
            {configurations.length}개 구성
          </span>
        </div>
        <div className="view-controls">
          <button
            aria-pressed={mode === "3d" && !failed}
            onClick={() => {
              setMode("3d");
              setFailed(false);
            }}
          >
            3D
          </button>
          <button
            aria-pressed={mode === "2d" || failed}
            onClick={() => setMode("2d")}
          >
            2D
          </button>
          <button
            title="카메라 초기화"
            aria-label="카메라 초기화"
            onClick={() => setReset((n) => n + 1)}
          >
            <RotateCcw size={14} />
          </button>
          <button
            title="비교 화면 확대"
            aria-label={expanded ? "비교 화면 축소" : "비교 화면 확대"}
            onClick={() => setExpanded((v) => !v)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>
      <div className={`plot ${mode === '2d' || failed ? 'table-mode' : 'three-mode'}`}>
        <div className="plot-caption">
          <span className="eyebrow">품질 · 지연 시간 · 자원 사용량</span>
          <p>막대 하나가 하나의 AI 구성입니다.</p>
        </div>
        <span className="plot-source">
          {source === "demo" ? "예시 데이터 · 실제 측정 아님" : "API 벤치마크 데이터"}
        </span>
        {mode === "2d" || failed ? (
          fallback
        ) : (
          <SceneBoundary fallback={fallback}>
            <Suspense
              fallback={
                <div className="plot-loading">비교 화면을 불러오는 중…</div>
              }
            >
              <Scene
                configurations={configurations}
                selected={selected}
                onSelect={onSelect}
                onHover={setHover}
                onFailure={() => setFailed(true)}
                resetKey={resetKey}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {failed && (
          <span className="webgl-note">
            3D를 사용할 수 없어 2D 비교표로 표시합니다.
          </span>
        )}
        {hover && mode === "3d" && !failed && (
          <div className="chart-tooltip">
            <strong>{hover.name}</strong>
            <span>
              품질 {hover.quality}% · {hover.latency}초
            </span>
            <span>
              {resourceLabel(hover)}{" "}
              {hover.resource.estimated ? "추정" : ""}
            </span>
            <small>
              {source === "demo" ? "예시 · " : ""}
              {labelKo(hover.evidence)}
            </small>
          </div>
        )}
        <div className="plot-hint">
          <Move size={12} />
          {mode === "3d" && !failed
            ? "드래그하여 회전 · 스크롤하여 확대 · 막대 선택"
            : "모델 이름을 선택하면 상세 정보를 확인할 수 있습니다."}
          <Scan size={12} />
        </div>
      </div>
      <footer className="space-footer">
        <div className="legend">
          <span>
            <i className="dot predicted" />
            예측
          </span>
          <span>
            <i className="dot measured" />
            {source === "demo" ? "가상 예시" : "실측"}
          </span>
          <span>
            <i className="dot pareto" />
            파레토
          </span>
          <span>
            <i className="dot recommended" />
            추천
          </span>
        </div>
        <label className="sr-only" htmlFor="config-picker">
          구성 선택
        </label>
        <select
          id="config-picker"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          {configurations.map((c) => (
            <option key={c.id} value={c.id}>
              구성 #{c.id}
            </option>
          ))}
        </select>
      </footer>
    </section>
  );
}
