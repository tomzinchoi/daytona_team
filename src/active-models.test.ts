import { expect, it } from 'vitest';
import { ACTIVE_MODELS, isActiveModel } from './active-models';
import { parseHumanEval } from './humaneval';

it('only accepts the three configured deployment models', () => {
  expect(ACTIVE_MODELS.map(m => m.model)).toEqual(['gemma4:e2b', 'qwen3.5:9b', 'gpt-oss:20b']);
  expect(isActiveModel('DeepSeek R1 7B')).toBe(false);
  for (const model of ACTIVE_MODELS) {
    expect(isActiveModel(model.model)).toBe(true);
    expect(parseHumanEval(JSON.stringify({model:model.id, task_id:'HumanEval/0', passed:false, time_ms:null, tokens:null, start_s:0, end_s:1}))).toHaveLength(1);
  }
  expect(() => parseHumanEval(JSON.stringify({model:'deepseek', task_id:'HumanEval/0', passed:false, time_ms:null, tokens:null, start_s:0, end_s:1}))).toThrow('지원');
});
