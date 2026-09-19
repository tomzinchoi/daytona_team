import { expect, test } from "@playwright/test";

const file = (name: string, text = "평가할 작업") => ({ name, mimeType: "text/plain", buffer: Buffer.from(text) });

test("adding attachments retains existing files and demo preserves the draft", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "반복 작업 설명" }).fill("나의 워크로드 초안");
  const input = page.getByLabel("워크로드 파일 업로드");
  await input.setInputFiles(file("first.md"));
  await input.setInputFiles(file("second.md"));
  await expect(page.locator(".uploaded-file")).toHaveCount(2);
  await page.getByRole("button", { name: /데모 미리보기: 저장소 버그 수정/ }).click();
  await page.getByRole("button", { name: "워크로드 01" }).click();
  await expect(page.getByRole("textbox", { name: "반복 작업 설명" })).toHaveValue("나의 워크로드 초안");
  await expect(page.locator(".uploaded-file")).toHaveCount(2);
});

test("reset invalidates an in-flight file read and clears upload errors", async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise<void>(resolve => {
        Object.assign(window, { finishFileRead: resolve });
      });
      const result = await read.call(this);
      Object.assign(window, { fileReadFinished: true });
      return result;
    };
  });
  await page.goto("/");
  await page.getByLabel("워크로드 파일 업로드").setInputFiles(file("slow.md"));
  await expect(page.getByRole("button", { name: "파일 읽는 중…" })).toBeVisible();
  await page.getByRole("button", { name: "새 벤치마크" }).click();
  await page.evaluate(() => (window as unknown as { finishFileRead: () => void }).finishFileRead());
  await expect.poll(() => page.evaluate(() => (window as unknown as { fileReadFinished: boolean }).fileReadFinished)).toBe(true);
  await expect(page.getByRole("button", { name: "파일 선택", exact: true })).toBeEnabled();
  await expect(page.locator(".uploaded-file")).toHaveCount(0);
  await page.getByLabel("워크로드 파일 업로드").setInputFiles(file("invalid.exe"));
  await expect(page.locator(".upload-error")).toBeVisible();
  await page.getByRole("button", { name: "새 벤치마크" }).click();
  await expect(page.locator(".upload-error")).toHaveCount(0);
});

test("unknown and failed provider checks do not claim a disconnected service", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "인프라 상태 07" }).click();
  await expect(page.locator(".provider-card .badge").first()).toHaveText("확인 전");
  await page.route("**/runtime/api/providers", route => route.fulfill({ status: 503 }));
  await page.getByRole("button", { name: "연결 상태 확인" }).click();
  await expect(page.locator(".provider-card .badge").first()).toHaveText("조회 실패");
  await expect(page.locator(".runtime-mini")).toContainText("조회 실패");
});
