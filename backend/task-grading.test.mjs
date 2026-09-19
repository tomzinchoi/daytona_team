import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeTask, gradeInputSchema, runPython } from './task-grading.mjs';
test('text and JSON are objectively graded, including false and zero', async () => {
  assert.equal((await gradeTask({output:' yes\n',criteria:{type:'text_exact',expected:'yes'}})).score,100);
  assert.equal((await gradeTask({output:'no',criteria:{type:'text_exact',expected:'yes'}})).score,0);
  assert.equal((await gradeTask({output:'```json\n{"b":2,"a":1}\n```',criteria:{type:'json_exact',expected:{a:1,b:2}}})).score,100);
  assert.equal((await gradeTask({output:'false',criteria:{type:'json_exact',expected:false}})).score,100);
  assert.equal((await gradeTask({output:'0',criteria:{type:'json_exact',expected:0}})).score,100);
  assert.equal((await gradeTask({output:'not json',criteria:{type:'json_exact',expected:0}})).checks[0].error,'응답이 올바른 JSON이 아닙니다.');
});
test('invalid criteria rejected before provisioning', () => {
  for (const criteria of [{type:'json_exact'},{type:'python',functionName:'a;sh',cases:[{args:[],expected:1}]},{type:'python',functionName:'add',cases:[]},{type:'python',functionName:'add',cases:[{args:[]}]}]) assert.equal(gradeInputSchema.safeParse({output:'x',criteria}).success,false);
});
test('Python grade compares actual outputs outside sandbox and explains each failure', async () => {
  const criteria={type:'python',functionName:'add',cases:[{args:[1,2],expected:3},{args:[0,0],expected:0},{args:[-1,1],expected:0}]};
  const result=await gradeTask({output:'def add(a,b): return a+b',criteria},async()=>({sandboxId:'test',rows:[{actual:3},{actual:4},{error:'time limit'}]}));
  assert.equal(result.passed,1);assert.equal(result.total,3);assert.ok(Math.abs(result.score-100/3)<1e-10);assert.equal(result.checks[2].error,'time limit');assert.equal(result.kind,'MEASURED');
  await assert.rejects(gradeTask({output:'x',criteria},async()=>{throw Error('provisioning');}),/provisioning/);
});
test('Python sandbox receives no expected answers and is deleted on parse failure', async () => {
  let deleted=false;const uploads=[];
  const client={async create(options){assert.equal(options.networkBlockAll,true);return {id:'test',fs:{async createFolder(){},async uploadFile(data,path){uploads.push({data:data.toString(),path});}},process:{async executeCommand(){return {exitCode:0,result:'bad JSON'}}},async delete(){deleted=true;}}},async [Symbol.asyncDispose](){}};
  await assert.rejects(runPython('def add(a,b): return a+b',{functionName:'add',cases:[{args:[1,2],expected:'secret_expected'}]},client));
  assert.equal(deleted,true);assert.ok(uploads.every(u=>!u.data.includes('secret_expected')));
});
