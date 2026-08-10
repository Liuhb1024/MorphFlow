import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectLibrary } from "./ProjectLibrary";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ProjectLibrary", () => {
  it("renders persisted projects as folders without a demo workspace", () => {
    render(
      <ProjectLibrary
        projects={[{
          id: "project_real",
          name: "真实转场",
          description: "只包含我的素材",
          revision: 1,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        }]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "创作空间" })).toBeVisible();
    expect(screen.getByRole("link", { name: "打开空间 真实转场" })).toHaveAttribute(
      "href",
      "/projects/project_real/overview",
    );
    expect(screen.getByRole("button", { name: /新建创作空间/ })).toBeEnabled();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });

  it("creates a real project through the local API and enters its workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(
      { project: { id: "project_created" } },
      { status: 201 },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ProjectLibrary projects={[]}/>);

    await user.click(screen.getByRole("button", { name: /新建创作空间/ }));
    await user.type(screen.getByLabelText("空间名称"), "真实新空间");
    await user.type(screen.getByLabelText("说明（可选）"), "不会注入演示数据");
    await user.click(screen.getByRole("button", { name: "创建并进入" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.objectContaining({ method: "POST" }));
    expect(navigation.push).toHaveBeenCalledWith("/projects/project_created/overview");
    expect(navigation.refresh).toHaveBeenCalled();
  });

  it("renames a project from its action menu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      project: {
        id: "project_real",
        name: "雨夜新版",
        description: "真实素材",
        revision: 2,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_001_000,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ProjectLibrary projects={[{
      id: "project_real",
      name: "雨夜旧版",
      description: "真实素材",
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }]}/>);

    await user.click(screen.getByRole("button", { name: "管理 雨夜旧版" }));
    await user.click(screen.getByRole("button", { name: "重命名" }));
    const input = screen.getByLabelText("项目名称");
    await user.clear(input);
    await user.type(input, "雨夜新版");
    await user.click(screen.getByRole("button", { name: "保存名称" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project_real",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(await screen.findByText("雨夜新版")).toBeVisible();
  });

  it("requires an exact project name before destructive deletion", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ deleted: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ProjectLibrary projects={[{
      id: "project_delete",
      name: "不能误删",
      description: "真实素材",
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }]}/>);

    await user.click(screen.getByRole("button", { name: "管理 不能误删" }));
    await user.click(screen.getByRole("button", { name: "删除项目" }));
    const deleteButton = screen.getByRole("button", { name: "永久删除" });
    expect(deleteButton).toBeDisabled();
    await user.type(screen.getByLabelText("输入项目名称以确认"), "不能误删");
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project_delete",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(screen.queryByText("不能误删")).not.toBeInTheDocument();
  });
});
