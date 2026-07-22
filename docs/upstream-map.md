# Upstream Responsibility Map + IPC Contract

> Reference: `../ColaMD-upstream` (Electron source, v1.5.0)
> This document is the contract between the Rust backend and the TypeScript renderer. Every later phase depends on it.

## 1. Responsibility map: upstream `src/main/index.ts` -> Rust module

| Upstream responsibility | Upstream function/section | Rust module | Notes |
|---|---|---|---|
| Window creation (960x720, frameless, traffic lights) | `createWindow()` | `main.rs` / `lib.rs` + `tauri.conf.json` | Tauri frameless window; macOS uses `macOSPrivateApi` for traffic lights. Window size in upstream is 960x720 (plan.md said 960x640 - use upstream's 960x720). |
| Per-window state (filePath, watcher, agent state) | `WindowState` struct + `windowStates` map | `watcher.rs` + `commands.rs` | Tauri has single-window by default; multi-window is a future concern. State held in `tauri::Manager` state. |
| Title updates (`fileName - Markzy`) | `updateTitle()` | `commands.rs` | Set via `window.set_title()`. |
| File name suggestion (from first heading) | `suggestFileName()` | `commands.rs` | Same regex logic in Rust. |
| File watching (`fs.watch`) | `watchFile()` | `watcher.rs` | Use `notify` crate. **Upstream debounces 100ms** (not 200ms - plan.md was approximate). |
| Agent activity state machine | `transitionAgentState()` | `watcher.rs` | **Upstream timing: active -> cooldown after 3s, cooldown -> idle after 2s.** Plan.md said ~600ms; use the actual upstream values to match the dot animation exactly. |
| Image path resolution (relative -> `file://`) | `resolveImagePaths()` | `commands.rs` / `watcher.rs` | Rewrite relative `![](path)` to `file://` absolute URLs. Do this in Rust before sending content to renderer. |
| File loading | `loadFileInWindow()` | `commands.rs` | Read file, set state, start watcher, emit `file-opened`. |
| File open (reuse window or create new) | `openFile()`, `openFilePath()` | `commands.rs` | v1: single window. If a file is already open, open-in-new-window is a future concern; for now replace current. |
| Saving (with slides asset copy) | `saveToPath()`, `saveFile()`, `saveFileAs()` | `commands.rs` | When content has `kicker:` or `chip:`, copy slides template assets alongside. `isInternalSave` flag suppresses watcher during self-save. |
| Export PDF (`printToPDF`) | `export-pdf` handler | `export.rs` | Upstream uses Electron's silent `printToPDF`. Tauri v1 uses webview print dialog (Save as PDF). Documented parity gap. |
| Export HTML (renderer-built HTML) | `export-html` handler | `export.rs` | Upstream renderer builds the full HTML string (with computed styles) and passes it to main to write. Tauri can do the same: renderer builds HTML, Rust writes it. |
| Slides local HTTP server | `getOrCreateSlidesServer()` | `slides.rs` | `axum` on `127.0.0.1:0` (OS-assigned port). Serves template.html + assets from the file's directory. |
| New Slides (load template into editor) | `new-slides` handler | `commands.rs` / `slides.rs` | Reads `slides-template.md`, emits `new-slides-content` to renderer. |
| Open as Slides (serve + open browser) | `open-as-slides` handler | `slides.rs` | Auto-saves current content, copies `template.html` to file's dir, patches `fetch('slides.md')` if filename differs, starts server, opens browser. |
| Export Slides (inline images, copy videos) | `export-slides` handler | `export.rs` | Detect video via `<!-- type: video, src: ... -->`. No video: single HTML with base64 images. With video: folder + videos. |
| Custom themes (`~/.markzy/themes/`) | `loadCustomTheme()`, `loadThemeCSS()`, `scanCustomThemes()` | `theme.rs` | Use `dirs` crate for home dir. Same path: `~/.markzy/themes/`. |
| Menu (File/Edit/View/Theme/Help) | `buildMenu()` | `lib.rs` (Tauri menu API) | Reproduce exact menu structure. Menu sends events to renderer (same event names). |
| Open external URL | `open-external` handler | `tauri-plugin-opener` | Validate `https://` or `http://` only. |
| App lifecycle (file args, open-file event) | `whenReady()`, `open-file` | `lib.rs` | Parse CLI args for file paths; handle file association launches. |
| Drag & drop | renderer-side (via `getPathForFile`) | renderer + Tauri drop handler | Upstream uses `webUtils.getPathForFile(file)`. Tauri provides drop events with paths directly. |

## 2. IPC contract (the exact API surface to reproduce)

The renderer calls `window.electronAPI.*`. In Tauri, `src/renderer/ipc.ts` must export an object with these **same method names and signatures**, implemented via `invoke()` and `listen()`. The Rust commands use snake_case; `ipc.ts` maps camelCase -> snake_case.

### Commands (renderer -> Rust, via `invoke`)

| Method | Arguments | Return | Rust command | Notes |
|---|---|---|---|---|
| `openFile()` | none | `{path: string, content: string} \| null` | `open_file` | Dialog -> read -> set state -> start watcher. |
| `openFilePath(path)` | `path: string` | `{path: string, content: string} \| null` | `open_file_path` | Open a specific path (drag-drop, file association). |
| `saveFile(content)` | `content: string` | `boolean` | `save_file` | If no path, show save dialog. Copy slides assets if content looks like slides. |
| `saveFileAs(content)` | `content: string` | `boolean` | `save_file_as` | Always show save dialog. |
| `exportPDF()` | none | `boolean` | `export_pdf` | Tauri: webview print dialog. |
| `exportHTML(html)` | `html: string` | `boolean` | `export_html` | Renderer builds the HTML; Rust writes it. |
| `exportSlides(content)` | `content: string` | `boolean` | `export_slides` | Inline images, copy videos. |
| `newSlides()` | none | `string \| null` | `new_slides` | Returns template content (or emits `new-slides-content` event). |
| `openAsSlides(content)` | `content: string` | `boolean` | `open_as_slides` | Auto-save, start server, open browser. |
| `loadCustomTheme()` | none | `{name: string, css: string} \| null` | `load_custom_theme` | Dialog -> copy to `~/.markzy/themes/` -> return CSS. |
| `loadThemeCSS(fileName)` | `fileName: string` | `string \| null` | `load_theme_css` | Read CSS from `~/.markzy/themes/{fileName}`. |
| `getPathForFile(file)` | `file: File` | `string` | **not needed** | Tauri drop events provide paths directly; no `File` object path resolution needed. |
| `openExternal(url)` | `url: string` | `void` | `open_external` | Validate http(s). Uses `tauri-plugin-opener`. |
| `getCurrentFilePath()` | none | `string \| null` | `get_current_file_path` | Markzy tabs helper used to associate an untitled tab after Save As. |
| `watchFile(path)` | `path: string` | `void` | `watch_file` | Markzy tabs helper; switches the watcher before saving a background tab. |
| `stopWatch()` | none | `void` | `stop_watch` | Markzy tabs helper; clears the active watcher before switching tabs. |

### Events (Rust -> renderer, via `listen`)

| Event name | Payload | When emitted | Renderer handler |
|---|---|---|---|
| `file-changed` | `content: string` | External file change detected (debounced) | `onFileChanged` -> updates editor content |
| `file-opened` | `{path: string, content: string}` | File loaded via `loadFileInWindow` | `onFileOpened` -> sets content |
| `new-file` | none | New window / new file | `onNewFile` -> clears editor |
| `new-slides-content` | `content: string` | New Slides menu item | `onNewSlidesContent` -> enters source mode |
| `menu-open` | none | File -> Open menu | `onMenuOpen` -> calls `openFile()` |
| `menu-save` | none | File -> Save menu | `onMenuSave` -> calls `saveFile()` |
| `menu-save-as` | none | File -> Save As menu | `onMenuSaveAs` -> calls `saveFileAs()` |
| `menu-export-pdf` | none | File -> Export PDF menu | `onMenuExportPDF` -> calls `exportPDF()` |
| `menu-export-html` | none | File -> Export HTML menu | `onMenuExportHTML` -> builds HTML, calls `exportHTML()` |
| `menu-new-slides` | none | File -> New Slides menu | `onMenuNewSlides` -> calls `newSlides()` |
| `menu-open-as-slides` | none | File -> Open as Slides menu | `onMenuOpenAsSlides` -> calls `openAsSlides()` |
| `menu-export-slides` | none | File -> Export Slides menu | `onMenuExportSlides` -> calls `exportSlides()` |
| `menu-import-theme` | none | Theme -> Import Theme menu | `onMenuImportTheme` -> calls `loadCustomTheme()` |
| `set-theme` | `theme: string` | Theme menu selection | `onSetTheme` -> applies theme |
| `set-custom-css` | `css: string` | Custom theme selected | `onSetCustomCSS` -> applies custom CSS |
| `agent-activity` | `state: 'idle' \| 'active' \| 'cooldown'` | Agent state machine transitions | `onAgentActivity` -> sets dot class |

### TypeScript interface (for `ipc.ts` to implement)

```typescript
export interface MarkzyAPI {
  openFile: () => Promise<{ path: string; content: string } | null>;
  openFilePath: (path: string) => Promise<{ path: string; content: string } | null>;
  saveFile: (content: string) => Promise<boolean>;
  saveFileAs: (content: string) => Promise<boolean>;
  exportPDF: () => Promise<boolean>;
  exportHTML: (html: string) => Promise<boolean>;
  exportSlides: (content: string) => Promise<boolean>;
  newSlides: () => Promise<string | null>;
  openAsSlides: (content: string) => Promise<boolean>;
  loadCustomTheme: () => Promise<{ name: string; css: string } | null>;
  loadThemeCSS: (fileName: string) => Promise<string | null>;
  openExternal: (url: string) => void;
  getCurrentFilePath: () => Promise<string | null>;
  watchFile: (path: string) => Promise<void>;
  stopWatch: () => Promise<void>;
  onFileChanged: (callback: (content: string) => void) => void;
  onNewFile: (callback: () => void) => void;
  onFileOpened: (callback: (data: { path: string; content: string }) => void) => void;
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
  onAgentActivity: (callback: (state: 'idle' | 'active' | 'cooldown') => void) => void;
}
```

## 3. Renderer file reuse plan

| Upstream file | Destination | Reuse strategy | Changes needed |
|---|---|---|---|
| `src/renderer/main.ts` | `src/renderer/main.ts` | **Reuse with edits** | Replace `window.electronAPI` with imported `ipc` object. All `api.*` calls become `ipc.*`. Logic stays identical. |
| `src/renderer/editor/editor.ts` | `src/renderer/editor.ts` | **Reuse with edits** | Replace `window.electronAPI.openExternal(href)` with `ipc.openExternal(href)`. Everything else (Milkdown setup, remark-breaks, clipboard enhancement, cmd+click) stays. |
| `src/renderer/editor/html-view.ts` | `src/renderer/html-view.ts` (or inline into editor.ts) | **Reuse as-is** | No changes. Milkdown html schema view. |
| `src/renderer/themes/theme-manager.ts` | `src/renderer/themes/theme-manager.ts` | **Reuse as-is** | Uses `localStorage` for persistence - works in WebView2. No changes. |
| `src/renderer/themes/base.css` | `src/renderer/themes/base.css` | **Reuse with edits** | Replace `-webkit-app-region: drag` with `data-tauri-drag-region` attribute approach (Tauri uses attribute on element, not CSS property). The `#titlebar` and `#agent-dot` and `#slides-btn` need `data-tauri-drag-region` on the titlebar and NOT on the interactive children. |
| `src/renderer/index.html` | `index.html` (project root) | **Reuse with edits** | Change script path from `./main.ts` to `/src/renderer/main.ts`. Remove Electron CSP meta (Tauri manages CSP). Add `data-tauri-drag-region` to `#titlebar`. |
| `src/renderer/env.d.ts` | `src/renderer/env.d.ts` | **Drop** | Replaced by `ipc.ts` which exports the API type. No `window.electronAPI` global needed. |

## 4. Key behavioral details to preserve

### Agent activity state machine (CRITICAL)

Upstream uses a **3-state** machine with specific timing:

```
idle --(file change, gap < 2000ms)--> active
active --(3s after last change)--> cooldown
cooldown --(2s after entering cooldown)--> idle
```

- `active`: dot gets class `active` (orange, breathing animation `agent-breathe 2s ease-in-out infinite`)
- `cooldown`: dot gets class `cooldown` (green, no animation)
- `idle`: dot has no class (gray, opacity 0.3)

The renderer handler: `agentDot.className = state === 'idle' ? '' : state`

**This differs from plan.md's "~600ms" - use the actual upstream timing (3s + 2s).**

### File watching debounce

Upstream debounces **100ms** (not 200ms). Use 100ms to match upstream responsiveness.

### Internal save suppression

When the user saves a file, the watcher would detect the write. Upstream sets `isInternalSave = true` during save and resets it after 100ms. The watcher checks `state.isInternalSave` and skips. Reproduce this in Rust.

### Image path resolution

Before sending file content to the renderer (on open and on change), rewrite relative image paths to `file://` absolute URLs:

```
![alt](relative/path.png) -> ![alt](file:///abs/dir/relative/path.png)
```

Regex: `/!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/|data:)([^)]+)\)/g`

### Slides content detection

The renderer checks if content is slides by: `/^---\s*\n[\s\S]*?(kicker|chip):/m`. If true, it enters **source mode** (textarea editor instead of WYSIWYG) and shows the slides button.

### Slides template architecture

The slides template (`template.html`) is a self-contained HTML file that:
1. Fetches `slides.md` via `fetch('slides.md')`
2. Parses frontmatter + slides (split on `---`)
3. Renders a full-screen deck with navigation

For "Open as Slides", upstream copies `template.html` into the file's directory and serves that directory via HTTP. The template fetches the `.md` file by name (patched if not `slides.md`).

For "Export Slides", upstream inlines the markdown content directly into the template (replacing the `fetch()` call with `Promise.resolve(`...`)`) and base64-inlines images.

### Clipboard enhancement (rich text copy)

On `copy`/`cut` events, the renderer intercepts the clipboard HTML and adds inline styles to each element (h1, h2, p, code, etc.) so that pasting into WeChat/email preserves formatting. This is purely renderer-side and needs no Rust involvement.

### Menu structure (exact)

```
Markzy (mac only): About, Sep, Hide, Hide Others, Unhide, Sep, Quit
File: New (CmdOrCtrl+N), New Slides (CmdOrCtrl+Shift+N), Open (CmdOrCtrl+O), Sep, Save (CmdOrCtrl+S), Save As (CmdOrCtrl+Shift+S), Sep, Export PDF, Export HTML, Export Slides, Open as Slides (CmdOrCtrl+Shift+P), Sep, Close/Quit
Edit: Undo, Redo, Sep, Cut, Copy, Paste, Select All
View: Reset Zoom, Zoom In, Zoom Out, Sep, Toggle Fullscreen
Theme: Light, Dark, Elegant, Newsprint, [Sep, custom themes...], Sep, Import Theme...
Help: About Markzy -> opens https://github.com/ShreyanshVaibhaw/Markzy
```

### Built-in themes

Four built-in themes defined as CSS classes in `base.css`:
- `theme-light` (GitHub-like light)
- `theme-dark` (GitHub-like dark)
- `theme-elegant` (warm serif, terracotta accents - **default**)
- `theme-newsprint` (newspaper serif)

Default theme: `elegant` (from `loadSavedTheme()` fallback).

### Custom themes

Stored in `~/.markzy/themes/*.css`. The menu scans this directory and lists each `.css` file as a theme option. Selecting a custom theme sends both `set-theme` (`custom:filename`) and `set-custom-css` (the CSS content).

## 5. Discrepancies with plan.md (resolved)

| plan.md says | Upstream actually does | Resolution |
|---|---|---|
| Debounce ~200ms | Debounce 100ms | **Use 100ms** (match upstream) |
| Settle ~600ms | Active 3s -> Cooldown 2s -> Idle | **Use 3s + 2s** (match upstream) |
| Window 960x640 | Window 960x720, minWidth 600, minHeight 400 | **Use 960x720** (match upstream) |
| States: Idle/Active/Settled | States: idle/active/cooldown | **Use idle/active/cooldown** (match upstream naming) |
| Events: agent-active, agent-idle | Event: agent-activity with state param | **Use agent-activity** event with `'idle'\|'active'\|'cooldown'` payload (match upstream) |

These are noted here so the executing agent uses the **actual upstream behavior**. AGENTS.md says "match upstream's exact animation timing" - that is the governing rule.
