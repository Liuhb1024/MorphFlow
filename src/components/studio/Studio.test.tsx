import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("offers completed generated videos as an explicit MP4 download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tasks: [{
        id: "video_task_done",
        capabilityId: "kling-v3:first-last-frame",
        modelId: "kling-v3",
        status: "succeeded",
        providerTaskId: "provider-task",
        resultUrl: "/api/assets/asset_video/content",
        errorCode: null,
        estimatedCostCny: 1.42,
      }],
    }), { status: 200 })));

    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_real" projectName="真实项目" section="jobs" shots={[]}/>);

    const download = await screen.findByRole("link", { name: "下载 MP4" });
    expect(download).toHaveAttribute("href", "/api/assets/asset_video/content?download=1");
    expect(download).toHaveAttribute("download", "");
  });

  it("uses an in-product dialog and visible progress for image AI actions", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => { finishRequest = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[{ id: "asset-reference", contentUrl: "/api/assets/asset-reference/content", displayName: "reference.png", kind: "reference_image", mimeType: "image/png", byteSize: 2_048 }]} projectDescription="" projectId="project_real" projectName="真实项目" section="image" shots={[]}/>);

    await user.type(screen.getByLabelText("画面描述"), "保留人物，增加蓝色能量光");
    await user.click(screen.getByRole("button", { name: /AI 深度优化提示词/ }));
    expect(screen.getByRole("dialog", { name: "优化图片提示词" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认并开始优化" }));
    expect(screen.getByRole("progressbar", { name: "AI 处理进度" })).toBeVisible();
    expect(screen.getByText("正在分析参考图并重写提示词…")).toBeVisible();
    finishRequest?.(new Response(JSON.stringify({ prompt: "保留人物身份与构图，增加蓝色能量光。" }), { status: 200 }));
    expect(await screen.findByText("提示词优化完成")).toBeVisible();
  });

  it("opens a custom confirmation component before the director request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_real" projectName="真实项目" section="director" shots={[]}/>);

    await user.type(screen.getByLabelText("你的创作意图"), "镜头缓慢推进并保持人物连续");
    await user.click(screen.getByRole("button", { name: /生成导演建议/ }));
    expect(screen.getByRole("dialog", { name: "生成视频导演提示词" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the director choose ordered first and last frames from the real media library", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ advice: "从 A 连续推进至 B。" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const assets = [
      { id: "asset-a", contentUrl: "/api/assets/asset-a/content", displayName: "起点.png", kind: "first_frame", mimeType: "image/png", byteSize: 2_048 },
      { id: "asset-b", contentUrl: "/api/assets/asset-b/content", displayName: "旧终点.png", kind: "last_frame", mimeType: "image/png", byteSize: 2_048 },
      { id: "asset-new-b", contentUrl: "/api/assets/asset-new-b/content", displayName: "新终点.png", kind: "reference_image", mimeType: "image/png", byteSize: 2_048 },
    ];
    render(<StudioSectionPage assets={assets} projectDescription="" projectId="project_real" projectName="真实项目" section="director" shots={[]}/>);

    expect(screen.getByLabelText("首帧 A")).toHaveValue("asset-a");
    expect(screen.getByLabelText("尾帧 B")).toHaveValue("asset-b");
    await user.selectOptions(screen.getByLabelText("尾帧 B"), "asset-new-b");
    expect(screen.getByAltText("新终点.png")).toBeVisible();
    await user.type(screen.getByLabelText("你的创作意图"), "人物连续走向目标画面");
    await user.click(screen.getByRole("button", { name: /生成导演建议/ }));
    const dialog = screen.getByRole("dialog", { name: "生成视频导演提示词" });
    expect(within(dialog).getByText("起点.png → 新终点.png")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "确认并开始生成" }));

    await screen.findByText("视频导演提示词已生成");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { assetIds: string[]; capabilityId: string };
    expect(request.assetIds).toEqual(["asset-a", "asset-new-b"]);
    expect(request.capabilityId).toContain("first-last-frame");
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

  it("filters the real media library with accessible segmented controls", async () => {
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[{ id: "asset-image", contentUrl: "/api/assets/asset-image/content", displayName: "frame.png", kind: "first_frame", mimeType: "image/png", byteSize: 2_048 }]} projectDescription="" projectId="project_real" projectName="真实项目" section="media" shots={[]}/>);

    expect(screen.getByRole("button", { name: "全部 1" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "视频 0" }));
    expect(screen.queryByText("frame.png")).not.toBeInTheDocument();
    expect(screen.getByText("当前筛选下没有素材")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "图片 1" }));
    expect(screen.getByText("frame.png")).toBeVisible();
  });

  it("uploads multiple selected images as a sequential local batch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ asset: { id: "asset-uploaded" } }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[]} projectDescription="" projectId="project_real" projectName="真实项目" section="media" shots={[]}/>);

    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.webp", { type: "image/webp" });
    const input = screen.getByLabelText("批量选择本地视频或图片");
    await user.upload(input, [first, second]);

    await screen.findByText("2 个文件已保存到本地素材库。");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(input).toHaveAttribute("multiple");
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("/api/projects/project_real/assets");
      expect(call[1]).toMatchObject({ method: "POST", credentials: "same-origin" });
      expect((call[1]?.body as FormData).get("kind")).toBe("source_image");
    }
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("lets the user choose a precise frame time or the video tail", async () => {
    const user = userEvent.setup();
    render(<StudioSectionPage assets={[{ id: "asset-video", contentUrl: "/api/assets/asset-video/content", displayName: "clip.mp4", kind: "source_video", mimeType: "video/mp4", byteSize: 4_096 }]} projectDescription="" projectId="project_real" projectName="真实项目" section="media" shots={[]}/>);

    const seconds = screen.getByRole("spinbutton", { name: "截取时间（秒）" });
    expect(screen.getByRole("button", { name: "尾帧" })).toHaveAttribute("aria-pressed", "true");
    expect(seconds).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "指定时间" }));
    expect(seconds).toBeEnabled();
    await user.clear(seconds);
    await user.type(seconds, "2.5");
    expect(seconds).toHaveValue(2.5);
    expect(screen.getByRole("button", { name: "截取 2.50 秒画面" })).toBeVisible();
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
