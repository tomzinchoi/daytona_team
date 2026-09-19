import { test, expect } from '@playwright/test';
test('files can be uploaded without text, previewed, validated, and removed',async({page})=>{
  await page.goto('/');const input=page.getByLabel('워크로드 파일 업로드');
  await input.setInputFiles({name:'workload.md',mimeType:'text/markdown',buffer:Buffer.from('고객 요청을 분류하세요.\n성공 기준: 정확한 카테고리')});
  await expect(page.locator('.uploaded-file')).toContainText('workload.md');await page.locator('.uploaded-file summary').click();
  await expect(page.locator('.uploaded-file pre')).toContainText('고객 요청을 분류하세요');
  await page.getByRole('button',{name:'내 워크로드 분석',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('API');await expect(page.locator('.uploaded-file')).toHaveCount(1);
  await input.setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
  await expect(page.locator('.upload-error')).toContainText('JSON');await expect(page.locator('.uploaded-file')).toContainText('workload.md');
  await page.getByRole('button',{name:'workload.md 삭제'}).click();await expect(page.locator('.uploaded-file')).toHaveCount(0);
});
test('API failures retain user input and never fabricate measurements',async({page})=>{
  await page.goto('/');await page.getByRole('textbox',{name:'반복 작업 설명'}).fill('고객 문의 분류');
  await page.getByRole('button',{name:'내 워크로드 분석',exact:true}).click();await expect(page.getByRole('alert')).toContainText('API');await expect(page.getByRole('textbox')).toHaveValue('고객 문의 분류');
  await expect(page.getByRole('heading',{name:'벤치마크 결과가 없습니다.'})).toBeVisible();
});
test('provider labels are Korean while transport status values remain unchanged',async({page})=>{
  await page.route('**/runtime/api/providers',route=>route.fulfill({json:{providers:[{id:'daytona',status:'LIVE',reason:'연결 확인됨'},{id:'nosana',status:'NOT_CONFIGURED',reason:'미설정'},{id:'dnsimple',status:'ERROR',reason:'조회 오류'}]}}));
  await page.goto('/');await page.getByRole('button',{name:'인프라 상태 07'}).click();await page.getByRole('button',{name:'연결 상태 확인'}).click();
  await expect(page.locator('.provider-card').first()).toContainText('연결됨');await expect(page.locator('.provider-card').nth(2)).toContainText('오류');
  await page.route('**/runtime/api/providers',route=>route.fulfill({status:503}));await page.getByRole('button',{name:'연결 상태 확인'}).click();await expect(page.locator('.provider-card').first()).toContainText('조회 실패');
});
