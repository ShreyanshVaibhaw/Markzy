# Parity gaps vs upstream ColaMD (Electron)

## WebView2 renderer hardening (security note)

The `additionalBrowserArgs` in `tauri.conf.json` previously disabled several WebView2 renderer-isolation and integrity features (`SiteIsolation`, `IsolateOrigins`, `site-per-process`, `RendererCodeIntegrity`) along with the zygote (`--no-zygote`) and the GPU sandbox (`--disable-gpu-sandbox`). Those were removed to restore process-isolation hardening. Only footprint / privacy / telemetry flags (GPU compositing, extensions, background networking, sync, optimization hints, translate, smart screen, back/forward cache, etc.) remain disabled. `--in-process-gpu` is kept intentionally for footprint; it does trade the sandboxed GPU process for in-process GPU, accepted as part of the low-footprint goal.

## In-window tabs (Markzy-specific, beyond upstream)

**Upstream (Electron):** Single document per window. Multiple documents are handled via multiple OS windows (`BrowserWindow`). `docs/upstream-map.md` lists multi-window support as a future concern.

**Markzy:** Implements in-window tabbed editing (`src/renderer/tabs.ts`, `#tab-bar` in `index.html`, `Close Tab` menu item, `menu-close-tab` IPC). Each tab tracks its own `filePath`, `content`, `isSlides`, and `dirty` state. Switching tabs stops the watcher on the previous file and starts it on the next (`onTabSwitch` in `main.ts`).

**Why this is not a violation of the "no file manager / workspace" scope:** tabs are document-centric, not a tree/explorer view. There is no folder workspace, no file tree, and no project concept. A tab is simply another open document, mirroring how a user would otherwise get multiple windows. This is an intentional Markzy enhancement over upstream v1.5.0.

**Caveat:** `WatcherState` is currently a single global. The watcher correctly follows the *active* tab (stop/start on switch), so only one file is watched at a time. Background-tab external edits are not detected until the tab is activated. Documented limitation.

## PDF export: print dialog vs silent generation

**Upstream (Electron):** Uses `webContents.printToPDF()` to silently generate a PDF file with no user interaction beyond choosing the save location.

**Markzy (v1):** Uses `WebviewWindow::print()` which opens the OS-native print dialog. The user must select "Save as PDF" as the printer destination.

**Impact:** One extra click in the print dialog. The output PDF is equivalent.

**Future fix:** Integrate a headless browser crate for silent PDF generation. See `docs/export.md` for details.

## Multi-window support

**Upstream:** Supports multiple windows - opening a file when one is already open creates a new window. Each window has independent state.

**Markzy (v1):** Single window. Opening a file replaces the current document. This is a simplification for v1.

**Future fix:** Implement multi-window support using Tauri's `WebviewWindowBuilder` and per-window state management.

## OS file-open on macOS

**Upstream (Electron):** On macOS, double-clicking an associated `.md` file when the app is already running delivers an `open-file` Apple event to the running instance, which opens the file. Cold start passes the path via `process.argv`.

**Markzy (v1):** Windows and Linux are handled via `tauri-plugin-single-instance` (warm start forwards argv to the running instance; cold start reads `std::env::args()` in `setup()`). macOS is **not** handled this iteration: `tauri-plugin-single-instance` is a no-op on macOS, and the `RunEvent::Opened` / `open-file` Apple-event path is not yet wired up. Cold-start argv on macOS is covered by the same `setup()` scan, but warm-start forwarding (file opened while the app is already running) will not reach the existing window.

**Impact:** On macOS, double-clicking a file when Markzy is already running will not open it in the running instance. Cold start (app closed) works.

**Future fix:** Handle `RunEvent::Opened` (macOS open-file events) in the `run()` event loop to emit `open-files-external` for the running instance, mirroring the Windows/Linux single-instance path.

## Atomic rewrites (temp + rename)

**Upstream (Electron):** `fs.watch` reacquires the watch and emits a change when a tool rewrites the file via temp + rename.

**Markzy:** The watcher observes the file's **parent directory** (`NonRecursive`) and filters events by path equality, so the watch itself never needs reacquiring when the target file is deleted and recreated or renamed-over (the directory watch survives). To tolerate the brief window where the file may not exist yet (delete-then-create, or in-flight rename), `watcher.rs` retries `read_to_string` up to 5 times with 20ms spacing before dropping the event. `Move-Item -Force` on Windows (atomic rename-to-target) is handled cleanly because the new file is present by the time the debounced event fires.
