# AGENTS.md - Instructions for AI agents working on ColaMD-Tauri

> If you are an AI agent (Claude Code, Cursor, Copilot, Codex, etc.) touching this repository, read this file **first**, every session, before making any change. Then read `plan.md` if you are executing the build.

## What this project is

ColaMD-Tauri is a rebuild of [ColaMD](https://github.com/marswaveai/ColaMD) - "The Agent Native Markdown Editor" - ported from Electron to **Tauri 2 (Rust) + WebView2/WKWebView/WebKitGTK**. The original app's headline feature is **live agent sync**: when an AI agent edits a `.md` file on disk, the editor updates in real time and a titlebar dot pulses orange while the agent writes and flashes green when it settles.

This is a **port**, not a redesign. Feature parity with upstream v1.5.0 is the goal. The win is footprint: ~10-30MB RAM and ~5-15MB installers instead of Electron's ~200MB+ / ~150MB.

## Stack (do not change without user approval)

- **Shell:** Tauri 2.x, frameless window, custom HTML titlebar with `data-tauri-drag-region`.
- **Backend:** Rust, edition 2021. Modules: `main.rs`, `commands.rs`, `watcher.rs`, `slides.rs`, `export.rs`, `theme.rs`.
- **Renderer:** TypeScript + Vite, reusing the upstream Milkdown WYSIWYG editor (`@milkdown/kit`), `remark-breaks`, themes CSS, and slides HTML templates.
- **IPC:** `@tauri-apps/api` `invoke()` + `listen()`. There is **no preload script** (that was Electron-specific).
- **Markdown parsing (Rust):** `pulldown-cmark`.
- **File watching:** `notify` + `notify-debouncer-mini`, ~200ms debounce.
- **Slides server:** `axum` on `127.0.0.1` (loopback only, never external).
- **PDF export (v1):** webview print dialog (Save as PDF). Headless PDF is a documented future enhancement, not a current goal.

## Repository layout

```
colamd-tauri/
  src-tauri/                  Rust backend
    src/
      main.rs                 Tauri init, plugin registration, invoke_handler
      commands.rs             file open/save/new/read/write + IPC commands
      watcher.rs              notify watcher + agent activity state machine (CORE FEATURE)
      slides.rs               pulldown-cmark slide parser + axum slides server
      export.rs               HTML / PDF / slides export
      theme.rs                built-in + user themes, persistence
    Cargo.toml
    tauri.conf.json
    icons/
  src/                        Renderer (runs in the webview)
    renderer/
      main.ts                 app entry
      editor.ts               Milkdown setup
      ipc.ts                  Tauri-backed reimplementation of upstream preload API
      titlebar.ts             activity dot logic
    styles/
    themes-assets/            built-in theme CSS + slides templates + tutorial markdown
  index.html                  Vite entry
  vite.config.ts
  package.json
  tsconfig.json
  docs/
    upstream-map.md           responsibility map + IPC contract (written in Phase 1)
    export.md                 export approach + future enhancements
    parity-gaps.md            any remaining behavioral differences vs upstream
  plan.md                     phase-by-phase build plan (the source of truth for execution)
  AGENTS.md                   this file
  README.md
../ColaMD-upstream/           reference clone of the original Electron app (sibling dir, NOT part of this repo)
```

## The upstream reference

The original Electron source is cloned at `../ColaMD-upstream` (sibling directory, outside this repo). Use it as the **behavioral and visual reference**. Do not copy it into the project tree. When a behavior is ambiguous, match upstream. The map from upstream responsibilities to Rust modules is in `docs/upstream-map.md`.

## Commands to run

Run these from the project root.

| Task | Command |
|---|---|
| Dev (opens the app) | `npm run tauri dev` |
| Build renderer only | `npm run build` |
| Build Rust only (debug) | `cargo build` (run inside `src-tauri/`, or `cargo build --manifest-path src-tauri/Cargo.toml`) |
| Typecheck renderer | `npm run build` (Vite fails on TS errors) or `tsc --noEmit` if configured |
| Lint Rust | `cargo fmt` then `cargo clippy -- -D warnings` (in `src-tauri/`) |
| Format Rust | `cargo fmt` |
| Production bundle (installers) | `npm run tauri build` |
| Generate app icons | `npm run tauri icon <path-to-png>` |

**After any implementation change, always run and fix until clean:** `cargo fmt`, `cargo clippy -- -D warnings` (in `src-tauri/`), and `npm run build`. Do not mark work done with failing lint/typecheck/build.

## Coding conventions

- **Rust:** edition 2021, `clippy` clean with `-D warnings`, `cargo fmt` clean. Prefer the Tauri 2 plugin ecosystem over hand-rolling. Snake_case for commands; the renderer's `ipc.ts` maps camelCase -> snake_case. Never `unwrap()` in command bodies - return `Result<T, String>` and surface errors to the renderer.
- **TypeScript:** strict mode. Reuse the upstream renderer's style and structure; only the IPC layer (`ipc.ts`) is new. Do not introduce frameworks the upstream app does not use.
- **No comments in code** unless explicitly requested by the user.
- **No emojis** in code or commits unless the user asks.
- Keep the renderer's `ipc.ts` API surface **identical** to the upstream preload API (names + signatures) so the rest of the renderer stays unchanged. Any deviation must be documented in `docs/upstream-map.md`.

## The core feature - get this right

Live agent sync (`watcher.rs`) is the reason this app exists. Requirements:

- Detect external edits to the open file via `notify` (ReadDirectoryChangesW on Windows).
- Debounce ~200ms; emit a `file-changed` event to the renderer with the freshly-read content on each settled change.
- Maintain an activity state machine: `Idle` -> `Active` on first change -> `Settled` (~600ms after the last change) -> `Idle`. Emit `agent-active` on entering Active and `agent-idle` on entering Settled.
- The renderer pulses the titlebar dot orange while Active and flashes green on Settled - match upstream's exact animation timing.
- Survive **atomic rewrites** (agents that write via temp file + rename): if `notify` reports remove-then-add on the watched path, re-acquire the watch and treat it as a change. Test this explicitly on Windows with a `Move-Item -Force` script.
- The renderer must update content **without stealing focus or scroll position**.

## What this app does NOT do (do not add these)

Per upstream's explicit scope:
- No file manager or workspace.
- No cloud sync or real-time multi-user collaboration.
- No built-in AI features - it is a viewer/editor for AI-generated content.
- No plugin system.
- One thing, done well.

Do not "improve" the app by adding these. If asked, push back and reference this section.

## Security rules

- The slides server binds to **127.0.0.1 only**. Never `0.0.0.0`.
- Never log or persist secrets. This app has no auth, but if any credential ever appears, do not write it to disk or logs.
- Keep `tauri.conf.json` CSP as tight as the features allow. Phase 6 tightens it; re-test everything after any CSP change.
- File commands must only read/write paths the user explicitly chose via dialog or dropped onto the window. Do not accept arbitrary paths from the renderer without validation.

## Git and commits

- The repo is **not** a git repo by default. Do not `git init` unless the user asks.
- Never commit unless the user explicitly says "commit". Never push unless explicitly asked.
- Never add your agent name as a co-author in commit messages.
- Never manually edit `CHANGELOG.md` or any file marked auto-generated.
- When you do commit, write a concise message matching repo style, stage only intended files, and never stage secrets.

## Workflow when executing `plan.md`

1. Read `plan.md` fully before starting.
2. Execute phases **in order**, one at a time. Do not skip or merge phases.
3. Each phase has a "Done when" checklist. Every box must be ticked before moving to the next phase.
4. After each implementation phase, run the verification suite (`cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`) and fix everything before marking done.
5. Use the `check` skill after any non-trivial implementation phase.
6. If a phase is blocked, stop and report. Do not guess around blockers.
7. If you discover a divergence from upstream mid-build, record it in `docs/parity-gaps.md` rather than silently deviating.

## Known parity gaps (v1, intentional)

- **PDF export** uses the OS print dialog ("Save as PDF") rather than silent headless `printToPDF`. Documented in `docs/export.md`. True one-click PDF is a future enhancement.
- Any other gaps discovered during the build go in `docs/parity-gaps.md`.

## Pointers

- Tauri 2 docs: https://tauri.app/
- Upstream ColaMD: https://github.com/marswaveai/ColaMD
- Milkdown: https://milkdown.dev/
- Build plan (execute in order): `plan.md`
- Upstream responsibility map + IPC contract: `docs/upstream-map.md`
