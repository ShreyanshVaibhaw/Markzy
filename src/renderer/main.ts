import { createEditor, getMarkdown, setMarkdown } from "./editor";
import { buildExportHTML } from "./export-html";
import { applyTheme, loadSavedTheme } from "./themes/theme-manager";
import { ipc } from "./ipc";
import { setupTitlebar } from "./titlebar";
import { initMenuBar, registerEditorFns } from "./menubar";
import { checkForUpdate } from "./updater";
import { listen } from "@tauri-apps/api/event";
import {
  createTab,
  closeTab,
  switchToTab,
  getActiveTab,
  updateActiveTabFilePath,
  markActiveTabClean,
  markTabClean,
  setActiveTabSlides,
  getActiveTabContent,
  ensureTab,
  getTabForPath,
  hasTabs,
  onTabSwitch,
} from "./tabs";
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
  setActiveTabSlides(true);
}

function exitSourceMode(): void {
  sourceModeActive = false;
  editorEl().classList.remove("hidden");
  sourceEl().classList.remove("visible");
  slidesBtnEl().classList.remove("visible");
  setActiveTabSlides(false);
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

function saveActiveTabState(): void {
  const tab = getActiveTab();
  if (!tab) return;
  if (sourceModeActive) {
    tab.content = sourceEl().value;
  } else {
    tab.content = getMarkdown();
    tab.dirty = true;
  }
  tab.isSlides = sourceModeActive;
}

function loadTabContent(): void {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.isSlides) {
    enterSourceMode(tab.content);
  } else {
    exitSourceMode();
    setMarkdown(tab.content);
  }
}

async function openPathsAsTabs(paths: string[]): Promise<void> {
  const createdIds: string[] = [];
  for (const filePath of paths) {
    const existing = getTabForPath(filePath);
    if (existing) {
      switchToTab(existing.id);
      continue;
    }
    const result = await ipc.openFilePath(filePath);
    if (!result) continue;
    const tab = createTab(result.path, result.content);
    createdIds.push(tab.id);
  }
  for (const id of createdIds) {
    markTabClean(id);
  }
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
    if (!result) return;

    const tab = getActiveTab();
    if (tab && !tab.filePath && !tab.dirty && tab.content === "") {
      updateActiveTabFilePath(result.path);
      setContent(result.content);
    } else {
      createTab(result.path, result.content);
      loadTabContent();
    }
  });

  ipc.onMenuSave(async () => {
    saveActiveTabState();
    const content = getActiveTabContent();
    const ok = await ipc.saveFile(content);
    if (ok) markActiveTabClean();
  });

  ipc.onMenuSaveAs(async () => {
    saveActiveTabState();
    const content = getActiveTabContent();
    const ok = await ipc.saveFileAs(content);
    if (ok) markActiveTabClean();
  });

  ipc.onMenuExportPDF(() => ipc.exportPDF());
  ipc.onMenuExportHTML(() => {
    ipc.exportHTML(buildExportHTML());
  });

  ipc.onNewFile(() => {
    saveActiveTabState();
    createTab();
    exitSourceMode();
    setMarkdown("");
  });

  ipc.onMenuCloseTab(() => {
    saveActiveTabState();
    closeTab(ensureTab().id);
    loadTabContent();
  });

  ipc.onFileOpened((data) => {
    updateActiveTabFilePath(data.path);
    setContent(data.content);
  });

  ipc.onFileChanged((content) => {
    if (sourceModeActive) {
      sourceEl().value = content;
    } else {
      setMarkdown(content);
    }
  });

  ipc.onOpenFilesExternal(async (paths) => {
    saveActiveTabState();
    await openPathsAsTabs(paths);
    loadTabContent();
  });

  ipc.onMenuCheckUpdates(() => checkForUpdate(false));

  ipc.onSetTheme((theme) => applyTheme(theme));
  ipc.onSetCustomCSS((css) => {
    const theme = loadSavedTheme();
    applyTheme(theme, css);
  });

  ipc.onMenuNewSlides(async () => {
    await ipc.newSlides();
  });

  ipc.onNewSlidesContent((content) => {
    createTab(null, content, true);
    enterSourceMode(content);
  });

  ipc.onMenuOpenAsSlides(async () => {
    saveActiveTabState();
    const tab = getActiveTab();
    if (tab) await ipc.openAsSlides(tab.content);
  });

  ipc.onMenuExportSlides(async () => {
    saveActiveTabState();
    await ipc.exportSlides(getActiveTabContent());
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
    if (
      !filePath.endsWith(".md") &&
      !filePath.endsWith(".markdown") &&
      !filePath.endsWith(".mdown") &&
      !filePath.endsWith(".mkd")
    )
      return;
    saveActiveTabState();
    await openPathsAsTabs([filePath]);
    loadTabContent();
  });

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  const startupPaths = await ipc.getStartupFiles();
  if (startupPaths.length > 0) {
    await openPathsAsTabs(startupPaths);
  }
  if (!hasTabs()) {
    createTab();
  }
  loadTabContent();

  window.setTimeout(() => {
    void checkForUpdate(true);
  }, 3000);
}

onTabSwitch((prev, next) => {
  if (prev && prev.id !== next.id) {
    if (sourceModeActive) {
      prev.content = sourceEl().value;
    } else {
      prev.content = getMarkdown();
      prev.dirty = true;
    }
    prev.isSlides = sourceModeActive;
  }
  loadTabContent();
  if (prev?.filePath) {
    ipc.stopWatch();
  }
  if (next.filePath) {
    ipc.watchFile(next.filePath);
  }
});

initMenuBar();
registerEditorFns({
  setContent,
  saveTabState: saveActiveTabState,
  exitSourceMode,
  loadTabContent,
});

init().catch((e) => console.error("Markzy init failed:", e));
