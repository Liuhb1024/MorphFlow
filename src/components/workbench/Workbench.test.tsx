import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { listCapabilities } from "@/model-registry/registry";

import { WorkbenchShell } from "./Workbench";
import { toCapabilityViews } from "./registry-view";
import type { WorkbenchViewModel } from "./types";

function testView(): WorkbenchViewModel {
  return {
    project: { id: "project_test", name: "测试空间", eyebrow: "LOCAL PROJECT" },
    assets: [
      { id: "asset_a", label: "A.png", role: "first-frame", sourceLabel: "本地上传", src: "/api/assets/asset_a/content", alt: "A.png" },
      { id: "asset_b", label: "B.png", role: "last-frame", sourceLabel: "本地上传", src: "/api/assets/asset_b/content", alt: "B.png" },
    ],
    capabilities: toCapabilityViews(
      listCapabilities().filter((capability) => capability.category === "video"),
      { first_frame: "asset_a", last_frame: "asset_b" },
    ),
    initialCapabilityId: "paiwo-v5.6-itv2:first-last-frame",
  };
}

describe("generation workspace", () => {
  it("renders the light studio shell with honest local state and registry providers", () => {
    render(<WorkbenchShell view={testView()} />);

    expect(screen.getByRole("heading", { level: 1, name: "生成视频" })).toBeVisible();
    expect(screen.queryByText("本地演示")).not.toBeInTheDocument();
    expect(screen.getByText(/生成提交尚未接通/)).toBeVisible();
    expect(screen.getByText("A", { selector: "[data-frame-label]" })).toBeVisible();
    expect(screen.getByText("B", { selector: "[data-frame-label]" })).toBeVisible();
    expect(screen.getByText("文档支持 · 未实测")).toBeVisible();

    const providers = within(screen.getByLabelText("Provider")).getAllByRole("option");
    expect(providers.length).toBeGreaterThan(2);
    expect(providers.map((option) => option.textContent)).toEqual(
      expect.arrayContaining(["Kling", "Paiwo"]),
    );
  });

  it("switches providers, models and capability-specific input slots from data", async () => {
    const user = userEvent.setup();
    render(<WorkbenchShell view={testView()} />);

    await user.selectOptions(screen.getByLabelText("Provider"), "kling");
    expect(screen.getByLabelText("视频模型")).toHaveValue("kling-v3");

    const mode = screen.getByLabelText("Capability 模式");
    const options = within(mode).getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);
    await user.selectOptions(mode, "image-to-video");

    expect(screen.getByText("首帧 A", { selector: "[data-slot-name]" })).toBeVisible();
    expect(screen.queryByText("尾帧 B", { selector: "[data-slot-name]" })).not.toBeInTheDocument();
  });

  it("blocks review for incompatible Paiwo parameters and explains both fields", async () => {
    const user = userEvent.setup();
    render(<WorkbenchShell view={testView()} />);

    await user.selectOptions(screen.getByLabelText("视频时长"), "10");
    await user.selectOptions(screen.getByLabelText("输出分辨率"), "1080p");

    expect(screen.getByRole("button", { name: /检查并生成/ })).toBeDisabled();
    expect(screen.getAllByText(/1080p 与 10 秒暂不兼容/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("视频时长")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("输出分辨率")).toHaveAttribute("aria-invalid", "true");
  });

  it("opens a non-submitting review dialog and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<WorkbenchShell view={testView()} />);

    const reviewButton = screen.getByRole("button", { name: /检查并生成/ });
    await user.type(screen.getByLabelText("镜头提示词"), "保持主体连续并平稳转场");
    await user.click(reviewButton);

    const dialog = screen.getByRole("dialog", { name: "生成配置复核" });
    expect(within(dialog).getByText(/Paiwo v5\.6 ITV2/i)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "生成提交尚未接通" })).toBeDisabled();
    expect(within(dialog).getByText(/不会调用模型或产生费用/)).toBeVisible();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reviewButton).toHaveFocus();
  });
});
