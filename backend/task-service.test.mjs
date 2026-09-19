import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTask, TASK_MODELS } from './task-service.mjs';

test('selected model and task are forwarded; output never claims evaluated quality', async () => {
  for (const modelId of Object.keys(TASK_MODELS)) {
    const result = await executeTask({ modelId, workload: 'my uploaded task' }, async (url, options) => {
      assert.equal(url, TASK_MODELS[modelId].url + '/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.model, TASK_MODELS[modelId].model);
      assert.equal(body.messages[1].content, 'my uploaded task');
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'real response' }, finish_reason: 'length' }] }) };
    });
    assert.equal(result.evaluation, 'NOT_EVALUATED'); assert.equal(result.completionTokens, null); assert.equal(result.finishReason, 'length');
  }
});
test('invalid model, blank or oversized workload, and provider failures are rejected', async () => {
  for (const input of [{modelId:'__proto__',workload:'x'}, {modelId:'gemma4-e2b',workload:' '}, {modelId:'gemma4-e2b',workload:'a'.repeat(100001)}]) await assert.rejects(executeTask(input), /실행할 모델/);
  await assert.rejects(executeTask({modelId:'gemma4-e2b',workload:'x'}, async () => { throw Error('private upstream message'); }), /시간이 초과/);
  await assert.rejects(executeTask({modelId:'gemma4-e2b',workload:'x'}, async () => ({ok:false,status:503})), /서비스 오류/);
  await assert.rejects(executeTask({modelId:'gemma4-e2b',workload:'x'}, async () => ({ok:true,json:async()=>({choices:[{message:{content:''}}]})})), /최종 답변/);
});
