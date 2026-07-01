# Parity gaps vs upstream ColaMD (Electron)

## PDF export: print dialog vs silent generation

**Upstream (Electron):** Uses `webContents.printToPDF()` to silently generate a PDF file with no user interaction beyond choosing the save location.

**ColaMD-Tauri (v1):** Uses `WebviewWindow::print()` which opens the OS-native print dialog. The user must select "Save as PDF" as the printer destination.

**Impact:** One extra click in the print dialog. The output PDF is equivalent.

**Future fix:** Integrate a headless browser crate for silent PDF generation. See `docs/export.md` for details.

## Multi-window support

**Upstream:** Supports multiple windows - opening a file when one is already open creates a new window. Each window has independent state.

**ColaMD-Tauri (v1):** Single window. Opening a file replaces the current document. This is a simplification for v1.

**Future fix:** Implement multi-window support using Tauri's `WebviewWindowBuilder` and per-window state management.
