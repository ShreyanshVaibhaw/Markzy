import { createEditor, getMarkdown, getHTML, setMarkdown } from "./editor";
import { applyTheme, loadSavedTheme } from "./themes/theme-manager";
import { ipc } from "./ipc";
import { setupTitlebar } from "./titlebar";
import { listen } from "@tauri-apps/api/event";
import "./themes/base.css";

function isSlidesContent(content: string): boolean {
  return /^---\s*\n[\s\S]*?(kicker|chip):/m.test(content);
}

let sourceModeActive = false;
const editorEl = () => document.getElementById("editor") as HTMLElement;
const sourceEl = () => document.getElementById("source-editor") as HTMLTextAreaElement;
const slidesBtnEl = () => document.getElementById("slides-btn") as HTMLButtonElement;

function enterSourceMode(content: string): void {
  sourceModeActive = true;
  editorEl().classList.add("hidden");
  const ta = sourceEl();
  ta.classList.add("visible");
  ta.value = content;
  slidesBtnEl().classList.add("visible");
}

function exitSourceMode(): void {
  sourceModeActive = false;
  editorEl().classList.remove("hidden");
  sourceEl().classList.remove("visible");
  slidesBtnEl().classList.remove("visible");
}

function setContent(content: string): void {
  if (isSlidesContent(content)) {
    enterSourceMode(content);
  } else {
    exitSourceMode();
    setMarkdown(content);
  }
}

function getContent(): string {
  if (sourceModeActive) return sourceEl().value;
  return getMarkdown();
}

async function init(): Promise<void> {
  const savedTheme = loadSavedTheme();
  applyTheme(savedTheme);

  if (savedTheme.startsWith("custom:")) {
    const fileName = savedTheme.slice(7);
    const css = await ipc.loadThemeCSS(fileName);
    if (css) applyTheme(savedTheme, css);
  }

  await createEditor("editor");

  slidesBtnEl().addEventListener("click", () => ipc.openAsSlides(getContent()));

  ipc.onMenuOpen(async () => {
    const result = await ipc.openFile();
    if (result) setContent(result.content);
  });

  ipc.onMenuSave(() => ipc.saveFile(getContent()));
  ipc.onMenuSaveAs(() => ipc.saveFileAs(getContent()));
  ipc.onMenuExportPDF(() => ipc.exportPDF());
  ipc.onMenuExportHTML(() => {
    const s = getComputedStyle(document.body);
    const v = (name: string) => s.getPropertyValue(name).trim();
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

    const editor = document.querySelector("#editor .ProseMirror");
    const fontFamily = editor ? getComputedStyle(editor).fontFamily : "-apple-system,BlinkMacSystemFont,sans-serif";

    const getElColor = (selector: string, fallback: string): string => {
      const el = document.querySelector(`#editor .ProseMirror ${selector}`);
      return el ? getComputedStyle(el).color : fallback;
    };
    const strongColor = getElColor("strong", textColor);
    const codeColor = getElColor("code", textColor);

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ColaMD Export</title>
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
    ipc.exportHTML(html);
  });

  ipc.onNewFile(() => {
    exitSourceMode();
    setMarkdown("");
  });
  ipc.onFileOpened((data) => setContent(data.content));
  ipc.onFileChanged((content) => {
    if (sourceModeActive) {
      sourceEl().value = content;
    } else {
      setMarkdown(content);
    }
  });
  ipc.onSetTheme((theme) => applyTheme(theme));
  ipc.onSetCustomCSS((css) => {
    const theme = loadSavedTheme();
    applyTheme(theme, css);
  });

  ipc.onMenuNewSlides(async () => {
    await ipc.newSlides();
  });

  ipc.onNewSlidesContent((content) => {
    enterSourceMode(content);
  });

  ipc.onMenuOpenAsSlides(async () => {
    await ipc.openAsSlides(getContent());
  });

  ipc.onMenuExportSlides(async () => {
    await ipc.exportSlides(getContent());
  });

  ipc.onMenuImportTheme(async () => {
    const result = await ipc.loadCustomTheme();
    if (result) applyTheme(`custom:${result.name}`, result.css);
  });

  setupTitlebar(ipc);

  listen<{ paths: string[] } | null>("tauri://drag-drop", async (event) => {
    const paths = event.payload?.paths;
    if (!paths || paths.length === 0) return;
    const filePath = paths[0];
    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown") && !filePath.endsWith(".mdown") && !filePath.endsWith(".mkd")) return;
    const result = await ipc.openFilePath(filePath);
    if (result) setContent(result.content);
  });

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());
}

init().catch((e) => console.error("ColaMD init failed:", e));
