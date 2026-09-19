import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { FILE_ACCEPT, readWorkloadFiles, type WorkloadFile } from '../workload-files';

export default function WorkloadUpload({ files, onChange, onReading }: { files: WorkloadFile[]; onChange: (files: WorkloadFile[]) => void; onReading: (reading: boolean) => void }) {
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; onReading(false); }, [onReading]);
  async function select(selected: File[]) {
    const token = ++generation.current;
    setError(''); setReading(true); onReading(true);
    try { const parsed = await readWorkloadFiles(selected); if (token === generation.current) onChange(parsed); }
    catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : '파일을 읽을 수 없습니다.'); }
    finally { if (token === generation.current) { setReading(false); onReading(false); } if (input.current) input.current.value = ''; }
  }
  return <div className="workload-upload">
    <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void select(Array.from(e.dataTransfer.files)); }}>
      <Upload size={24} /><strong>워크로드 파일을 여기에 놓으세요</strong>
      <span>텍스트 설명 없이 파일만 첨부해도 됩니다.</span>
      <button type="button" className="button secondary" disabled={reading} onClick={() => input.current?.click()}>{reading ? '파일 읽는 중…' : '파일 선택'}</button>
      <input ref={input} type="file" className="sr-only" aria-label="워크로드 파일 업로드" accept={FILE_ACCEPT} multiple onChange={e => { if (e.target.files?.length) void select(Array.from(e.target.files)); }} />
      <small>TXT · MD · CSV · JSON · JS · TS · PY / 최대 5개, 파일당 200KB</small>
    </div>
    <p className="upload-privacy">파일은 브라우저에서 읽습니다. 실제 분석 요청 전에는 서버에 전송하지 않으며, 파일 안의 코드를 실행하지 않습니다.</p>
    {error && <p role="alert" className="upload-error">{error}</p>}
    {files.map(file => <div className="uploaded-file" key={file.name}>
      <FileText size={16} /><details><summary>{file.name} <small>{(file.size / 1000).toFixed(1)}KB · 내용 미리보기</small></summary><pre>{file.content.slice(0, 2000)}{file.content.length > 2000 ? '\n… 미리보기는 2,000자까지 표시합니다.' : ''}</pre></details>
      <button type="button" aria-label={`${file.name} 삭제`} onClick={() => onChange(files.filter(item => item.name !== file.name))}><X size={16} /></button>
    </div>)}
  </div>;
}
