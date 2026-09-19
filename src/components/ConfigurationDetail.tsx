import {
  ArrowDown,
  ArrowUpRight,
  Check,
  ChevronRight,
  Cpu,
  FlaskConical,
} from "lucide-react";
import { resourceLabel, type Configuration } from "../domain";

export function EvidenceBadge({
  config,
  demo,
}: {
  config: Configuration;
  demo: boolean;
}) {
  return (
    <span className={`badge evidence ${config.evidence}`}>
      {demo ? "DEMO · " : ""}
      {config.evidence.toUpperCase()}
    </span>
  );
}
export function Topology({ config }: { config: Configuration }) {
  return (
    <div className="topology">
      {config.topology.map((n, i) => (
        <div key={`${n.model}-${i}`}>
          {i > 0 && (
            <div className="topology-arrow">
              <ArrowDown size={14} />
            </div>
          )}
          <div className="model-node">
            <span className={`model-icon ${n.model.toLowerCase()}`}>
              {n.model.slice(0, 1)}
            </span>
            <strong>{n.model}</strong>
            <span>{n.role}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function ConfigurationDetail({
  config,
  demo,
  onUse,
}: {
  config: Configuration;
  demo: boolean;
  onUse: (c: Configuration) => void;
}) {
  return (
    <aside className="detail panel">
      <header className="panel-header">
        <div>
          <FlaskConical size={16} />
          <h2>Configuration detail</h2>
        </div>
        <ArrowUpRight size={15} />
      </header>
      <div className="detail-body">
        <div className="detail-title">
          <span className="eyebrow">{config.name.toUpperCase()}</span>
          <EvidenceBadge config={config} demo={demo} />
        </div>
        <Topology config={config} />
        <div className="compute">
          <Cpu size={14} />
          {config.compute}
        </div>
        <div className="detail-metrics">
          <div>
            <span>Task quality</span>
            <strong>
              {config.quality}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span>Latency</span>
            <strong>
              {config.latency}
              <small> sec</small>
            </strong>
          </div>
        </div>
        <dl className="data-rows">
          <div>
            <dt>Tests passed</dt>
            <dd>
              {config.tests
                ? `${config.tests.passed} / ${config.tests.total}`
                : "Not measured"}
            </dd>
          </div>
          <div>
            <dt>Resource {config.resource.estimated ? "estimate" : "usage"}</dt>
            <dd>{resourceLabel(config)}</dd>
          </div>
          <div>
            <dt>Runtime provider</dt>
            <dd>{demo ? "Daytona (demo)" : "Daytona"}</dd>
          </div>
        </dl>
        <details className="quality-explainer">
          <summary>
            How is quality calculated?
            <ChevronRight size={12} />
          </summary>
          <p>{config.qualityExplanation}</p>
          {config.breakdown.map((b) => (
            <div key={b.label}>
              <span>
                {b.label} · {Math.round(b.weight * 100)}% weight
              </span>
              <strong>{b.value}%</strong>
            </div>
          ))}
        </details>
        <button className="button secondary full" onClick={() => onUse(config)}>
          Use this configuration
          <ArrowUpRight size={15} />
        </button>
      </div>
    </aside>
  );
}
export function Selection({
  config,
  demo,
  onBack,
}: {
  config: Configuration;
  demo: boolean;
  onBack: () => void;
}) {
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          { schemaVersion: 1, demo, deployed: false, configuration: config },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-configuration-${config.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="selection panel">
      <span className="selection-check">
        <Check size={26} />
      </span>
      <span className="eyebrow">YOUR CHOICE, BACKED BY EVIDENCE</span>
      <h2>Selected Production Configuration</h2>
      <p>
        {config.name} · {config.compute}
      </p>
      <EvidenceBadge config={config} demo={demo} />
      <Topology config={config} />
      <div className="selection-evidence">
        <span>
          <strong>{config.quality}%</strong>Task quality
        </span>
        <span>
          <strong>{config.latency}s</strong>Latency
        </span>
        <span>
          <strong>
            {config.tests
              ? `${config.tests.passed}/${config.tests.total}`
              : "—"}
          </strong>
          Tests passed
        </span>
      </div>
      <p className="selection-note">
        Selection saved for this session. No production deployment has been
        made.{demo ? " All benchmark evidence is illustrative demo data." : ""}
      </p>
      <p className="selection-note">{config.qualityExplanation}</p>
      <div className="selection-actions">
        <button className="button secondary" onClick={onBack}>
          Back to results
        </button>
        <button className="button primary" onClick={download}>
          Export configuration
          <ArrowUpRight size={15} />
        </button>
      </div>
    </section>
  );
}
