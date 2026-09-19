import { test, expect } from "@playwright/test";

async function results(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Repository bug fixes" }).click();
  await expect(page.getByText("15 configurations explored.")).toBeVisible();
  await page.getByRole("button", { name: "Preview benchmark stages" }).click();
  await expect(
    page.getByText("DEMO · PROVISIONING", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("DEMO · RUNNING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reveal demo results" }).click();
  await expect(
    page.getByRole("heading", { name: "Three ways forward." }),
  ).toBeVisible();
}

test("desktop demo is repeatable, selectable, exportable and has no page errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.screenshot({
    path: "artifacts/workload-desktop.png",
    fullPage: true,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await results(page);
    await expect(page.locator(".recommendation-card")).toHaveCount(3);
    await expect(page.locator(".recommendation-card.balanced")).toContainText(
      "90%",
    );
    if (attempt === 0)
      await page.screenshot({
        path: "artifacts/results-desktop.png",
        fullPage: true,
      });
    await page
      .getByRole("combobox", { name: "Inspect configuration" })
      .selectOption("12");
    await expect(page.locator(".detail")).toContainText("95");
    await page.getByText("How is quality calculated?").click();
    await expect(page.locator(".quality-explainer")).toContainText(
      "20 assertions",
    );
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "2D latency versus quality scatter plot" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Inspect architecture 03", exact: true })
      .click();
    await expect(page.locator(".detail")).toContainText("ARCHITECTURE #03");
    await page
      .locator(".recommendation-card.balanced")
      .getByRole("button", { name: "Use this configuration" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Selected Production Configuration" }),
    ).toBeVisible();
    await expect(page.locator(".selection")).toContainText("Architecture #08");
    await expect(page.locator(".selection")).toContainText(
      "No production deployment",
    );
    if (attempt === 0) {
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export configuration" }).click();
      expect((await downloaded).suggestedFilename()).toBe(
        "atlas-configuration-08.json",
      );
      await page.screenshot({
        path: "artifacts/selection-desktop.png",
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "New benchmark" }).click();
  }
  expect(errors).toEqual([]);
});

test("WebGL initialization failure falls back without losing the demo", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: string,
      options?: unknown,
    ) {
      if (kind.includes("webgl")) return null;
      return original.call(this, kind as "2d", options);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(
    page.getByText("3D unavailable. Showing the 2D fallback."),
  ).toBeVisible();
  await results(page);
  await expect(
    page.getByRole("img", { name: "2D latency versus quality scatter plot" }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/fallback-desktop.png",
    fullPage: true,
  });
});

test("context loss recovers to 2D and manual view controls work", async ({
  page,
}) => {
  await page.goto("/");
  await results(page);
  await page.getByRole("button", { name: "Expand chart" }).click();
  await expect(page.locator(".space")).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Collapse chart" }).click();
  await page.locator("canvas").dispatchEvent("webglcontextlost");
  await expect(
    page.getByText("3D unavailable. Showing the 2D fallback."),
  ).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("custom workload is not silently replaced by demo data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Recurring workload" })
    .fill("Classify customer support tickets");
  await page
    .getByRole("button", { name: "Benchmark my workload", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "A benchmark API is not connected",
  );
  await expect(page.getByRole("textbox")).toHaveValue(
    "Classify customer support tickets",
  );
});

test("provider statuses come from the API, and outage removes stale status", async ({
  page,
}) => {
  await page.route("**/runtime/api/providers", (route) =>
    route.fulfill({
      json: {
        providers: [
          { id: "daytona", status: "LIVE", reason: "Runtime verified." },
          {
            id: "nosana",
            status: "NOT_CONFIGURED",
            reason: "No credential configured.",
          },
          {
            id: "dnsimple",
            status: "ERROR",
            reason: "Provider status failed.",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Providers 07" }).click();
  await page.getByRole("button", { name: "Check runtime connections" }).click();
  await expect(page.locator(".provider-card").first()).toContainText("LIVE");
  await expect(page.locator(".provider-card").nth(1)).toContainText(
    "NOT CONNECTED",
  );
  await expect(page.locator(".provider-card").nth(2)).toContainText("ERROR");
  await page.route("**/runtime/api/providers", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.getByRole("button", { name: "Check runtime connections" }).click();
  await expect(page.locator(".provider-actions")).toContainText(
    "Runtime status is unavailable",
  );
  await expect(page.locator(".provider-card").first()).toContainText(
    "NOT CONNECTED",
  );
});

test("engine failure is actionable, never replaced by invented results", async ({
  page,
}) => {
  await page.route("**/engine/api/demo-workload", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search engine’s coding workload" })
    .click();
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await expect(
    page.getByRole("heading", { name: "Evidence before deployment." }),
  ).toBeVisible();
});

test("mobile demo has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await results(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/results-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".recommendation-card.efficient")
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("heading", { name: "Selected Production Configuration" }),
  ).toBeVisible();
});
