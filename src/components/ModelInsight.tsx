import { resourceLabel, type Configuration } from '../domain';
import { labelKo } from '../labels';
function description(model: string) {
  if (/deepseek/i.test(model)) return '단계별 추론과 문제 분석을 맡기는 모델입니다.';
  if (/qwen/i.test(model)) return '가벼운 일반 작업과 코드 작성에 사용하는 모델입니다.';
  if (/gemma/i.test(model)) return '응답 검토와 범용 작업에 사용하는 모델입니다. 멀티모달 지원은 실행 환경에 따라 달라집니다.';
  return '이 구성에서 지정한 역할로 실행되는 모델입니다.';
}
export default function ModelInsight({ config }: { config: Configuration }) {
  return <aside className="model-insight" aria-label="선택 모델 성능 상세" aria-live="polite">
    <div className="insight-heading"><span>SELECTED CONFIGURATION</span><span className="table-evidence">{labelKo(config.evidence)}</span></div>
    <h3>{config.name}</h3>
    <div className="insight-models">{config.topology.map((node, i) => <div key={`${node.model}-${i}`}>
      <strong><span className="model-index">{i + 1}</span>{node.model}</strong><small>{labelKo(node.role)}</small><p>{description(node.model)}</p>
    </div>)}</div>
    <table><caption>선택한 구성의 성능표</caption><tbody>
      <tr><th>작업 품질</th><td className="insight-score">{config.quality}%</td></tr>
      <tr><th>지연 시간</th><td>{config.latency}초</td></tr>
      <tr><th>테스트 통과</th><td>{config.tests ? `${config.tests.passed} / ${config.tests.total}` : '미측정'}</td></tr>
      <tr><th>자원 {config.resource.estimated ? '(추정)' : '(실측)'}</th><td>{resourceLabel(config)}</td></tr>
      <tr><th>상태</th><td>{labelKo(config.status)}</td></tr>
    </tbody></table>
    <div className="insight-rationale"><strong>이 점수를 받은 이유</strong><p>{config.qualityExplanation}</p></div>
    <small className="insight-note">수치는 전체 구성의 결과이며 모델별 개별 성능이 아닙니다.</small>
  </aside>;
}
