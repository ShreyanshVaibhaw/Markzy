import { getHTML } from "./editor";

const INLINE_STYLES_HEAD = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Markzy Export</title>`;

export function buildExportHTML(): string {
  const s = getComputedStyle(document.body);
  const v = (name: string) => s.getPropertyValue(name).trim();
  const editor = document.querySelector("#editor .ProseMirror");
  const fontFamily = editor
    ? getComputedStyle(editor).fontFamily
    : "-apple-system,BlinkMacSystemFont,sans-serif";

  const bgColor = v("--bg-color");
  const textColor = v("--text-color");
  const textMuted = v("--text-muted");
  const borderColor = v("--border-color");
  const linkColor = v("--link-color");
  const codeBg = v("--code-bg");
  const codeBlockBg = v("--code-block-bg");
  const codeBlockText = v("--code-block-text") || textColor;
  const blockquoteBorder = v("--blockquote-border");
  const blockquoteBg = v("--blockquote-bg") || "transparent";
  const tableHeaderBg = v("--table-header-bg");
  const selectionBg = v("--selection-bg");

  const getElColor = (selector: string, fallback: string): string => {
    const el = document.querySelector(`#editor .ProseMirror ${selector}`);
    return el ? getComputedStyle(el).color : fallback;
  };
  const strongColor = getElColor("strong", textColor);
  const codeColor = getElColor("code", textColor);

  return `${INLINE_STYLES_HEAD}
<style>
body{max-width:780px;margin:40px auto;padding:20px;font-family:${fontFamily};line-height:1.75;background:${bgColor};color:${textColor}}
h1{font-size:2em;font-weight:700;border-bottom:1px solid ${borderColor};padding-bottom:.3em}
h2{font-size:1.5em;font-weight:600;border-bottom:1px solid ${borderColor};padding-bottom:.25em}
h3{font-size:1.25em;font-weight:600}
strong{color:${strongColor}}
a{color:${linkColor};text-decoration:none}
code{background:${codeBg};color:${codeColor};padding:2px 6px;border-radius:3px;font-size:.875em;font-family:'SF Mono','Fira Code',Menlo,monospace}
pre{background:${codeBlockBg};color:${codeBlockText};padding:16px;border-radius:6px;overflow-x:auto;margin:1em 0}
pre code{background:none;padding:0;color:inherit}
blockquote{border-left:4px solid ${blockquoteBorder};background:${blockquoteBg};padding-left:16px;margin:1em 0;color:${textMuted}}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid ${borderColor};padding:8px 12px}
th{background:${tableHeaderBg};font-weight:600}
hr{border:none;border-top:2px solid ${borderColor};margin:2em 0}
img{max-width:100%}
::selection{background:${selectionBg}}
</style>
</head><body>${getHTML()}</body></html>`;
}