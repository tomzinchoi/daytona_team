import { useMemo, useRef, useState } from 'react';
import { Download, Upload, RotateCcw } from 'lucide-react';
import recordedText from '../../backend/results_live.jsonl?raw';
import liveTasks from '../../backend/problems_live.json';
import { MAX_RESULT_BYTES, parseHumanEval, summarizeHumanEval, type HumanEvalRow } from '../humaneval';
import './HumanEvalResults.css';

const recordedRows = parseHumanEval(recordedText);
const taskNames = new Map(liveTasks.map(t => [t.task_id, t.name]));
const format = (value: number | null, digits = 2) => value === null ? '미기록' : value.toLocaleString('ko-KR', { maximumFractionDigits: digits });
const status = (row: HumanEvalRow) => row.passed ? '통과' : /timed? out|timeout/i.test(row.error ?? '') ? '시간 초과' : '실패';

export default function HumanEvalResults({ onUse }: { onUse?: (modelId: string) => void }) {
  const [dataset, setDataset] = useState({ rows: recordedRows, name: 'backend/results_live.jsonl', imported: false });
  const [selected, setSelected] = useState(recordedRows[0].model);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [replay, setReplay] = useState<number | null>(null);
  const request = useRef(0);
  const summary = useMemo(() => summarizeHumanEval(dataset.rows), [dataset.rows]);
  const model = summary.models.find(m => m.id === selected) ?? summary.models[0];
  const cursor = replay ?? summary.duration;
  const maxMs = Math.max(1000, ...summary.models.map(m => m.averageMs ?? 0)) * 1.18;
  async function load(file?: File) {
    if (!file) return;
    const current = ++request.current;
    setReading(true); setError('');
    try {
      if (file.size > MAX_RESULT_BYTES) throw new Error('결과 파일은 1MB 이하여야 합니다.');
      const rows = parseHumanEval(await file.text());
      if (current !== request.current) return;
      setDataset({ rows, name: file.name, imported: true }); setSelected(rows[0].model); setReplay(null);
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.'); }
    finally { if (current === request.current) setReading(false); }
  }
  function restore() {
    request.current++; setReading(false); setError(''); setReplay(null);
    setDataset({ rows: recordedRows, name: 'backend/results_live.jsonl', imported: false }); setSelected(recordedRows[0].model);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([dataset.rows.map(r => JSON.stringify(r)).join('\n') + '\n'], { type: 'application/x-ndjson' }));
    const a = document.createElement('a'); a.href = url; a.download = 'humaneval-results.jsonl'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="he-results">
    <section className="panel he-source" aria-label="결과 출처">
      <div><span className="eyebrow">NOSANA 추론 × DAYTONA 채점</span><h2>{dataset.imported ? '불러온 실행 기록' : '팀이 실행한 HumanEval 결과'}</h2>
        <p>{dataset.imported ? '사용자가 제공한 기록입니다. 형식을 검증했으며 실행 환경의 진위는 별도로 확인하지 않았습니다.' : '팀원이 저장소에 올린 실행 기록 12건을 읽었습니다. 지금 새로 실행하거나 재측정한 결과는 아닙니다.'}</p>
        <p className="he-muted">{dataset.name} · {summary.models.length}개 모델 · {summary.tasks.length}개 문제 · 측정 날짜 미기록</p></div>
      <div className="he-actions"><label className="button secondary he-upload"><Upload size={15} />{reading ? '검증 중…' : '결과 JSONL 불러오기'}<input aria-label="HumanEval 결과 JSONL 불러오기" type="file" accept=".jsonl,.ndjson" disabled={reading} onChange={e => { void load(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button className="button secondary" onClick={download}><Download size={15} />결과 내보내기</button>
        {dataset.imported && <button className="text-button" onClick={restore}><RotateCcw size={15} />팀 기록으로 돌아가기</button>}</div>
    </section>
    {error && <p role="alert" className="error-banner">{error} 기존 결과를 유지했습니다.</p>}
    {!summary.comparable && <p role="status" className="error-banner">모델별 문제 구성이 다르거나 비교 모델이 부족합니다. 직접 성능 순위를 매길 수 없습니다.</p>}
    <div className="he-cards">{summary.models.map(m => <button key={m.id} className={`panel he-card ${model.id === m.id ? 'he-selected' : ''}`} aria-pressed={model.id === m.id} onClick={() => setSelected(m.id)}>
      <span>{m.name}</span><strong>{format(m.passRate, 1)}<small>%</small></strong><span>문제 통과 {m.passed} / {m.total}</span>
      <div className="he-meter"><span style={{ width: `${m.passRate}%` }} /></div>
      <span>평균 응답 {m.averageMs === null ? '미기록' : `${format(m.averageMs / 1000)}초`} · {m.responseCount}/{m.total}건</span>
      <span>평균 생성 {format(m.averageTokens, 1)} 토큰 · {m.tokenCount}/{m.total}건</span>
      {m.missing.length > 0 && <span className="he-warning">누락: {m.missing.join(', ')}</span>}
    </button>)}</div>
    <div className="he-grid">
      <section className="panel he-chart"><h2>응답 속도와 문제 통과율</h2><p>평균 응답 시간은 값이 기록된 호출만 포함합니다. 시간 초과는 0초로 계산하지 않습니다.</p>
        <svg viewBox="0 0 640 310" role="img" aria-label="모델별 평균 응답 시간과 문제 통과율">
          {[0, 25, 50, 75, 100].map(n => <g key={n}><line x1="60" x2="600" y1={255 - n * 2} y2={255 - n * 2} stroke="#2b3650" /><text x="8" y={260 - n * 2}>{n}%</text></g>)}
          {[0, 1, 2, 3, 4].map(n => <text key={n} x={55 + n * 135} y="281">{format(maxMs * n / 4000, 1)}s</text>)}
          <text x="240" y="306">평균 모델 응답 시간 →</text>
          {summary.models.filter(m => m.averageMs !== null).map((m, i) => <g key={m.id} role="button" tabIndex={0} aria-label={`${m.name} 결과 선택`} onClick={() => setSelected(m.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(m.id); } }}>
            <title>{m.name}: {format(m.averageMs! / 1000)}초, 문제 통과율 {format(m.passRate)}%</title>
            <circle cx={60 + m.averageMs! / maxMs * 540} cy={255 - m.passRate * 2} r={model.id === m.id ? 10 : 7} fill={['#a999ff', '#64dcca', '#f9bd73'][i % 3]} stroke={model.id === m.id ? '#fff' : 'none'} strokeWidth="2" />
            <text x={60 + m.averageMs! / maxMs * 540} y={235 - m.passRate * 2 - (i % 3) * 15} textAnchor="middle">{m.name}</text>
          </g>)}
        </svg><p className="he-muted">동일 문제 구성이라도 소수의 쉬운 코딩 문제로 전체 모델 성능을 일반화할 수 없습니다. 생성 토큰 수는 비용·GPU 사용량이 아닙니다.</p>
      </section>
      <section className="panel he-timeline"><h2>실행 기록 타임라인</h2><p>저장된 시작·종료 시점으로 보는 재생입니다. 라이브 실행 상태가 아닙니다.</p>
        <label htmlFor="he-replay">기록 시점 <strong>{format(cursor)} / {format(summary.duration)}초</strong></label>
        <input id="he-replay" type="range" min="0" max={summary.duration || 1} step="0.01" value={cursor} onChange={e => setReplay(Number(e.target.value))} />
        {summary.models.map(m => <div className="he-lane" key={m.id}><div><span>{m.name}</span><small>{m.rows.filter(r => r.end_s <= cursor).length}/{m.total} 종료</small></div>
          <div className="he-track">{m.rows.map(r => <span key={r.task_id} title={`${r.task_id}: ${r.start_s}–${r.end_s}초 · ${status(r)}`} className={r.end_s > cursor ? 'pending' : r.passed ? 'passed' : 'failed'} style={{ left: `${r.start_s / (summary.duration || 1) * 100}%`, width: `${Math.max(0.2, (r.end_s - r.start_s) / (summary.duration || 1) * 100)}%` }} />)}</div>
        </div>)}<p className="he-muted">보라: 통과 · 주황: 실패/시간 초과 · 회색: 이 시점에 미종료. 추론 이후 채점까지 포함한 구간입니다.</p>
      </section>
    </div>
    <section className="panel he-details"><h2>{model.name} · 문제별 근거</h2><p>통과율은 개별 assert 수가 아닌 문제 단위 통과 여부입니다. 아래 표는 선택한 기록 전체를 표시합니다.</p>
      {onUse && <button className="button primary" onClick={() => onUse(model.id)}>이 모델로 내 작업 이어가기</button>}
      <div className="he-table-scroll" tabIndex={0} aria-label="HumanEval 문제별 결과"><table><thead><tr><th>문제</th><th>결과</th><th>모델 응답</th><th>생성 토큰</th><th>실행 구간</th></tr></thead><tbody>{model.rows.map(r => <tr key={r.task_id}><th>{taskNames.get(r.task_id) ?? r.task_id}<small>{r.task_id}</small></th><td className={r.passed ? 'he-good' : 'he-warning'}>{status(r)}</td><td>{r.time_ms === null ? '미기록' : `${format(r.time_ms / 1000)}초`}</td><td>{format(r.tokens, 0)}</td><td>{format(r.start_s)}–{format(r.end_s)}초</td></tr>)}</tbody></table></div>
      {model.rows.map(r => <details key={r.task_id}><summary>{r.task_id} · 생성 코드 / 채점 오류</summary>{r.error && <p className="he-warning">{r.error}</p>}<pre><code>{r.code || '생성 코드가 기록되지 않았습니다.'}</code></pre></details>)}
    </section>
    <section className="panel he-method"><h2>이 결과를 읽는 방법</h2><p>팀 백엔드는 Nosana의 Gemma·Qwen·GPT-OSS에 HumanEval 문제를 보내고 Daytona Python 샌드박스에서 테스트합니다. 저장된 결과는 모델 응답 시간, 생성 토큰, 문제 통과 여부를 담습니다. GPU 종류·예열·환경 일치는 팀의 실행 설명에 따르며 결과 파일만으로 독립 검증할 수 없습니다.</p><p>실행 날짜·GPU 메모리·실제 비용·반복 측정 분산은 기록에 없습니다. 기존 아키텍처 엔진의 품질 점수나 자원 사용량과 합치지 않습니다.</p>
      <details><summary>새 결과를 연결하려면</summary><p>backend 폴더에서 환경을 준비한 뒤 <code>python bench.py live</code> 또는 <code>python bench.py full</code>을 실행하고 생성된 JSONL을 위에서 불러오세요. 파일은 이 브라우저에서만 읽고 서버로 전송하지 않습니다. 현재 팀 스크립트는 HTTP 실행 API를 제공하지 않습니다.</p><a href="https://github.com/tomzinchoi/daytona_team/tree/main/backend" target="_blank" rel="noreferrer">팀 백엔드 실행 안내 ↗</a></details>
    </section>
  </div>;
}
