import { test, expect } from '@playwright/test';
test('recorded results never become measurements for a new workload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '벤치마크 결과가 없습니다.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '성능 비교 04' })).toBeDisabled();
  await page.getByRole('button', { name: /Nosana × Daytona 실측 기록 보기/ }).click();
  await expect(page.getByRole('heading', { name: '팀이 실행한 HumanEval 결과' })).toBeVisible();
  await page.getByRole('button', { name: '새 벤치마크' }).click();
  await expect(page.getByRole('heading', { name: '벤치마크 결과가 없습니다.' })).toBeVisible();
  await expect(page.locator('.comparison-table')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('empty benchmark state fits mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '벤치마크 결과가 없습니다.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
