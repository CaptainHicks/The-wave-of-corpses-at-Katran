import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BuildCostPanel } from "../../ui/Panels/BuildCostPanel";

describe("BuildCostPanel", () => {
  it("explains each build item with its actual gameplay purpose", () => {
    render(<BuildCostPanel onClose={vi.fn()} />);

    expect(screen.getByText("连接网络，计入最长补给线")).toBeInTheDocument();
    expect(screen.getByText("可移动，能探索迷雾")).toBeInTheDocument();
    expect(screen.getByText("产出1张资源，值1分")).toBeInTheDocument();
    expect(screen.getByText("产出翻倍，值2分")).toBeInTheDocument();
    expect(screen.getByText("每座让手牌上限+2")).toBeInTheDocument();
    expect(screen.getByText("驻守己方建筑，每处最多2个")).toBeInTheDocument();
    expect(screen.getByText("参与防御，之后可移动/驱逐")).toBeInTheDocument();
    expect(screen.getByText("抽取发展卡，下回合可用")).toBeInTheDocument();
  });
});
