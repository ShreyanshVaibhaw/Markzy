# Parity gaps vs upstream ColaMD (Electron)

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
