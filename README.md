# Markzy

The Agent Native Markdown Editor - a Tauri 2 + Rust rebuild of [ColaMD](https://github.com/marswaveai/ColaMD).

When an AI agent edits a `.md` file on disk, the editor updates in real time and a titlebar dot pulses orange while the agent writes and flashes green when it settles.

## Why a rebuild?

The original ColaMD is built on Electron (~200MB+ RAM, ~150MB installers). Markzy uses Tauri 2 with the native OS webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), targeting ~10-30MB RAM and ~5-15MB installers - roughly 10x lighter - while keeping full feature parity and the same Milkdown WYSIWYG editor.

## Results

| Metric | Electron (upstream ColaMD) | Markzy (Tauri) | Improvement |
|---|---|---|---|
| RAM usage | ~200MB+ | ~30MB | ~7x less |
| MSI installer | ~150MB | 4.38MB | ~34x smaller |
| NSIS installer | ~150MB | 2.88MB | ~52x smaller |
| Executable | N/A | 13.45MB | - |
| Cold start | Slower | Instant | - |

## Tech stack

- **Shell:** Tauri 2 (Rust backend + native webview)
- **Renderer:** TypeScript + Vite, reusing the upstream Milkdown editor
- **Markdown parsing:** pulldown-cmark (Rust)
- **File watching:** notify crate
- **Slides server:** axum (loopback only)

## Features

- **Live Agent Sync** - Real-time updates when AI agents edit your `.md` file
- **Agent Activity Indicator** - Orange pulse while writing, green flash when done
- **WYSIWYG Markdown** - Milkdown editor, no split-pane preview
- **Smart Line Breaks** - Single newlines render as line breaks
- **Rich Text Copy** - Paste into WeChat/email with formatting preserved
- **Themes** - 4 built-in themes + custom CSS import
- **Slides** - Markdown as Database: turn `.md` into slide decks
- **Export** - PDF (print dialog) and HTML (self-contained)
- **Slides Export** - Single HTML with inlined images, or folder with videos
- **Drag & Drop** - Drop `.md` files onto the window
- **File Associations** - Double-click `.md` files to open in Markzy
- **Cmd/Ctrl+Click Links** - Open links in your browser

## Development

```bash
npm install
npm run tauri dev
```

## Build (installers)

```bash
npm run tauri build
```

Produces MSI and NSIS installers in `src-tauri/target/release/bundle/`.

## Differences from upstream Electron build

- **Memory:** ~30MB RAM vs ~200MB+ (7x reduction)
- **Installer size:** 4.38MB MSI / 2.88MB NSIS vs ~150MB (34-52x reduction)
- **PDF export:** Uses the OS print dialog ("Save as PDF") rather than silent `printToPDF`. See `docs/export.md`.
- **Multi-window:** v1 uses single window; upstream supports multiple windows. See `docs/parity-gaps.md`.

## Project structure

See `AGENTS.md` for the full repository layout, coding conventions, and the core feature spec. See `plan.md` for the phase-by-phase build plan.

## License

MIT - Free forever.

Markzy is a Tauri 2 rebuild of [ColaMD](https://github.com/marswaveai/ColaMD) by [marswave.ai](https://marswave.ai), built by [ShreyanshVaibhaw](https://github.com/ShreyanshVaibhaw).
