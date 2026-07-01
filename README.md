# ColaMD-Tauri (Markzy)

The Agent Native Markdown Editor - a Tauri 2 + Rust rebuild of [ColaMD](https://github.com/marswaveai/ColaMD).

When an AI agent edits a `.md` file on disk, the editor updates in real time and a titlebar dot pulses orange while the agent writes and flashes green when it settles.

## Why a rebuild?

The original ColaMD is built on Electron (~200MB+ RAM, ~150MB installers). This rebuild uses Tauri 2 with the native OS webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), targeting ~10-30MB RAM and ~5-15MB installers - roughly 10x lighter - while keeping full feature parity and the same Milkdown WYSIWYG editor.

## Tech stack

- **Shell:** Tauri 2 (Rust backend + native webview)
- **Renderer:** TypeScript + Vite, reusing the upstream Milkdown editor
- **Markdown parsing:** pulldown-cmark (Rust)
- **File watching:** notify crate
- **Slides server:** axum (loopback only)

## Development

```bash
npm install
npm run tauri dev
```

## Build (installers)

```bash
npm run tauri build
```

## Project structure

See `AGENTS.md` for the full repository layout, coding conventions, and the core feature spec. See `plan.md` for the phase-by-phase build plan.

## Status

In active development - executing the build plan in `plan.md`.
