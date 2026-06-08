/**
 * Lightweight markdown-to-HTML renderer.
 * Handles: headings, bold, italic, inline code, fenced code blocks,
 * unordered/ordered lists (one level of nesting), horizontal rules,
 * and paragraphs. No external dependencies.
 *
 * The output is intended for use with `dangerouslySetInnerHTML` where
 * the source is trusted (our own API responses).
 */
export function renderMarkdown(src: string): string {
  if (!src) return "";

  // Normalize line endings
  const raw = src.replace(/\r\n/g, "\n");

  // ── Pass 1: extract fenced code blocks so they aren't processed ──
  const codeBlocks: string[] = [];
  const withPlaceholders = raw.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang: string, code: string) => {
      const idx = codeBlocks.length;
      const escaped = escapeHtml(code.replace(/\n$/, ""));
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
      codeBlocks.push(
        `<div class="md-code-block"><div class="md-code-block__header">${lang || "code"}</div><pre${langAttr}><code>${escaped}</code></pre></div>`,
      );
      return `\n%%CODEBLOCK_${idx}%%\n`;
    },
  );

  // ── Pass 2: process line-by-line ──
  const lines = withPlaceholders.split("\n");
  const htmlParts: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let listBuffer: string[] = [];

  function flushList() {
    if (inList && listBuffer.length > 0) {
      htmlParts.push(`<${inList}>${listBuffer.join("")}</${inList}>`);
      listBuffer = [];
      inList = null;
    }
  }

  for (const line of lines) {
    // Code block placeholder
    const placeholderMatch = line.match(/^%%CODEBLOCK_(\d+)%%$/);
    if (placeholderMatch) {
      flushList();
      htmlParts.push(codeBlocks[parseInt(placeholderMatch[1]!, 10)]!);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushList();
      htmlParts.push("<hr />");
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      htmlParts.push(`<h${level}>${inlineFormat(headingMatch[2]!)}</h${level}>`);
      continue;
    }

    // Unordered list item (*, -, +)
    const ulMatch = line.match(/^(\s*)[\*\-\+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        inList = "ul";
      }
      const indent = ulMatch[1]!.length >= 2;
      const content = inlineFormat(ulMatch[2]!);
      listBuffer.push(
        indent
          ? `<li class="md-nested">${content}</li>`
          : `<li>${content}</li>`,
      );
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        inList = "ol";
      }
      const content = inlineFormat(olMatch[2]!);
      listBuffer.push(`<li>${content}</li>`);
      continue;
    }

    // Regular paragraph line
    flushList();
    htmlParts.push(`<p>${inlineFormat(line)}</p>`);
  }

  flushList();
  return htmlParts.join("");
}

// ── Inline formatting ──────────────────────────────────────────────

function inlineFormat(text: string): string {
  let result = escapeHtml(text);

  // Inline code (must come before bold/italic so backtick content isn't processed)
  result = result.replace(
    /`([^`]+)`/g,
    '<code class="md-inline-code">$1</code>',
  );

  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Arrow → for display
  result = result.replace(/-&gt;/g, "→");

  return result;
}

// ── HTML escaping ──────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
