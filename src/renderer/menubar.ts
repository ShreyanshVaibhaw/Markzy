import { ipc } from "./ipc";
import { applyTheme } from "./themes/theme-manager";
import {
  createTab,
  closeTab,
  getActiveTab,
  updateActiveTabFilePath,
  markActiveTabClean,
  getActiveTabContent,
  ensureTab,
} from "./tabs";

const isMac = /Mac/i.test(navigator.userAgent);

let setContentFn: ((content: string) => void) | null = null;
let saveTabStateFn: (() => void) | null = null;
let exitSourceModeFn: (() => void) | null = null;
let loadTabContentFn: (() => void) | null = null;

export function registerEditorFns(fns: {
  setContent: (content: string) => void;
  saveTabState: () => void;
  exitSourceMode: () => void;
  loadTabContent: () => void;
}): void {
  setContentFn = fns.setContent;
  saveTabStateFn = fns.saveTabState;
  exitSourceModeFn = fns.exitSourceMode;
  loadTabContentFn = fns.loadTabContent;
}

async function handleOpenFile(): Promise<void> {
  const result = await ipc.openFile();
  if (!result) return;
  const tab = getActiveTab();
  if (tab && !tab.filePath && !tab.dirty && tab.content === "") {
    updateActiveTabFilePath(result.path);
    setContentFn?.(result.content);
  } else {
    createTab(result.path, result.content);
    loadTabContentFn?.();
  }
}

async function handleSaveFile(): Promise<void> {
  saveTabStateFn?.();
  const content = getActiveTabContent();
  const ok = await ipc.saveFile(content);
  if (ok) markActiveTabClean();
}

async function handleSaveFileAs(): Promise<void> {
  saveTabStateFn?.();
  const content = getActiveTabContent();
  const ok = await ipc.saveFileAs(content);
  if (ok) markActiveTabClean();
}

function handleNewFile(): void {
  saveTabStateFn?.();
  createTab();
  exitSourceModeFn?.();
}

function handleCloseTab(): void {
  saveTabStateFn?.();
  closeTab(ensureTab().id);
  loadTabContentFn?.();
}

async function handleNewSlides(): Promise<void> {
  await ipc.newSlides();
}

async function handleOpenAsSlides(): Promise<void> {
  saveTabStateFn?.();
  const tab = getActiveTab();
  if (tab) await ipc.openAsSlides(tab.content);
}

