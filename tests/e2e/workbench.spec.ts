import { expect, test } from "@playwright/test";

test("opens the project folder library and enters then exits a real workspace", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "创作空间" }),
  ).toBeVisible();
  if (await page.getByRole("link", { name: /打开空间/ }).count() === 0) {
    await page.getByRole("button", { name: /新建创作空间/ }).click();
    await page.getByLabel("空间名称").fill("E2E 空间");
    await page.getByRole("button", { name: "创建并进入" }).click();
  } else {
    await page.getByRole("link", { name: /打开空间/ }).first().click();
  }
  await expect(page).toHaveURL(/\/projects\/[^/]+\/overview$/);
  await expect(page.getByRole("heading", { level: 1, name: "项目概览" })).toBeVisible();
  await expect(page.locator('[src*="/fixtures/"]')).toHaveCount(0);
  await page.screenshot({
    path: "test-results/studio-overview.png",
    fullPage: true,
  });

  for (const [route, heading] of [
    ["media", "素材库"],
    ["image", "目标画面"],
    ["director", "导演台"],
    ["jobs", "生成任务"],
    ["settings", "设置"],
  ] as const) {
    await page.locator(`a[href$="/${route}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }

  await page.screenshot({
    path: "test-results/studio-settings.png",
    fullPage: true,
  });

  await page.getByRole("link", { name: "退出当前空间" }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("renders all registered video providers and their model-specific fields", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: /打开空间/ }).first().click();
  await page.locator('a[href$="/generate"]').first().click();

  await expect(page).toHaveURL(/\/generate$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "生成视频" }),
  ).toBeVisible();

  const provider = page.getByLabel("Provider");
  await expect(provider.locator("option")).toHaveCount(5);
  await provider.selectOption("kling");
  await page.getByLabel("Capability 模式").selectOption("first-last-frame");
  await expect(page.getByLabel("视频模型")).toHaveValue("kling-v3");
  await expect(page.getByLabel("镜头提示词")).toBeVisible();

  await page.screenshot({
    path: "test-results/studio-generate.png",
    fullPage: true,
  });
});

test("publishes the complete safe capability catalog", async ({ request }) => {
  const response = await request.get("/api/capabilities");
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as {
    capabilities: Array<{ id: string }>;
  };
  expect(body.capabilities).toHaveLength(18);
  expect(body.capabilities.map((item) => item.id)).toEqual(
    expect.arrayContaining([
      "gpt-image-2-03:reference-image-edit",
      "kling-v3:first-last-frame",
      "viduq3-pro:first-last-frame",
      "MiniMax-H3:multimodal-reference",
      "happyhorse-1.1-r2v:reference-to-video",
      "paiwo-v5.6-itv2:first-last-frame",
    ]),
  );
});

test("reports the real local Node and FFmpeg health without exposing a key", async ({
  request,
}) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);

  const health = (await response.json()) as {
    node: { ok: boolean; version: string };
    ffmpeg: { ok: boolean };
    ffprobe: { ok: boolean };
    credential: { configured: boolean };
  };

  expect(health.node.ok).toBe(true);
  expect(health.node.version).toMatch(/^v24\./);
  expect(health.ffmpeg.ok).toBe(true);
  expect(health.ffprobe.ok).toBe(true);
  expect(typeof health.credential.configured).toBe("boolean");
  expect(JSON.stringify(health)).not.toMatch(/authorization|lastFour|apiKey/i);
});

test("renames and deletes a project through the folder action menu", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: /新建创作空间/ }).click();
  await page.getByLabel("空间名称").fill("E2E 可管理项目");
  await page.getByRole("button", { name: "创建并进入" }).click();
  await page.getByRole("link", { name: "退出当前空间" }).click();

  await page.getByRole("button", { name: "管理 E2E 可管理项目" }).click();
  await page.getByRole("button", { name: "重命名" }).click();
  await page.getByLabel("项目名称").fill("E2E 已重命名项目");
  await page.getByRole("button", { name: "保存名称" }).click();
  await expect(page.getByRole("heading", { name: "E2E 已重命名项目" })).toBeVisible();

  await page.getByRole("button", { name: "管理 E2E 已重命名项目" }).click();
  await page.getByRole("button", { name: "删除项目" }).click();
  const deleteButton = page.getByRole("button", { name: "永久删除" });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel("输入项目名称以确认").fill("E2E 已重命名项目");
  await deleteButton.click();
  await expect(page.getByRole("heading", { name: "E2E 已重命名项目" })).toHaveCount(0);
});
