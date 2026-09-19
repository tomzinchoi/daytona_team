import {test,expect} from '@playwright/test';
test('HumanEval JSON submits selected IDs and renders only returned live rows',async({page})=>{
  let body:unknown;
  await page.route('**/api/live',async route=>{body=route.request().postDataJSON();await route.fulfill({json:{id:'test-run',status:'completed',total:3,rows:[{model:'gemma4-e2b',task_id:'HumanEval/53',passed:true,time_ms:1234}]}})});
  await page.goto('/');
  await page.locator('#workload').fill(JSON.stringify([{task_id:'HumanEval/53',prompt:'def add(x,y):',test:'check',entry_point:'add'}]));
  await page.getByRole('button',{name:'내 워크로드 분석',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'test-run'})).toBeVisible();
  expect(body).toEqual({taskIds:['HumanEval/53']});
  await expect(page.getByRole('cell',{name:'gemma4-e2b / HumanEval/53',exact:true})).toBeVisible();
  await expect(page.getByRole('cell',{name:'1234ms',exact:true})).toBeVisible();
});
