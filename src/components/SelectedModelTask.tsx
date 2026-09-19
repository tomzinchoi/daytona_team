import { useRef, useState } from 'react';
import { z } from 'zod';
import { ACTIVE_MODELS } from '../active-models';
import { composeWorkload, type WorkloadFile } from '../workload-files';
import WorkloadUpload from './WorkloadUpload';
import AnalysisProgress from './AnalysisProgress';
import { parseCriteria, gradeSchema, type Criteria, type Grade } from '../grading';

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
  const gradeLock = useRef(false);
  const [criteriaType, setCriteriaType] = useState<Criteria['type']>('text_exact');
  const [criteriaText, setCriteriaText] = useState('');
  const [grade, setGrade] = useState<Grade | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState('');
  const submittedCriteria = useRef<Criteria | null>(null);
  async function gradeOutput(output: string, criteria: Criteria) {
    if (gradeLock.current) return;
    gradeLock.current = true;
    setGrading(true); setGradeError(''); setGrade(null);
    try {
      const response = await fetch('/api/task-grade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ output, criteria }), signal: AbortSignal.timeout(95000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? '자동 채점 실패');
      setGrade(gradeSchema.parse(data));
    } catch (e) { setGradeError(e instanceof Error ? e.message : '채점할 수 없습니다.'); }
    finally { gradeLock.current = false; setGrading(false); }
  }
  async function execute() {
    if (lock.current || gradeLock.current) return;
    let composed: string;
    let criteria: Criteria;
    try { composed = composeWorkload(workload, files); if (!composed.trim()) throw new Error('작업 설명을 입력하거나 파일을 첨부해 주세요.'); criteria = parseCriteria(criteriaType, criteriaText); }
    catch { setError('작업과 채점 기준을 확인해 주세요. Python 테스트는 functionName과 1~10개의 args/expected 케이스가 필요합니다.'); return; }
    lock.current = true; setBusy(true); setError(''); setResult(null);
    setGrade(null); setGradeError(''); submittedCriteria.current = criteria;
    try {
      const task = criteria.type === 'python' ? `${composed}\n\n반드시 ${criteria.functionName} 함수를 포함하는 완전한 Python 코드만 반환하세요.` : criteria.type === 'json_exact' ? `${composed}\n\nJSON 값만 반환하세요.` : composed;
      const response = await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId, workload: task }), signal: AbortSignal.timeout(60000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? '작업 실행 실패');
      const next = resultSchema.parse(data);
      if (next.modelId !== modelId) throw new Error('선택한 모델과 응답 모델이 다릅니다.');
      setResult(next);
      await gradeOutput(next.output, criteria);
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
    <div className="task-settings"><span>Nosana · {model.model}</span><span>단일 모델 · 최대 출력 2,048토큰</span><span>생성 후 자동 채점 · Python은 격리 실행</span></div>
    <form onSubmit={e => { e.preventDefault(); void execute(); }}>
      <fieldset disabled={busy || grading || reading}><label htmlFor="selected-task-input">실행할 작업</label><textarea id="selected-task-input" value={workload} maxLength={100000} onChange={e => setWorkload(e.target.value)} placeholder="비교한 모델로 수행할 문제와 원하는 결과를 입력하세요." />
      <WorkloadUpload files={files} onChange={setFiles} onReading={setReading} />
      <div className="grading-input"><h3>자동 채점 기준</h3><p>정답·테스트는 모델에 전달하지 않고 채점에만 사용합니다. 제공한 기준의 통과율을 계산합니다.</p>
        <label htmlFor="grade-type">채점 방식</label><select id="grade-type" value={criteriaType} onChange={e => { setCriteriaType(e.target.value as Criteria['type']); setCriteriaText(''); }}>
          <option value="text_exact">텍스트 정답 일치</option><option value="json_exact">JSON 구조·값 일치</option><option value="python">Python 함수 테스트</option>
        </select>
        <label htmlFor="grade-criteria">{criteriaType === 'python' ? '테스트 JSON' : '기대 정답'}</label><textarea id="grade-criteria" value={criteriaText} maxLength={100000} onChange={e => setCriteriaText(e.target.value)} placeholder={criteriaType === 'python' ? '{"functionName":"add","cases":[{"args":[2,3],"expected":5}]}' : '작업의 정답을 입력하세요.'} />
        <label>채점 기준 파일 (.txt / .json)<input type="file" accept=".txt,.json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 100000) { setError('채점 파일은 100KB 이하여야 합니다.'); return; } setReading(true); try { const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); setCriteriaText(text); setError(''); } catch { setError('UTF-8 텍스트 또는 JSON 파일을 선택해 주세요.'); } finally { setReading(false); } }} /></label>
        <button className="button secondary" type="button" onClick={() => { setCriteriaType('python'); setCriteriaText(JSON.stringify({ functionName: 'add', cases: [{ args: [2,3], expected: 5 }, { args: [-2,2], expected: 0 }, { args: [0,0], expected: 0 }] }, null, 2)); setWorkload('두 수 a, b를 받아 합을 반환하는 Python 함수 add(a, b)를 작성하세요. 코드만 출력하세요.'); }}>덧셈 함수 채점 예시 적용</button>
      </div>
      <button className="button primary" type="submit" disabled={busy || reading}>{busy ? '선택한 모델이 작업 중…' : '이 모델로 작업 실행'}</button></fieldset>
    </form>
    {busy && !grading && <AnalysisProgress running={false} />}
    {grading && <p className="grading-status" role="status">자동 채점 중… {submittedCriteria.current?.type === 'python' ? 'Daytona 격리 환경에서 함수 테스트를 실행합니다.' : '기대 정답과 실제 응답을 비교합니다.'}</p>}
    {gradeError && <div className="error-banner" role="alert">{gradeError} 점수를 만들지 않았습니다. <button className="button secondary" disabled={busy || grading} onClick={() => { if (result && submittedCriteria.current) void gradeOutput(result.output, submittedCriteria.current); }}>생성 없이 채점만 다시 시도</button></div>}
    {error && <p className="error-banner" role="alert">{error} 입력은 유지됩니다. 자동으로 재실행하지 않습니다.</p>}
    {result && <section className="task-output" aria-label="작업 결과" aria-live="polite"><h3>작업 결과</h3><p>{model.name} · {(result.elapsedMs / 1000).toFixed(1)}초 · {result.completionTokens ?? '미기록'} 생성 토큰</p>
      <p className="task-evidence">실제 생성 응답 · {grade ? '자동 채점 완료' : grading ? '채점 진행 중' : '채점 미완료'}</p>
      {grade && <section className="grade-result" aria-label="자동 채점 결과"><h3>{grade.score.toFixed(0)}점 · {grade.passed}/{grade.total} 통과</h3><p>{grade.scope}</p><ul>{grade.checks.map((check, i) => <li key={i}><strong>{check.passed ? '통과' : '실패'} · {check.name}</strong>{check.error && <p>{check.error}</p>}{Object.hasOwn(check, 'actual') && <pre>{JSON.stringify(check.actual)}</pre>}</li>)}</ul><details><summary>채점 증거</summary><p>시각: {grade.gradedAt}</p><p>결과 SHA-256: {grade.outputHash}</p><p>기준 SHA-256: {grade.criteriaHash}</p></details></section>}
      {result.finishReason === 'length' && <p role="alert">출력 토큰 한도에 도달했습니다. 결과가 중간에 잘렸을 수 있습니다.</p>}
      <pre>{result.output}</pre><button className="button secondary" onClick={download}>결과 다운로드</button>
    </section>}
    <button className="text-button" disabled={busy || grading} onClick={onBack}>모델 비교로 돌아가기</button>
  </section>;
}
