/** @fileoverview Unit tests for minimal markdown rendering and HTML escaping. */

import { describe, it, expect } from "vitest";
import { minimalMarkdown, escapeHtml } from "./markdown";

/** Tests for the escapeHtml helper. */
describe("escapeHtml", () => {
  /** Verifies that the five HTML special characters are escaped correctly. */
  it("escapes the five HTML special characters", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#039;x&#039;)&lt;/script&gt;"
    );
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  /** Verifies that empty or nullish input yields an empty string. */
  it("returns empty string for empty string and nullish input", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml(null as any)).toBe("");
    expect(escapeHtml(undefined as any)).toBe("");
  });
});

/** Tests for the minimalMarkdown helper. */
describe("minimalMarkdown", () => {
  /** Verifies that bold markdown renders as strong tags. */
  it("renders bold text", () => {
    expect(minimalMarkdown("**hello**")).toContain("<strong>hello</strong>");
  });

  /** Verifies that inline code renders as code tags. */
  it("renders inline code", () => {
    expect(minimalMarkdown("`code`")).toContain("<code>code</code>");
  });

  /** Verifies that raw HTML tags are escaped and not rendered. */
  it("does not allow raw HTML tags through", () => {
    const output = minimalMarkdown("<img src=x onerror=alert(1)>");
    expect(output).not.toContain("<img");
    expect(output).toContain("&lt;img");
  });

  /** Verifies that script tags in markdown input are escaped. */
  it("does not allow script injection via markdown input", () => {
    const output = minimalMarkdown("<script>alert('xss')</script>");
    expect(output).not.toContain("<script>");
    expect(output).toContain("&lt;script&gt;");
  });

  /** Verifies that fenced code blocks preserve content without executing it. */
  it("preserves fenced code blocks without executing their content", () => {
    const output = minimalMarkdown("```\n<b>not bold</b>\n```");
    expect(output).toContain("<pre><code>");
    expect(output).not.toContain("<b>not bold</b>");
    expect(output).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  /** Verifies that heading markdown renders as h1, h2, and h3 tags. */
  it("renders headings for #, ##, ###", () => {
    expect(minimalMarkdown("# H1")).toContain("<h1>H1</h1>");
    expect(minimalMarkdown("## H2")).toContain("<h2>H2</h2>");
    expect(minimalMarkdown("### H3")).toContain("<h3>H3</h3>");
  });
});
