import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SecretSettingsCard } from "./SecretSettingsCard";
import { StudioSectionPage } from "./StudioSectionPage";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tasks: [], configured: false }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe("studio pages", () => {
  it.each([
    ["overview", "项目概览"],
    ["media", "素材库"],
    ["image", "目标画面"],
    ["director", "导演台"],
    ["jobs", "生成任务"],
    ["settings", "设置"],
  ] as const)("renders the %s page inside the shared application shell", (section, heading) => {
    render(
      <StudioSectionPage
        assets={[]}
        projectDescription=""
        projectId="project_empty"
        projectName="空白空间"
        section={section}
        shots={[]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "项目工作区" })).toBeVisible();
    expect(screen.getByRole("link", { name: "生成模型与参数" })).toBeVisible();
    expect(screen.getByRole("link", { name: "退出当前空间" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(screen.queryByText("本地演示")).not.toBeInTheDocument();
    expect(document.querySelector('[src*="/fixtures/"]')).not.toBeInTheDocument();
  });

  it("exposes the real optional director flow", () => {
    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_empty" projectName="空白空间" section="director" shots={[]}/>);

    expect(screen.getByText("VLM 导演")).toBeVisible();
    expect(screen.getByRole("button", { name: /生成导演建议/ })).toBeDisabled();
    expect(screen.getByText(/调用前会再次确认真实费用/)).toBeVisible();
  });

  it("does not invent completed remote jobs", async () => {
    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_empty" projectName="空白空间" section="jobs" shots={[]}/>);

    expect(await screen.findByText("还没有生成任务")).toBeVisible();
    expect(screen.getByText(/提交真实视频请求后/)).toBeVisible();
    expect(screen.queryByText("生成成功")).not.toBeInTheDocument();
  });

  it("uses a persisted project id and renders real local assets", () => {
    render(
      <StudioSectionPage
        assets={[
          {
            id: "asset-real",
            contentUrl: "/api/assets/asset-real/content",
            displayName: "我的尾帧.png",
            kind: "first_frame",
            mimeType: "image/png",
            byteSize: 2_048,
          },
        ]}
        projectDescription="真实素材空间"
        projectId="project_real"
        projectName="真实项目"
        section="media"
        shots={[]}
      />,
    );

    expect(screen.getAllByText("真实项目").length).toBeGreaterThan(0);
    expect(screen.getByText("我的尾帧.png")).toBeVisible();
    expect(screen.getByRole("link", { name: "生成模型与参数" })).toHaveAttribute(
      "href",
      "/projects/project_real/generate",
    );
    expect(screen.getByText("SQLite 已连接")).toBeVisible();
    expect(screen.getByRole("button", { name: "删除 我的尾帧.png" })).toBeVisible();
  });

  it("requires confirmation before deleting a local asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true, cleanupPending: false }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[{ id: "asset-real", contentUrl: "/api/assets/asset-real/content", displayName: "我的尾帧.png", kind: "first_frame", mimeType: "image/png", byteSize: 2_048 }]} projectDescription="" projectId="project_real" projectName="真实项目" section="media" shots={[]}/>);

    await user.click(screen.getByRole("button", { name: "删除 我的尾帧.png" }));
    expect(screen.getByRole("dialog", { name: "删除素材" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets/asset-real",
      expect.objectContaining({ method: "DELETE" }),
    ));
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("keeps provider credentials blank and masked until a key is configured", () => {
    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_empty" projectName="空白空间" section="settings" shots={[]}/>);

    const input = screen.getByLabelText("输入新 Key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("");
    expect(screen.getByRole("button", { name: "保存到 Keychain" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除 Key" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeDisabled();
  });

  it("saves through the local credential endpoint and immediately clears the secret", async () => {
    const secret = ["local", "provider", "secret", "9812"].join("_");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, lastFour: "9812" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SecretSettingsCard />);

    await screen.findByText("尚未配置 DMXAPI Key。");
    const input = screen.getByLabelText("输入新 Key");
    await user.type(input, secret);
    await user.click(screen.getByRole("button", { name: "保存到 Keychain" }));

    await screen.findByText(/Key 已保存。输入框已清空/);
    expect(input).toHaveValue("");
    expect(screen.getByText(/末四位 9812/)).toBeVisible();
    expect(document.body.textContent).not.toContain(secret);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/settings/provider-key");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT" });
  });
});
