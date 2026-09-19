import { Component, Suspense, lazy, useState, type ReactNode } from "react";
import { Box, RotateCcw, Maximize2, Move, Scan } from "lucide-react";
import { resourceLabel, type Configuration } from "../domain";
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
  configurations,
  selected,
  onSelect,
  source,
}: {
  configurations: Configuration[];
  selected: string;
  onSelect: (id: string) => void;
  source: "demo" | "api";
}) {
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [failed, setFailed] = useState(false);
  const [resetKey, setReset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<Configuration | null>(null);
  const fallback = (
    <Scatter2D
      configurations={configurations}
      selected={selected}
      onSelect={onSelect}
    />
  );
  return (
    <section
      className={`space panel ${expanded ? "expanded" : ""}`}
      aria-label="Benchmark space"
    >
      <header className="panel-header">
        <div>
          <Box size={16} />
          <h2>Benchmark space</h2>
          <span className="mono dim">
            {configurations.length} CONFIGURATIONS
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
            title="Reset camera"
            aria-label="Reset camera"
            onClick={() => setReset((n) => n + 1)}
          >
            <RotateCcw size={14} />
          </button>
          <button
            title="Expand chart"
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
            onClick={() => setExpanded((v) => !v)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>
      <div className="plot">
        <div className="plot-caption">
          <span className="eyebrow">THE CONFIGURATION LANDSCAPE</span>
          <p>One point. One complete AI configuration.</p>
        </div>
        <span className="plot-source">
          {source === "demo" ? "ILLUSTRATIVE DEMO DATA" : "API BENCHMARK DATA"}
        </span>
        {mode === "2d" || failed ? (
          fallback
        ) : (
          <SceneBoundary fallback={fallback}>
            <Suspense
              fallback={
                <div className="plot-loading">Loading benchmark space…</div>
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
            3D unavailable. Showing the 2D fallback.
          </span>
        )}
        {hover && mode === "3d" && !failed && (
          <div className="chart-tooltip">
            <strong>{hover.name}</strong>
            <span>
              {hover.quality}% quality · {hover.latency}s
            </span>
            <span>
              {resourceLabel(hover)}{" "}
              {hover.resource.estimated ? "estimated" : ""}
            </span>
            <small>
              {source === "demo" ? "DEMO · " : ""}
              {hover.evidence.toUpperCase()}
            </small>
          </div>
        )}
        <div className="plot-hint">
          <Move size={12} />
          {mode === "3d" && !failed
            ? "Drag to orbit · Scroll to zoom · Click to inspect"
            : "Click a point to inspect"}
          <Scan size={12} />
        </div>
      </div>
      <footer className="space-footer">
        <div className="legend">
          <span>
            <i className="dot predicted" />
            Predicted
          </span>
          <span>
            <i className="dot measured" />
            Measured
          </span>
          <span>
            <i className="dot pareto" />
            Pareto
          </span>
          <span>
            <i className="dot recommended" />
            Recommended
          </span>
        </div>
        <label className="sr-only" htmlFor="config-picker">
          Inspect configuration
        </label>
        <select
          id="config-picker"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          {configurations.map((c) => (
            <option key={c.id} value={c.id}>
              Architecture #{c.id}
            </option>
          ))}
        </select>
      </footer>
    </section>
  );
}
