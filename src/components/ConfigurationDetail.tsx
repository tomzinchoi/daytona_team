import { labelKo } from '../labels';
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
      {demo ? "예시 · " : ""}
      {labelKo(config.evidence)}
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
            <span>{labelKo(n.role)}</span>
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
  const showMetrics = demo || (config.evidence === "measured" && (config.status === "completed" || config.status === "failed"));
  return (
    <aside className="detail panel">
      <header className="panel-header">
        <div>
          <FlaskConical size={16} />
          <h2> 구성 상세 </h2>
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
            <span> 작업 품질 </span>
            <strong>
              {showMetrics ? <>{config.quality}<small>%</small></> : "미측정"}
            </strong>
          </div>
          <div>
            <span> 지연 시간 </span>
            <strong>
              {showMetrics ? <>{config.latency}<small> 초</small></> : "미측정"}
            </strong>
          </div>
        </div>
        <dl className="data-rows">
          <div>
            <dt> 통과한 테스트 </dt>
            <dd>
              {showMetrics && config.tests
                ? `${config.tests.passed} / ${config.tests.total}`
                : "미측정"}
            </dd>
          </div>
          <div>
            <dt> 자원 {config.resource.estimated ? "추정치" : "사용량"}</dt>
            <dd>{showMetrics ? resourceLabel(config) : "미측정"}</dd>
          </div>
          <div>
            <dt> 실행 서비스 </dt>
            <dd>{demo ? "Daytona (예시)" : "Daytona"}</dd>
          </div>
        </dl>
        <details className="quality-explainer">
          <summary>{showMetrics ? "품질은 어떻게 계산하나요?" : "후보 선정 근거 · 실측 아님"} <ChevronRight size={12} />
          </summary>
          <p>{config.qualityExplanation}</p>
          {showMetrics && config.breakdown.map((b) => (
            <div key={b.label}>
              <span>
                {b.label} · {Math.round(b.weight * 100)}% 가중치
              </span>
              <strong>{b.value}%</strong>
            </div>
          ))}
        </details>
        <button className="button secondary full" disabled={!showMetrics} onClick={() => onUse(config)}> 이 구성 선택 <ArrowUpRight size={15} />
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
      <span className="eyebrow"> 평가 근거와 함께 선택하세요 </span>
      <h2> 선택한 실행 구성 </h2>
      <p>
        {config.name} · {config.compute}
      </p>
      <EvidenceBadge config={config} demo={demo} />
      <Topology config={config} />
      <div className="selection-evidence">
        <span>
          <strong>{config.quality}%</strong> 작업 품질 </span>
        <span>
          <strong>{config.latency}s</strong> 지연 시간 </span>
        <span>
          <strong>
            {config.tests
              ? `${config.tests.passed}/${config.tests.total}`
              : "—"}
          </strong> 통과한 테스트 </span>
      </div>
      <p className="selection-note"> 이 세션에 선택한 구성을 보관합니다. 실제 서비스 배포는 진행하지 않았습니다. {demo ? " 모든 평가 근거는 예시 데이터입니다." : ""}
      </p>
      <p className="selection-note">{config.qualityExplanation}</p>
      <div className="selection-actions">
        <button className="button secondary" onClick={onBack}> 결과로 돌아가기 </button>
        <button className="button primary" onClick={download}> 구성 내보내기 <ArrowUpRight size={15} />
        </button>
      </div>
    </section>
  );
}
