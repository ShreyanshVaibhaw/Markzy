# Export approach and future enhancements

## Current implementation (v1)

### HTML export
The renderer builds a complete standalone HTML document (with computed CSS variables from the active theme inlined) and passes it to the Rust backend, which writes it to a file chosen via save dialog. The output is self-contained - no external CSS dependencies.

### PDF export
Uses the Tauri 2 `WebviewWindow::print()` API, which opens the OS-native print dialog (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux). The user selects "Save as PDF" as the destination.

This differs from upstream ColaMD (Electron), which uses `webContents.printToPDF()` to silently generate a PDF without user interaction. This is a **known parity gap** - documented here and in `docs/parity-gaps.md`.

### Slides export
Replicates upstream behavior exactly:
- **Without video**: produces a single `.html` file with all images inlined as base64 data URIs. The markdown content is embedded directly (replacing the `fetch('slides.md')` call with `Promise.resolve(...)`). The file is double-clickable and self-contained.
- **With video**: produces a folder containing `index.html` plus the video files copied alongside. Video paths remain relative. The folder can be zipped and shared.

## Future enhancements

- **One-click headless PDF**: integrate a headless browser crate (e.g. `headless-chrome`) to generate PDFs silently without the print dialog. This would close the parity gap with Electron's `printToPDF`. Trade-off: adds a Chromium dependency (memory only during export, not runtime).
- **PDF page size/margin options**: expose page size (A4, Letter, etc.) and margin controls in the export dialog.
- **Slides export with custom templates**: allow choosing alternative HTML templates for slide export.