function handleExportHTML(): void {
  saveTabStateFn?.();
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

  import("./editor").then(({ getHTML }) => {
    const bodyHTML = getHTML();
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Markzy Export</title>
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
</head><body>${bodyHTML}</body></html>`;
    ipc.exportHTML(html);
  });
}

async function handleExportSlides(): Promise<void> {
  saveTabStateFn?.();
  await ipc.exportSlides(getActiveTabContent());
}

async function handleImportTheme(): Promise<void> {
  const result = await ipc.loadCustomTheme();
  if (result) applyTheme(`custom:${result.name}`, result.css);
}

function getThemeItems(): Array<{ label: string; separator?: boolean; action?: () => void }> {
  const themes = [
    "light",
    "dark",
    "elegant",
    "newsprint",
    "cappuccino",
    "nord",
    "solarized-light",
    "solarized-dark",
    "dracula",
    "github-dark",
    "tokyo-night",
    "gruvbox",
    "catppuccin-mocha",
    "one-dark",
  ];
  const themeLabels: Record<string, string> = {
    light: "Light",
    dark: "Dark",
    elegant: "Elegant",
    newsprint: "Newsprint",
    cappuccino: "Cappuccino",
    nord: "Nord",
    "solarized-light": "Solarized Light",
    "solarized-dark": "Solarized Dark",
    dracula: "Dracula",
    "github-dark": "GitHub Dark",
    "tokyo-night": "Tokyo Night",
    gruvbox: "Gruvbox",
    "catppuccin-mocha": "Catppuccin Mocha",
    "one-dark": "One Dark",
  };
  const items: Array<{ label: string; separator?: boolean; action?: () => void }> = themes.map((t) => ({
    label: themeLabels[t] || t,
    action: () => applyTheme(t),
  }));
  items.push({ label: "", separator: true, action: () => {} });
  items.push({ label: "Import Theme...", action: () => handleImportTheme() });
  return items;
}

export function initMenuBar(): void {
  if (isMac) return;

  const slot = document.getElementById("menubar-slot");
  if (!slot) return;

  const container = document.createElement("div");
  container.id = "menubar";

  const dropdownEl = document.createElement("div");
  dropdownEl.className = "menu-dropdown";
  dropdownEl.style.display = "none";
  document.body.appendChild(dropdownEl);

  let openMenuIndex = -1;
  let openBtn: HTMLButtonElement | null = null;

  function closeMenu(): void {
    openMenuIndex = -1;
    dropdownEl.style.display = "none";
    if (openBtn) openBtn.classList.remove("open");
    openBtn = null;
  }

  function showMenu(idx: number, btn: HTMLButtonElement): void {
    if (openMenuIndex === idx) {
      closeMenu();
      return;
    }
    closeMenu();
    openMenuIndex = idx;
    openBtn = btn;
    btn.classList.add("open");

    const rect = btn.getBoundingClientRect();
    dropdownEl.style.left = rect.left + "px";
    dropdownEl.style.top = rect.bottom + "px";
    dropdownEl.style.display = "block";
    dropdownEl.innerHTML = "";

    type MenuItem = {
      label: string;
      accelerator?: string;
      separator?: boolean;
      action?: () => void;
    };
    let items: MenuItem[] = [];

    switch (idx) {
      case 0:
        items = [
          { label: "New", accelerator: "Ctrl+N", action: handleNewFile },
          { label: "", separator: true },
          { label: "Open...", accelerator: "Ctrl+O", action: handleOpenFile },
          { label: "", separator: true },
          { label: "Save", accelerator: "Ctrl+S", action: handleSaveFile },
          { label: "Save As...", accelerator: "Ctrl+Shift+S", action: handleSaveFileAs },
          { label: "Close Tab", accelerator: "Ctrl+W", action: handleCloseTab },
          { label: "", separator: true },
          { label: "New Slides...", accelerator: "Ctrl+Shift+N", action: handleNewSlides },
          { label: "Open as Slides", accelerator: "Ctrl+Shift+P", action: handleOpenAsSlides },
          { label: "", separator: true },
          { label: "Export PDF...", action: () => ipc.exportPDF() },
          { label: "Export HTML...", action: handleExportHTML },
          { label: "Export Slides...", action: handleExportSlides },
          { label: "", separator: true },
          { label: "Quit", accelerator: "Ctrl+Q", action: () => window.close() },
        ];
        break;
      case 1:
        items = [
          { label: "Undo", accelerator: "Ctrl+Z", action: () => document.execCommand("undo") },
          { label: "Redo", accelerator: "Ctrl+Y", action: () => document.execCommand("redo") },
          { label: "", separator: true },
          { label: "Cut", accelerator: "Ctrl+X", action: () => document.execCommand("cut") },
          { label: "Copy", accelerator: "Ctrl+C", action: () => document.execCommand("copy") },
          { label: "Paste", accelerator: "Ctrl+V", action: () => document.execCommand("paste") },
          { label: "", separator: true },
          { label: "Select All", accelerator: "Ctrl+A", action: () => document.execCommand("selectAll") },
        ];
        break;
      case 2:
        items = [
          { label: "Zoom In", accelerator: "Ctrl+=", action: () => { document.body.style.zoom = String((parseFloat(document.body.style.zoom || "1") * 1.1)); } },
          { label: "Zoom Out", accelerator: "Ctrl+-", action: () => { document.body.style.zoom = String((parseFloat(document.body.style.zoom || "1") * 0.9)); } },
          { label: "Actual Size", accelerator: "Ctrl+0", action: () => { document.body.style.zoom = "1"; } },
          { label: "", separator: true },
          { label: "Toggle Fullscreen", accelerator: "F11", action: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } },
        ];
        break;
      case 3: {
        const themeItems = getThemeItems();
        themeItems.forEach((t) => {
          items.push(t.separator
            ? { label: "", separator: true, action: () => {} }
            : { label: t.label, action: t.action });
        });
        break;
      }
      case 4:
        items = [
          { label: "About Markzy", action: () => ipc.openExternal("https://github.com/ShreyanshVaibhaw/Markzy") },
        ];
        break;
    }

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "menu-separator";
        dropdownEl.appendChild(sep);
        return;
      }
      const el = document.createElement("div");
      el.className = "menu-item";
      const label = document.createElement("span");
      label.textContent = item.label;
      el.appendChild(label);
      if (item.accelerator) {
        const accel = document.createElement("span");
        accel.className = "menu-accel";
        accel.textContent = item.accelerator;
        el.appendChild(accel);
      }
      el.addEventListener("click", () => {
        closeMenu();
        item.action?.();
      });
      dropdownEl.appendChild(el);
    });
  }

  const menuLabels = ["File", "Edit", "View", "Theme", "Help"];
  menuLabels.forEach((label, idx) => {
    const btn = document.createElement("button");
    btn.className = "menubar-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => showMenu(idx, btn));
    btn.addEventListener("mouseenter", () => {
      if (openMenuIndex >= 0 && openMenuIndex !== idx) showMenu(idx, btn);
    });
    container.appendChild(btn);
  });

  slot.appendChild(container);

  document.addEventListener("click", (e) => {
    if (
      openMenuIndex >= 0 &&
      !(e.target as HTMLElement).closest(".menubar-btn") &&
      !(e.target as HTMLElement).closest(".menu-dropdown")
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    switch (key) {
      case "n":
        e.preventDefault();
        if (e.shiftKey) handleNewSlides();
        else handleNewFile();
        break;
      case "o":
        e.preventDefault();
        handleOpenFile();
        break;
      case "s":
        e.preventDefault();
        if (e.shiftKey) handleSaveFileAs();
        else handleSaveFile();
        break;
      case "w":
        e.preventDefault();
        handleCloseTab();
        break;
      case "p":
        if (e.shiftKey) {
          e.preventDefault();
          handleOpenAsSlides();
        }
        break;
    }
  });
}
