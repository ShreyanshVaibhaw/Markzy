import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface FileContent {
  path: string;
  content: string;
}

export interface ThemeResult {
  name: string;
  css: string;
}

export type AgentState = "idle" | "active" | "cooldown";

export interface MarkzyAPI {
  openFile: () => Promise<FileContent | null>;
  openFilePath: (path: string) => Promise<FileContent | null>;
  saveFile: (content: string) => Promise<boolean>;
  saveFileAs: (content: string) => Promise<boolean>;
  exportPDF: () => Promise<boolean>;
  exportHTML: (html: string) => Promise<boolean>;
  exportSlides: (content: string) => Promise<boolean>;
  newSlides: () => Promise<boolean | null>;
  openAsSlides: (content: string) => Promise<boolean>;
  loadCustomTheme: () => Promise<ThemeResult | null>;
  loadThemeCSS: (fileName: string) => Promise<string | null>;
  openExternal: (url: string) => void;
  getStartupFiles: () => Promise<string[]>;
  getCurrentFilePath: () => Promise<string | null>;
  onFileChanged: (callback: (content: string) => void) => void;
  onNewFile: (callback: () => void) => void;
  onFileOpened: (callback: (data: FileContent) => void) => void;
  onOpenFilesExternal: (callback: (paths: string[]) => void) => void;
  onMenuOpen: (callback: () => void) => void;
  onMenuSave: (callback: () => void) => void;
  onMenuSaveAs: (callback: () => void) => void;
  onMenuExportPDF: (callback: () => void) => void;
  onMenuExportHTML: (callback: () => void) => void;
  onMenuNewSlides: (callback: () => void) => void;
  onMenuOpenAsSlides: (callback: () => void) => void;
  onNewSlidesContent: (callback: (content: string) => void) => void;
  onSetTheme: (callback: (theme: string) => void) => void;
  onSetCustomCSS: (callback: (css: string) => void) => void;
  onMenuImportTheme: (callback: () => void) => void;
  onMenuExportSlides: (callback: () => void) => void;
  onMenuCloseTab: (callback: () => void) => void;
  onMenuCheckUpdates: (callback: () => void) => void;
  onAgentActivity: (callback: (state: AgentState) => void) => void;
  stopWatch: () => Promise<void>;
  watchFile: (path: string) => Promise<void>;
}

export const ipc: MarkzyAPI = {
  openFile: () => invoke<FileContent | null>("open_file"),
  openFilePath: (path: string) => invoke<FileContent | null>("open_file_path", { path }),
  saveFile: (content: string) => invoke<boolean>("save_file", { content }),
  saveFileAs: (content: string) => invoke<boolean>("save_file_as", { content }),
  exportPDF: () => invoke<boolean>("export_pdf"),
  exportHTML: (html: string) => invoke<boolean>("export_html", { html }),
  exportSlides: (content: string) => invoke<boolean>("export_slides", { content }),
  newSlides: () => invoke<boolean | null>("new_slides"),
  openAsSlides: (content: string) => invoke<boolean>("open_as_slides", { content }),
  loadCustomTheme: () => invoke<ThemeResult | null>("load_custom_theme"),
  loadThemeCSS: (fileName: string) => invoke<string | null>("load_theme_css", { fileName }),
  openExternal: (url: string) => {
    invoke("open_external", { url });
  },
  getStartupFiles: () => invoke<string[]>("get_startup_files"),
  getCurrentFilePath: () => invoke<string | null>("get_current_file_path"),
  onFileChanged: (callback) => {
    listen("file-changed", (event) => callback(event.payload as string));
  },
  onNewFile: (callback) => {
    listen("new-file", () => callback());
  },
  onFileOpened: (callback) => {
    listen("file-opened", (event) => callback(event.payload as FileContent));
  },
  onOpenFilesExternal: (callback) => {
    listen("open-files-external", (event) => callback(event.payload as string[]));
  },
  onMenuOpen: (callback) => {
    listen("menu-open", () => callback());
  },
  onMenuSave: (callback) => {
    listen("menu-save", () => callback());
  },
  onMenuSaveAs: (callback) => {
    listen("menu-save-as", () => callback());
  },
  onMenuExportPDF: (callback) => {
    listen("menu-export-pdf", () => callback());
  },
  onMenuExportHTML: (callback) => {
    listen("menu-export-html", () => callback());
  },
  onMenuNewSlides: (callback) => {
    listen("menu-new-slides", () => callback());
  },
  onMenuOpenAsSlides: (callback) => {
    listen("menu-open-as-slides", () => callback());
  },
  onNewSlidesContent: (callback) => {
    listen("new-slides-content", (event) => callback(event.payload as string));
  },
  onSetTheme: (callback) => {
    listen("set-theme", (event) => callback(event.payload as string));
  },
  onSetCustomCSS: (callback) => {
    listen("set-custom-css", (event) => callback(event.payload as string));
  },
  onMenuImportTheme: (callback) => {
    listen("menu-import-theme", () => callback());
  },
  onMenuExportSlides: (callback) => {
    listen("menu-export-slides", () => callback());
  },
  onAgentActivity: (callback) => {
    listen("agent-activity", (event) => callback(event.payload as AgentState));
  },
  onMenuCloseTab: (callback) => {
    listen("menu-close-tab", () => callback());
  },
  onMenuCheckUpdates: (callback) => {
    listen("menu-check-updates", () => callback());
  },
  stopWatch: () => invoke<void>("stop_watch"),
  watchFile: (path: string) => invoke<void>("watch_file", { path }),
};
