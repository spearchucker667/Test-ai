import React from 'react';

export function escapeHtml(value: string) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function minimalMarkdown(text: string) {
  const escaped = escapeHtml(text || "");
  const codeBlocks: string[] = [];
  let html = escaped.replace(/```([\s\S]*?)```/g, function (_, code) {
    const i = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `@@CODEBLOCK_${i}@@`;
  });
  html = html
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^&gt; (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
  html = `<p>${html}</p>`;
  codeBlocks.forEach((block, i) => {
    html = html.replace(`@@CODEBLOCK_${i}@@`, block);
  });
  return html;
}

export function Markdown({ text }: { text: string }) {
  return <div className="md" dangerouslySetInnerHTML={{ __html: minimalMarkdown(text) }} />;
}
