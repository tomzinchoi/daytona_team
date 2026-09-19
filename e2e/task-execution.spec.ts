import { test, expect } from '@playwright/test';
test('selected benchmark model carries the workload into execution and downloads actual response', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox', {name:'반복 작업 설명'}).fill('내 CSV 파일을 요약해 주세요.');
  await page.getByLabel('워크로드 파일 업로드').setInputFiles({name:'data.csv',mimeType:'text/csv',buffer:Buffer.from('name,value\na,12')});
  await page.getByRole('button',{name:'팀 실측 기록 NEW',exact:true}).click();
  await page.getByRole('button',{name:/Qwen 3.5 9B.*75/}).click();
  await page.getByRole('button',{name:'이 모델로 내 작업 이어가기'}).click();
  await expect(page.getByRole('heading',{name:'Qwen 3.5 9B로 내 작업 이어가기'})).toBeVisible();
  await expect(page.getByLabel('실행할 작업')).toContainText('data.csv');
  await page.getByLabel('기대 정답').fill('합계: 12');
  await page.route('**/api/task-grade', route => route.fulfill({json:{status:'GRADED',kind:'MEASURED',method:'text_exact',score:100,passed:1,total:1,checks:[{name:'정답 일치',passed:true}],outputHash:'a'.repeat(64),criteriaHash:'b'.repeat(64),gradedAt:new Date().toISOString(),scope:'사용자 기준 통과율'}}));
  let calls=0;
  await page.route('**/api/task',async route=>{
    calls++; const body=route.request().postDataJSON(); expect(body.modelId).toBe('qwen3.5-9b');expect(body.workload).toContain('a,12');
    await new Promise(resolve=>setTimeout(resolve,500));
    await route.fulfill({json:{id:'test-run',modelId:body.modelId,model:'qwen3.5:9b',output:'합계: 12',elapsedMs:1500,completionTokens:10,finishReason:'stop',evaluation:'NOT_EVALUATED',provider:'Nosana'}});
  });
  await page.getByRole('button',{name:'이 모델로 작업 실행'}).click();
  await expect(page.getByRole('button',{name:'선택한 모델이 작업 중…'})).toBeDisabled();
  await expect(page.getByRole('region',{name:'작업 결과'})).toContainText('합계: 12');
  await expect(page.getByRole('region',{name:'작업 결과'})).toContainText('자동 채점 완료');
  await expect(page.getByRole('region',{name:'자동 채점 결과'})).toContainText('100점');
  expect(calls).toBe(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'결과 다운로드'}).click();expect((await download).suggestedFilename()).toBe('atlas-qwen3.5-9b-result.txt');
  await page.screenshot({path:'artifacts/selected-task-result.png',fullPage:true});
});
test('task failure retains input and does not fabricate a result',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'팀 실측 기록 NEW',exact:true}).click();await page.getByRole('button',{name:'이 모델로 내 작업 이어가기'}).click();
  await page.getByLabel('실행할 작업').fill('처리할 내 문제');
  await page.getByLabel('기대 정답').fill('정답');
  await page.route('**/api/task',route=>route.fulfill({status:504,json:{error:{message:'모델 응답 시간 초과'}}}));
  await page.getByRole('button',{name:'이 모델로 작업 실행'}).click();await expect(page.getByRole('alert')).toContainText('시간 초과');
  await expect(page.getByLabel('실행할 작업')).toHaveValue('처리할 내 문제');await expect(page.getByRole('region',{name:'작업 결과'})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
