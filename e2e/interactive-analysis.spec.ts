import { test, expect } from '@playwright/test';
test('recorded scatter supports keyboard selection with per-problem evidence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Nosana × Daytona 실측 기록 보기/ }).click();
  const point = page.getByRole('button', { name: 'GPT-OSS 20B 결과 선택' });
  await point.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'GPT-OSS 20B · 문제별 근거' })).toBeVisible();
  await page.getByText('HumanEval/53 · 생성 코드 / 채점 오류', { exact: true }).click();
  await expect(page.locator('.he-details pre').first()).toContainText('return x + y');
});
