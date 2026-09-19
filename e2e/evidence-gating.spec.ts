import { test, expect } from "@playwright/test";
import { architecturesEndpoint } from "../benchmark-engine/src/api";
import { DEMO_WORKLOAD } from "../benchmark-engine/src/benchmark/demo";

test("unrun workloads have no performance table, including after a demo reset", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "벤치마크 결과가 없습니다." })).toBeVisible();
  await expect(page.locator(".comparison-table")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "성능 비교 04" })).toBeDisabled();
  await page.screenshot({ path: "artifacts/benchmark-not-run.png", fullPage: true });
  await page.getByRole("button", { name: /데모 미리보기: 저장소 버그 수정/ }).click();
  await expect(page.locator(".comparison-table")).toBeVisible();
  await expect(page.locator(".plot-source")).toHaveText("예시 데이터 · 실제 측정 아님");
  await page.getByRole("button", { name: "새 벤치마크" }).click();
  await expect(page.getByRole("heading", { name: "벤치마크 결과가 없습니다." })).toBeVisible();
  await expect(page.locator(".comparison-table")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("candidate screening never renders predictions as measured performance", async ({ page }) => {
  await page.route("**/engine/api/demo-workload", route => route.fulfill({ json: { workload: DEMO_WORKLOAD } }));
  await page.route("**/engine/api/architectures", route => route.fulfill({ json: architecturesEndpoint({ workload: DEMO_WORKLOAD }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "엔진의 코딩 워크로드 탐색" }).click();
  await expect(page.locator(".candidate")).toHaveCount(15);
  await expect(page.getByRole("heading", { name: "벤치마크 결과가 없습니다." })).toBeVisible();
  await expect(page.locator(".comparison-table")).toHaveCount(0);
  await expect(page.locator(".detail-metrics")).toContainText("미측정");
  await expect(page.getByRole("button", { name: "이 구성 선택" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "성능 비교 04" })).toBeDisabled();
  await page.getByRole("button", { name: "Daytona 벤치마크 시작" }).click();
  await expect(page.getByRole("alert")).toContainText("전체 워크로드 실행과 실측 결과 연동은 아직 준비 중");
  await page.screenshot({ path: "artifacts/candidates-not-measured.png", fullPage: true });
});

test("empty benchmark state fits mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "벤치마크 결과가 없습니다." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
