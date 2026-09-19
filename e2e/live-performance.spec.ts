import { test, expect } from '@playwright/test';
const id = '0378f25e-124c-41cc-a4ba-9843351ca5bf';
const models = ['gemma4-e2b', 'qwen3.5-9b', 'gpt-oss-20b'];
const times = [[3927, 2418, 1866, 3653], [16216, 10654, 8852, 21276], [2024, 2001, 2088, 2242]];
const rows = models.flatMap((model, i) => [53, 23, 45, 7].map((task, j) => ({ model, task_id: `HumanEval/${task}`, passed: true, time_ms: times[i][j], tokens: null })));
test('restored completed live run automatically shows current performance and enables results navigation', async ({ page }) => {
  await page.route('**/api/live?*', route => route.fulfill({ json: { id, status: 'completed', total: 12, rows } }));
  await page.goto(`/?liveRun=${id}`);
  const table = page.getByRole('region', { name: '실행 벤치마크 성능표' });
  await expect(table).toBeVisible();
  await expect(page.locator('.workload-grid').getByRole('region', { name: '실행 벤치마크 성능표' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '벤치마크 결과가 없습니다.' })).toHaveCount(0);
  await expect(table.getByRole('row').filter({ hasText: 'Gemma 4 E2B' })).toContainText('2.966초');
  await expect(table.getByRole('row').filter({ hasText: 'Qwen 3.5 9B' })).toContainText('14.25초');
  await expect(table.getByRole('row').filter({ hasText: 'GPT-OSS 20B' })).toContainText('2.089초');
  await expect(table.getByText('100%', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: '성능 비교 04' }).click();
  await expect(table).toBeVisible();
  await page.getByRole('button', { name: '새 벤치마크' }).click();
  await expect(table).toHaveCount(0);
  await expect(page.getByRole('region', { name: '저장된 실측 성능표' })).toBeVisible();
  await expect(page.getByRole('button', { name: '성능 비교 04' })).toBeEnabled();
});
test('live results keep updating after opening performance comparison', async ({ page }) => {
  let finish = false;
  await page.route('**/api/live?*', route => route.fulfill({ json: {
    id, status: finish ? 'completed' : 'running', total: 12,
    rows: finish ? rows : rows.slice(0, 1),
  } }));
  await page.goto(`/?liveRun=${id}`);
  const table = page.getByRole('region', { name: '실행 벤치마크 성능표' });
  await expect(table).toContainText('현재까지 반환된 결과');
  await page.getByRole('button', { name: '성능 비교 04' }).click();
  finish = true;
  await expect(table).toContainText('세 모델의 실행 결과를 집계했습니다.', { timeout: 10000 });
  await expect(table.getByText('100%', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: '워크로드 01' }).click();
  await expect(page.locator('.workload-grid').getByRole('region', { name: '실행 벤치마크 성능표' })).toContainText('14.25초');
});
test('partial failed run preserves missing response timing and fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/live?*', route => route.fulfill({ json: { id, status: 'failed', total: 12, rows: [{ model: 'qwen3.5-9b', task_id: 'HumanEval/53', passed: false, time_ms: null }] } }));
  await page.goto(`/?liveRun=${id}`);
  const table = page.getByRole('region', { name: '실행 벤치마크 성능표' });
  await expect(table.getByRole('row').filter({ hasText: 'Qwen 3.5 9B' })).toContainText('미측정');
  await expect(table).toContainText('미완료 모델');
  await page.getByRole('button', { name: '성능 비교 04' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
