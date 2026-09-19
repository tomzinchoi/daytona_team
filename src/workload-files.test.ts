import { describe, expect, it } from 'vitest';
import { composeWorkload, mergeWorkloadFiles, readWorkloadFiles } from './workload-files';

describe('workload file input', () => {
  it('adds files without replacing earlier attachments and enforces combined limits', async () => {
    const existing = await readWorkloadFiles([new File(['초안'], 'draft.md')]);
    const added = await readWorkloadFiles([new File(['테스트'], 'tests.txt')]);
    expect(mergeWorkloadFiles(existing, added).map(file => file.name)).toEqual(['draft.md', 'tests.txt']);
    expect(() => mergeWorkloadFiles(existing, existing)).toThrow('같은 이름');
    expect(() => mergeWorkloadFiles(Array.from({length:5}, (_,i) => ({name:`${i}.txt`,content:'x',size:1})), added)).toThrow('5개');
    expect(() => mergeWorkloadFiles([{name:'large.md',content:'',size:499999}], added)).toThrow('500KB');
    expect(existing).toHaveLength(1);
  });
  it('accepts UTF-8 text, structured JSON, CSV, and code as inert text', async () => {
    const files = await readWorkloadFiles([new File(['반복 작업'], 'task.md'), new File(['{"task":"수정"}'], 'cases.json'), new File(['a,b\n1,2'], 'data.csv'), new File(['print("hello")'], 'task.py')]);
    expect(files).toHaveLength(4);
    expect(composeWorkload('', files)).toContain('반복 작업');
    expect(composeWorkload('설명', files)).toContain('첨부 파일: task.py');
  });
  it('rejects unsupported, empty, oversized, duplicate, malformed, and binary files', async () => {
    for (const files of [[new File(['x'], 'report.pdf')], [new File([], 'empty.txt')], [new File(['x'.repeat(200001)], 'large.txt')], [new File(['{'], 'bad.json')], [new File([new Uint8Array([255,254])], 'binary.txt')], [new File(['a\0b'], 'null.txt')], [new File(['a'], 'same.txt'), new File(['b'], 'same.txt')]]) await expect(readWorkloadFiles(files)).rejects.toThrow();
  });
  it('bounds total size, file count and final composed request', async () => {
    await expect(readWorkloadFiles(Array.from({length:6},(_,i)=>new File(['x'],`${i}.txt`)))).rejects.toThrow();
    await expect(readWorkloadFiles(Array.from({length:3},(_,i)=>new File(['x'.repeat(180000)],`${i}.txt`)))).rejects.toThrow();
    expect(()=>composeWorkload('x'.repeat(100001),[])).toThrow();
  });
});
