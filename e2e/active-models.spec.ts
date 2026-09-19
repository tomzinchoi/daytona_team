import { test, expect } from '@playwright/test';
test('only the three configured models are offered, without synthetic architecture entrypoints', async ({ page }) => {
  await page.goto('/');
  const models = page.getByRole('list', { name: '실제 실행 모델' });
  await expect(models.getByRole('listitem')).toHaveCount(3);
  await expect(models).toContainText('gemma4:e2b');
  await expect(models).toContainText('qwen3.5:9b');
  await expect(models).toContainText('gpt-oss:20b');
  await expect(page.getByRole('button', { name: /데모 미리보기: 저장소 버그 수정/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daytona 실측 워크로드 준비' })).toHaveCount(0);
  await page.getByRole('button', { name: /Nosana × Daytona 실측 기록 보기/ }).click();
  await expect(page.locator('.he-card')).toHaveCount(3);
  await expect(page.locator('main')).not.toContainText('DeepSeek');
});
