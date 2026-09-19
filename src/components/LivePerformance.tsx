import { ACTIVE_MODELS } from '../active-models';
import './HumanEvalResults.css';

export type LiveRun = { id: string; status: string; total: number; error?: string; rows: { model: string; task_id: string; passed: boolean; time_ms: number | null; tokens?: number | null; error?: string | null }[] };
const number = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
export default function LivePerformance({ run }: { run: LiveRun }) {
  const expected = Number.isInteger(run.total / 3) ? run.total / 3 : null;
  const models = ACTIVE_MODELS.map(model => {
    const rows = run.rows.filter(row => row.model === model.id);
    const times = rows.flatMap(row => row.time_ms === null ? [] : [row.time_ms]);
    const tokens = rows.flatMap(row => row.tokens == null ? [] : [row.tokens]);
    return { ...model, rows, passed: rows.filter(row => row.passed).length, average: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, timed: times.length, tokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) / tokens.length : null, tokenCount: tokens.length };
  });
  const maxTime = Math.max(1, ...models.map(model => model.average ?? 0));
  const complete = run.status === 'completed' && run.rows.length === run.total;
  return <section className="panel he-details" aria-label="실행 벤치마크 성능표" style={{ padding: 24, margin: '20px 0' }}>
    <span className="eyebrow">이번 실행의 실제 채점 결과</span>
    <h2>벤치마크 성능표</h2>
    <p>{complete ? '세 모델의 실행 결과를 집계했습니다.' : '현재까지 반환된 결과입니다. 미완료 모델은 최종 성능으로 비교하지 마세요.'} 실행 ID: {run.id}</p>
    <div className="he-table-scroll" tabIndex={0}>
      <table><caption className="sr-only">이번 실행의 모델별 성능 비교</caption><thead><tr><th scope="col">모델</th><th scope="col">문제 통과</th><th scope="col">통과율</th><th scope="col">평균 응답 시간</th><th scope="col">평균 생성 토큰</th><th scope="col">진행 상태</th></tr></thead>
        <tbody>{models.map(model => <tr key={model.id}>
          <th scope="row">{model.name}</th>
          <td>{model.passed} / {model.rows.length}건</td>
          <td>{model.rows.length ? `${number(model.passed / model.rows.length * 100)}%` : '미측정'}</td>
          <td>{model.average === null ? '미측정' : `${number(model.average / 1000)}초`}<small>응답 시간 기록 {model.timed}건</small></td>
          <td>{model.tokens === null ? '미기록' : number(model.tokens)}<small>토큰 기록 {model.tokenCount}건</small></td>
          <td>{expected !== null && model.rows.length === expected ? '채점 완료' : `${model.rows.length}/${expected ?? '?'}건 채점`}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div aria-label="모델별 평균 응답 시간 비교" style={{ display: 'grid', gap: 16, marginTop: 24 }}>
      {models.map(model => <div key={model.id}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}><span>{model.name}</span><strong>{model.average === null ? '미측정' : `${number(model.average / 1000)}초`}</strong></div><div className="he-meter" style={{ marginTop: 8, height: 10 }}><span style={{ width: `${(model.average ?? 0) / maxTime * 100}%` }} /></div></div>)}
    </div>
    <p className="he-muted">짧은 막대일수록 평균 응답이 빠릅니다. 응답 시간은 모델 호출 시간이며 채점 시간은 포함하지 않습니다. 시간 초과·미기록 값은 0으로 계산하지 않습니다. 통과율은 채점된 문제 기준이며, 생성 토큰 수는 비용이나 GPU 사용량이 아닙니다.</p>
  </section>;
}
