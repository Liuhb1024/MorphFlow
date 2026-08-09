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
});
