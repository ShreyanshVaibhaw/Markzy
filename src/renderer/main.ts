import { createEditor, getMarkdown, setMarkdown } from "./editor";
import { buildExportHTML } from "./export-html";
import { applyTheme, loadSavedTheme } from "./themes/theme-manager";
import { ipc } from "./ipc";
import { setupTitlebar } from "./titlebar";
import { initMenuBar, registerEditorFns } from "./menubar";
import { checkForUpdate } from "./updater";
import { listen } from "@tauri-apps/api/event";
import { message } from "@tauri-apps/plugin-dialog";
import { resolveUnsavedChanges, type CloseChoice } from "./close-guard";
import {
  createTab,
  closeTab,
  switchToTab,
  getActiveTab,
  getTabById,
  updateActiveTabFilePath,
  updateActiveTabContent,
  replaceActiveTabContent,
  markActiveTabClean,
  setActiveTabSlides,
  getActiveTabContent,
  ensureTab,
  getTabForPath,
  hasTabs,
  getDirtyTabs,
  onTabSwitch,
  onTabCloseRequest,
  type Tab,
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
  updateActiveTabContent(getContent());
  setActiveTabSlides(sourceModeActive);
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
  for (const filePath of paths) {
    const existing = getTabForPath(filePath);
    if (existing) {
      switchToTab(existing.id);
      continue;
    }
    const result = await ipc.openFilePath(filePath);
    if (!result) continue;
    createTab(result.path, result.content);
  }
}

async function saveActiveTab(saveAs = false): Promise<boolean> {
  saveActiveTabState();
  const content = getActiveTabContent();
  const ok = saveAs ? await ipc.saveFileAs(content) : await ipc.saveFile(content);
  if (!ok) return false;
  const path = await ipc.getCurrentFilePath();
  if (path) updateActiveTabFilePath(path);
  markActiveTabClean();
  return true;
}

async function chooseCloseAction(tab: Tab): Promise<CloseChoice> {
  const result = await message(`Save changes to "${tab.title}" before closing?`, {
    title: "Markzy",
    kind: "warning",
    buttons: { yes: "Save", no: "Don't Save", cancel: "Cancel" },
  });
  if (result === "Save") return "Save";
  if (result === "Don't Save") return "Don't Save";
  if (result === "Cancel") return "Cancel";
  return "Cancel";
}

async function saveTabBeforeClose(tab: Tab): Promise<boolean> {
  switchToTab(tab.id);
  await ipc.stopWatch();
  if (tab.filePath) await ipc.watchFile(tab.filePath);
  return saveActiveTab();
}

async function confirmTabsClose(tabs: readonly Tab[]): Promise<boolean> {
  try {
    return await resolveUnsavedChanges(tabs, chooseCloseAction, saveTabBeforeClose);
  } catch (error) {
    console.error("Could not save changes:", error);
    try {
      await message("Could not save changes. The document will remain open.", {
        title: "Markzy",
        kind: "error",
        buttons: { ok: "OK" },
      });
    } catch {
      return false;
    }
    return false;
  }
}

async function confirmWindowClose(): Promise<boolean> {
  saveActiveTabState();
  return confirmTabsClose(getDirtyTabs());
}

async function requestCloseTab(tabId: string): Promise<void> {
  const tab = getTabById(tabId);
  if (!tab) return;
  if (getActiveTab()?.id === tabId) saveActiveTabState();
  if (tab.dirty && !(await confirmTabsClose([tab]))) return;
  closeTab(tabId);
  loadTabContent();
}

async function init(): Promise<void> {
  const savedTheme = loadSavedTheme();
  applyTheme(savedTheme);

  if (savedTheme.startsWith("custom:")) {
    const fileName = savedTheme.slice(7);
    const css = await ipc.loadThemeCSS(fileName);
    if (css) applyTheme(savedTheme, css);
  }

  await createEditor("editor", updateActiveTabContent);
  sourceEl().addEventListener("input", () => updateActiveTabContent(sourceEl().value));

  slidesBtnEl().addEventListener("click", () => ipc.openAsSlides(getContent()));

  ipc.onMenuOpen(async () => {
    const result = await ipc.openFile();
    if (!result) return;

    const tab = getActiveTab();
    if (tab && !tab.filePath && !tab.dirty && tab.content === "") {
      updateActiveTabFilePath(result.path);
      replaceActiveTabContent(result.content);
      setContent(result.content);
    } else {
      createTab(result.path, result.content);
      loadTabContent();
    }
  });

  ipc.onMenuSave(() => saveActiveTab());

  ipc.onMenuSaveAs(() => saveActiveTab(true));

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

  ipc.onMenuCloseTab(() => requestCloseTab(ensureTab().id));

  ipc.onFileOpened((data) => {
    updateActiveTabFilePath(data.path);
    replaceActiveTabContent(data.content);
    setContent(data.content);
  });

  ipc.onFileChanged((content) => {
    replaceActiveTabContent(content);
    setContent(content);
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

  setupTitlebar(ipc, confirmWindowClose);

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
  loadTabContent();
  if (prev?.filePath) {
    void ipc.stopWatch();
  }
  if (next.filePath) {
    void ipc.watchFile(next.filePath);
  }
});

onTabCloseRequest(requestCloseTab);

initMenuBar();
registerEditorFns({
  setContent,
  saveTabState: saveActiveTabState,
  exitSourceMode,
  loadTabContent,
  closeActiveTab: () => requestCloseTab(ensureTab().id),
});

init().catch((e) => console.error("Markzy init failed:", e));
