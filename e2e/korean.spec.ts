import { test, expect, type Page } from '@playwright/test';
async function results(page: Page) {
  await page.getByRole('button', {name:/저장소 버그 수정/}).click();
  await expect(page.getByRole('heading', {name:/15.*구성을 탐색/})).toBeVisible();
  await page.getByRole('button',{name:'벤치마크 단계 미리보기'}).click();
  await expect(page.locator('.stage-status').first()).toContainText('예시');
  await page.getByRole('button',{name:'예시 결과 보기'}).click();
  await expect(page.getByRole('heading',{name:/세 가지 선택 기준/})).toBeVisible();
}
test('Korean demo preserves comparison, selection, export, and reset', async ({page}) => {
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('lang','ko');
  await expect(page.getByRole('heading',{name:'벤치마크 결과가 없습니다.'})).toBeVisible();
  await page.screenshot({path:'artifacts/ko-workload-desktop.png',fullPage:true});
  for(let i=0;i<2;i++) {
    await results(page); await expect(page.locator('.recommendation-card')).toHaveCount(3);
    await expect(page.locator('.comparison-table')).toBeVisible();
    await page.getByRole('combobox',{name:'구성 선택'}).selectOption('12');
    await expect(page.locator('.detail')).toContainText('95');
    await page.getByText('품질은 어떻게 계산하나요?').click();
    await expect(page.locator('.quality-explainer')).toContainText('실제 실행 결과가 아닙니다');
    await page.locator('.comparison-table').getByRole('button',{name:'Qwen → Gemma 구성 #03',exact:true}).click();
    await expect(page.locator('.detail')).toContainText('구성 #03');
    if(!i) await page.screenshot({path:'artifacts/ko-comparison-desktop.png',fullPage:true});
    await page.locator('.recommendation-card.balanced').getByRole('button',{name:'이 구성 선택'}).click();
    await expect(page.getByRole('heading',{name:'선택한 실행 구성'})).toBeVisible();
    await expect(page.locator('.selection')).toContainText('실제 서비스 배포는 진행하지 않았습니다');
    const download=page.waitForEvent('download'); await page.getByRole('button',{name:'구성 내보내기'}).click();
    expect((await download).suggestedFilename()).toBe('atlas-configuration-08.json');
    await page.getByRole('button',{name:'새 벤치마크'}).click();
  } expect(errors).toEqual([]);
});
test('3D bars render and context loss restores the comparison table',async({page})=>{
  await page.goto('/'); await results(page);
  await page.getByRole('button',{name:'3D',exact:true}).click(); await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button',{name:'비교 화면 확대'}).click(); await expect(page.locator('.space')).toHaveClass(/expanded/);
  await page.screenshot({path:'artifacts/ko-3d-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'비교 화면 축소'}).click(); await page.locator('canvas').dispatchEvent('webglcontextlost');
  await expect(page.getByText('3D를 사용할 수 없어 2D 비교표로 표시합니다.')).toBeVisible(); await expect(page.locator('.comparison-table')).toBeVisible();
});
test('WebGL initialization failure has a useful 2D fallback',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind:string,options?:unknown){if(kind.includes('webgl'))return null;return original.call(this,kind as '2d',options);} as typeof HTMLCanvasElement.prototype.getContext;});
  await page.goto('/');await results(page);await page.getByRole('button',{name:'3D',exact:true}).click();
  await expect(page.getByText('3D를 사용할 수 없어 2D 비교표로 표시합니다.')).toBeVisible(); await expect(page.locator('.comparison-table')).toBeVisible();
});
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
  await page.route('**/engine/api/demo-workload',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.getByRole('button',{name:'엔진의 코딩 워크로드 탐색'}).click();await expect(page.getByRole('alert')).toContainText('HTTP 503');
});
test('provider labels are Korean while transport status values remain unchanged',async({page})=>{
  await page.route('**/runtime/api/providers',route=>route.fulfill({json:{providers:[{id:'daytona',status:'LIVE',reason:'연결 확인됨'},{id:'nosana',status:'NOT_CONFIGURED',reason:'미설정'},{id:'dnsimple',status:'ERROR',reason:'조회 오류'}]}}));
  await page.goto('/');await page.getByRole('button',{name:'인프라 상태 07'}).click();await page.getByRole('button',{name:'연결 상태 확인'}).click();
  await expect(page.locator('.provider-card').first()).toContainText('연결됨');await expect(page.locator('.provider-card').nth(2)).toContainText('오류');
  await page.route('**/runtime/api/providers',route=>route.fulfill({status:503}));await page.getByRole('button',{name:'연결 상태 확인'}).click();await expect(page.locator('.provider-card').first()).toContainText('연결 안 됨');
});
test('mobile comparison scrolls internally without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await results(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/ko-results-mobile.png',fullPage:true});
  await page.locator('.recommendation-card.efficient').getByRole('button').click();await expect(page.getByRole('heading',{name:'선택한 실행 구성'})).toBeVisible();
});
