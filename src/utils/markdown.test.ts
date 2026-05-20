import { describe, it, expect } from "vitest";
import { minimalMarkdown, escapeHtml } from "./markdown";

describe("escapeHtml", () => {
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt;"
    );
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("returns empty string for nullish input", () => {
    expect(escapeHtml("")).toBe("");
  });
});

describe("minimalMarkdown", () => {
  it("renders bold text", () => {
    expect(minimalMarkdown("**hello**")).toContain("<strong>hello</strong>");
  });

  it("renders inline code", () => {
    expect(minimalMarkdown("`code`")).toContain("<code>code</code>");
  });

  it("does not allow raw HTML tags through", () => {
    const output = minimalMarkdown("<img src=x onerror=alert(1)>");
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;img");
  });

  it("does not allow script injection via markdown input", () => {
    const output = minimalMarkdown("<script>alert('xss')</script>");
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });

  it("preserves fenced code blocks without executing their content", () => {
    const output = minimalMarkdown("```\n<b>not bold</b>\n```");
    expect(output).toContain("<pre><code>");
    expect(output).not.toContain("<b>not bold</b>");
    expect(output).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("renders headings for #, ##, ###", () => {
    expect(minimalMarkdown("# H1")).toContain("<h1>H1</h1>");
    expect(minimalMarkdown("## H2")).toContain("<h2>H2</h2>");
    expect(minimalMarkdown("### H3")).toContain("<h3>H3</h3>");
  });
});
