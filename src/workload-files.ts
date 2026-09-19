export interface WorkloadFile { name: string; content: string; size: number }
export const FILE_ACCEPT = '.txt,.md,.csv,.json,.js,.ts,.py';
export function mergeWorkloadFiles(existing: WorkloadFile[], added: WorkloadFile[]): WorkloadFile[] {
  const files = [...existing, ...added];
  if (files.length > 5) throw new Error('파일은 최대 5개까지 첨부할 수 있습니다.');
  if (files.reduce((sum, file) => sum + file.size, 0) > 500_000) throw new Error('전체 파일 크기는 500KB 이하여야 합니다.');
  if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('같은 이름의 파일이 이미 첨부되어 있습니다. 기존 파일을 삭제한 뒤 다시 추가해 주세요.');
  return files;
}
export async function readWorkloadFiles(files: File[]): Promise<WorkloadFile[]> {
  if (!files.length || files.length > 5) throw new Error('파일은 한 번에 1~5개까지 선택할 수 있습니다.');
  if (files.reduce((sum, file) => sum + file.size, 0) > 500_000) throw new Error('전체 파일 크기는 500KB 이하여야 합니다.');
  if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('같은 이름의 파일은 한 번만 첨부해 주세요.');
  return Promise.all(files.map(async file => {
    if (!/\.(txt|md|csv|json|js|ts|py)$/i.test(file.name)) throw new Error('TXT, Markdown, CSV, JSON 또는 JS·TS·Python 파일을 선택해 주세요.');
    if (!file.size || file.size > 200_000) throw new Error(`${file.name}: 빈 파일이거나 200KB를 초과했습니다.`);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error(`${file.name}: UTF-8 텍스트 파일로 저장해 주세요.`); }
    if (!content.trim() || content.includes('\0')) throw new Error(`${file.name}: 읽을 수 있는 텍스트가 없습니다.`);
    if (/\.json$/i.test(file.name)) {
      try { JSON.parse(content); } catch { throw new Error(`${file.name}: JSON 형식이 올바르지 않습니다.`); }
    }
    return { name: file.name, content, size: file.size };
  }));
}
export function composeWorkload(text: string, files: WorkloadFile[]): string {
  const result = [text.trim(), ...files.map(file => `첨부 파일: ${file.name}\n${file.content}`)].filter(Boolean).join('\n\n');
  if (result.length > 100_000) throw new Error('설명과 파일 내용을 합쳐 100,000자 이하로 입력해 주세요.');
  return result;
}
