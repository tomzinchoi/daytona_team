import type { Configuration, Snapshot } from '../domain';
export default function ComparisonTable({ configurations, selected, onSelect, source }: { configurations: Configuration[]; selected: string; onSelect: (id: string) => void; source: Snapshot['source'] }) {
  return <div className="comparison-scroll" tabIndex={0} aria-label="AI 구성 성능 비교표">
    <table className="comparison-table">
      <caption>AI 모델·아키텍처 성능 비교 <span>{source === 'demo' ? '예시 데이터 · 실제 측정 아님' : '예측·실측 구분 표시'}</span></caption>
      <thead><tr><th scope="col">모델 / 구성</th><th scope="col">근거</th><th scope="col">품질 점수</th><th scope="col">테스트 통과율</th><th scope="col">지연 시간</th><th scope="col">자원 사용량</th><th scope="col">품질 수준</th><th scope="col">설명</th></tr></thead>
      <tbody>{configurations.map(c => <tr key={c.id} className={selected === c.id ? 'selected-row' : ''}>
        <th scope="row"><button onClick={() => onSelect(c.id)} aria-pressed={selected === c.id}>{c.topology.map(n => n.model).join(' → ')}<small>구성 #{c.id}</small></button></th>
        <td><span className={`table-evidence ${c.evidence}`}>{source === 'demo' ? '예시' : c.evidence === 'measured' ? '실측' : '예측'}</span></td>
        <td className={c.quality >= 80 ? 'metric-good' : 'metric-warn'}>{c.quality.toFixed(1)}%</td>
        <td>{c.tests ? `${(c.tests.passed / c.tests.total * 100).toFixed(1)}%` : '미측정'}</td>
        <td>{c.latency.toLocaleString('ko-KR')}초</td>
        <td>{c.resource.value.toFixed(2)}<small>{c.resource.unit}{c.resource.estimated ? ' · 추정' : ''}</small></td>
        <td><div className="quality-meter" role="meter" aria-label={`구성 ${c.id} 품질`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.quality}><span style={{ width: `${c.quality}%` }} /></div><small>단일 품질 점수 · 분포 아님</small></td>
        <td className="comparison-note">{c.qualityExplanation}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
