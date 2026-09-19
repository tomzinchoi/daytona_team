import { test, expect } from '@playwright/test';
test('Python criteria are private; grading failure retains output and retry does not regenerate',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'팀 실측 기록 NEW',exact:true}).click();await page.getByRole('button',{name:'이 모델로 내 작업 이어가기'}).click();
  await page.getByRole('button',{name:'덧셈 함수 채점 예시 적용'}).click();
  let generated=0,graded=0;
  await page.route('**/api/task',route=>{generated++;const body=route.request().postDataJSON();expect(body.workload).not.toContain('expected');return route.fulfill({json:{id:'run',modelId:body.modelId,model:'gemma4:e2b',output:'def add(a,b): return a+b',elapsedMs:200,completionTokens:20,finishReason:'stop',evaluation:'NOT_EVALUATED',provider:'Nosana'}});});
  await page.route('**/api/task-grade',async route=>{graded++;const body=route.request().postDataJSON();expect(body.criteria.type).toBe('python');expect(body.criteria.cases).toHaveLength(3);await new Promise(r=>setTimeout(r,350));return graded===1?route.fulfill({status:503,json:{error:{message:'채점 환경 연결 실패'}}}):route.fulfill({json:{status:'GRADED',kind:'MEASURED',method:'python',score:100,passed:3,total:3,checks:[{name:'테스트 1',passed:true,actual:5},{name:'테스트 2',passed:true,actual:0},{name:'테스트 3',passed:true,actual:0}],outputHash:'a'.repeat(64),criteriaHash:'b'.repeat(64),gradedAt:new Date().toISOString(),scope:'사용자 테스트 통과율'}});});
  await page.getByRole('button',{name:'이 모델로 작업 실행'}).click();
  await expect(page.getByRole('status')).toContainText('자동 채점 중');
  await expect(page.getByRole('alert')).toContainText('채점 환경 연결 실패');
  await expect(page.getByRole('region',{name:'작업 결과'})).toContainText('def add');
  await expect(page.getByRole('region',{name:'자동 채점 결과'})).toHaveCount(0);
  await page.getByRole('button',{name:'생성 없이 채점만 다시 시도'}).click();
  await expect(page.getByRole('region',{name:'자동 채점 결과'})).toContainText('100점 · 3/3 통과');
  expect(generated).toBe(1);expect(graded).toBe(2);
  await page.screenshot({path:'artifacts/auto-grading.png',fullPage:true});
});
test('invalid grading criteria prevents paid generation and uploaded JSON can set criteria',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'팀 실측 기록 NEW',exact:true}).click();await page.getByRole('button',{name:'이 모델로 내 작업 이어가기'}).click();
  await page.getByLabel('실행할 작업').fill('함수를 구현하세요.');await page.getByLabel('채점 방식',{exact:true}).selectOption('python');await page.getByLabel('테스트 JSON',{exact:true}).fill('{broken');
  let calls=0;await page.route('**/api/task',route=>{calls++;return route.abort();});await page.getByRole('button',{name:'이 모델로 작업 실행'}).click();await expect(page.getByRole('alert')).toContainText('채점 기준');expect(calls).toBe(0);
  await page.getByLabel('채점 기준 파일 (.txt / .json)').setInputFiles({name:'tests.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({functionName:'add',cases:[{args:[1,2],expected:3}]}))});
  await expect(page.getByLabel('테스트 JSON',{exact:true})).toHaveValue(/functionName/);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
