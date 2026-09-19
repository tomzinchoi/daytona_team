import { test, expect } from '@playwright/test';

test('team records show real pass rates, missing timing, timeline and downloadable JSONL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '팀 실측 기록' }).click();
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  await expect(page.getByText('지금 새로 실행하거나 재측정한 결과는 아닙니다.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Qwen 3.5 9B.*75/ }).click();
  await expect(page.getByRole('heading', { name: 'Qwen 3.5 9B · 문제별 근거' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '삼각형 넓이' });
  await expect(row).toContainText('시간 초과');
  await expect(row).toContainText('미기록');
  await page.getByLabel('기록 시점').fill('0');
  await expect(page.getByText('0/4 종료')).toHaveCount(3);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '결과 내보내기' }).click();
  expect((await download).suggestedFilename()).toBe('humaneval-results.jsonl');
});

test('JSONL import handles malformed files without losing results and does not send files to a server', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '팀 실측 기록' }).click();
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()); });
  const input = page.getByLabel('HumanEval 결과 JSONL 불러오기');
  await input.setInputFiles({ name: 'bad.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from('{bad}') });
  await expect(page.getByRole('alert')).toContainText('기존 결과를 유지');
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  const record = { model: 'custom-model', task_id: 'HumanEval/53', passed: false, time_ms: null, tokens: null, error: 'Request timed out.', start_s: 0, end_s: 15 };
  await input.setInputFiles({ name: 'results.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(JSON.stringify(record)) });
  await expect(page.getByRole('alert')).toContainText('현재 데모는');
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  record.model = 'qwen3.5-9b';
  await input.setInputFiles({ name: 'results.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(JSON.stringify(record)) });
  await expect(page.getByRole('heading', { name: '불러온 실행 기록' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('비교 모델이 부족');
  await expect(page.getByRole('heading', { name: 'Qwen 3.5 9B · 문제별 근거' })).toBeVisible();
  await page.getByRole('button', { name: '팀 기록으로 돌아가기' }).click();
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  expect(uploads).toEqual([]);
});

test('recorded results remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Nosana × Daytona 실측 기록 보기', exact: false }).click();
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/humaneval-mobile.png', fullPage: true });
});
