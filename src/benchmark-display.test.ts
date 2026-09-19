import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BenchmarkSpace from "./components/BenchmarkSpace";
import { demoSnapshot, DEMO_WORKLOAD } from "./data/demo";

describe("benchmark display without measurements", () => {
  const render = (status: "running" | "failed") => {
    const configuration = demoSnapshot(DEMO_WORKLOAD, "search").configurations[0];
    return renderToStaticMarkup(createElement(BenchmarkSpace, {
      configurations: [{ ...configuration, status }],
      source: "api", selected: configuration.id, onSelect: () => {},
    }));
  };
  it("does not describe an active run as unexecuted", () => {
    const html = render("running");
    expect(html).toContain("벤치마크 실행 중입니다.");
    expect(html).not.toContain("미실행");
    expect(html).not.toContain("아직 워크로드를 실행하지 않았습니다");
    expect(html).not.toContain("comparison-table");
  });
  it("does not describe a failed run as an unexecuted candidate", () => {
    const html = render("failed");
    expect(html).toContain("측정 결과를 얻지 못했습니다.");
    expect(html).toContain("실행에 실패해");
    expect(html).not.toContain("미실행");
    expect(html).not.toContain("comparison-table");
  });
});
