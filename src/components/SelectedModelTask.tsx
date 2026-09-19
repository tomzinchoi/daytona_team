import { useRef, useState } from 'react';
import { z } from 'zod';
import { ACTIVE_MODELS } from '../active-models';
import { composeWorkload, type WorkloadFile } from '../workload-files';
import WorkloadUpload from './WorkloadUpload';
import AnalysisProgress from './AnalysisProgress';

const resultSchema = z.object({ id: z.string(), modelId: z.string(), model: z.string(), output: z.string(), elapsedMs: z.number().nonnegative(), completionTokens: z.number().nullable(), finishReason: z.string().nullable(), evaluation: z.literal('NOT_EVALUATED'), provider: z.literal('Nosana') });
type Result = z.infer<typeof resultSchema>;
export default function SelectedModelTask({ modelId, initialWorkload, onBack }: { modelId: string; initialWorkload: string; onBack: () => void }) {
  const model = ACTIVE_MODELS.find(m => m.id === modelId)!;
  const [workload, setWorkload] = useState(initialWorkload);
  const [files, setFiles] = useState<WorkloadFile[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const lock = useRef(false);
  async function execute() {
    if (lock.current) return;
    let composed: string;
    try { composed = composeWorkload(workload, files); if (!composed.trim()) throw new Error('작업 설명을 입력하거나 파일을 첨부해 주세요.'); }
    catch (e) { setError(e instanceof Error ? e.message : '입력을 확인해 주세요.'); return; }
    lock.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId, workload: composed }), signal: AbortSignal.timeout(60000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? '작업 실행 실패');
      const next = resultSchema.parse(data);
      if (next.modelId !== modelId) throw new Error('선택한 모델과 응답 모델이 다릅니다.');
      setResult(next);
    } catch (e) { setError(e instanceof Error ? e.message : '작업 결과를 받지 못했습니다.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.output], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `atlas-${modelId}-result.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel selected-task" aria-label="선택한 모델로 작업">
    <span className="eyebrow">비교 → 선택 → 실행</span><h2>{model.name}로 내 작업 이어가기</h2>
    <p>비교 화면에서 선택한 모델을 그대로 사용합니다. 현재 참고한 HumanEval 기록은 내 새 작업의 품질을 보장하지 않습니다.</p>
    <div className="task-settings"><span>Nosana · {model.model}</span><span>단일 모델 · 최대 출력 2,048토큰</span><span>생성 작업 · 코드 자동 실행 없음</span></div>
    <form onSubmit={e => { e.preventDefault(); void execute(); }}>
      <fieldset disabled={busy}><label htmlFor="selected-task-input">실행할 작업</label><textarea id="selected-task-input" value={workload} maxLength={100000} onChange={e => setWorkload(e.target.value)} placeholder="비교한 모델로 수행할 문제와 원하는 결과를 입력하세요." />
      <WorkloadUpload files={files} onChange={setFiles} onReading={setReading} />
      <button className="button primary" type="submit" disabled={busy || reading}>{busy ? '선택한 모델이 작업 중…' : '이 모델로 작업 실행'}</button></fieldset>
    </form>
    {busy && <AnalysisProgress running={false} />}
    {error && <p className="error-banner" role="alert">{error} 입력은 유지됩니다. 자동으로 재실행하지 않습니다.</p>}
    {result && <section className="task-output" aria-label="작업 결과" aria-live="polite"><h3>작업 결과</h3><p>{model.name} · {(result.elapsedMs / 1000).toFixed(1)}초 · {result.completionTokens ?? '미기록'} 생성 토큰</p>
      <p className="task-evidence">실제 생성 응답 · 품질 미평가 · 테스트 미실행</p>
      {result.finishReason === 'length' && <p role="alert">출력 토큰 한도에 도달했습니다. 결과가 중간에 잘렸을 수 있습니다.</p>}
      <pre>{result.output}</pre><button className="button secondary" onClick={download}>결과 다운로드</button>
    </section>}
    <button className="text-button" disabled={busy} onClick={onBack}>모델 비교로 돌아가기</button>
  </section>;
}
