# ColaMD-Tauri Build Plan

> Source project: https://github.com/marswaveai/ColaMD (Electron + Milkdown + TypeScript)
> Target project: ColaMD-Tauri (Tauri 2 + Rust + WebView2 + Milkdown renderer reused)
> Goal: Feature-parity rebuild that is ~10x lighter on memory and fast on Windows, still cross-platform.

This file is a sequence of self-contained prompts. An AI agent should execute them **in order, one at a time**, completing each phase (including verification) before starting the next. Do not skip phases. Do not merge phases. Each phase ends with a "Done when" checklist - every box must be ticked before moving on.

---

## Stack decisions (locked, do not revisit)

- Shell: **Tauri 2.x** with native webviews (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux).
- Backend language: **Rust** (edition 2021).
- Renderer: **TypeScript + Vite**, reusing the original Milkdown WYSIWYG editor, themes CSS, and slides HTML templates from `src/renderer`.
- No Electron, no preload script, no bundled Chromium.
- IPC: `@tauri-apps/api` `invoke()` + `listen()`. No contextBridge.
- Markdown parsing in Rust: `pulldown-cmark`.
- File watching: `notify` crate (debounced).
- Slides local server: `axum` bound to 127.0.0.1.
- PDF export (v1): webview print dialog (WebView2 "Save as PDF"). True headless PDF is out of scope for v1.
- HTML export: Rust string templating + `base64` crate for image inlining.
- Frameless custom titlebar with `data-tauri-drag-region`.

## Global rules for the executing agent

1. Read `AGENTS.md` first and follow it for the whole project.
2. After every phase: run `cargo fmt`, `cargo clippy -- -D warnings`, `npm run lint` (if configured), `npm run build` (renderer), and `cargo build` (src-tauri). Fix everything before marking the phase done.
3. Never commit unless the user explicitly says "commit". Never push.
4. Never add comments to code unless asked.
5. Preserve the original feature behavior exactly. This is a port, not a redesign.
6. Keep the renderer code as close to the upstream `src/renderer` as possible - only swap the IPC layer.
7. If a phase is blocked, stop and report the blocker. Do not guess around it.
8. Use the `check` skill after any non-trivial implementation phase before marking it done.

---

## Phase 0 - Scaffold the Tauri project

### Prompt

You are starting the ColaMD-Tauri rebuild. The working directory is empty.

1. Verify prerequisites: run `cargo --version`, `rustc --version`, `node --version`, `npm --version`. On Windows also confirm WebView2 runtime is present (it ships with Win10/11). Report any missing tooling and stop if Rust or Node is absent.
2. Scaffold a Tauri 2 app in the current directory using `npm create tauri-app@latest` with these answers: project name `colamd-tauri`, identifier `com.marswave.colamd`, frontend `TypeScript + Vite (vanilla)`, package manager `npm`. If the scaffolder creates a subfolder, move its contents up into the working directory root so `package.json` and `src-tauri/` sit at the root.
3. Update `package.json`: set `"name": "colamd-tauri"`, `"version": "1.5.0"`, `"description": "The Agent Native Markdown Editor - Tauri rebuild"`, `"author": "marswave.ai"`, `"license": "MIT"`. Keep the Tauri scripts.
4. In `src-tauri/Cargo.toml` set `name = "colamd_tauri"`, `version = "1.5.0"`, `edition = "2021"`. Add these dependencies (use current 2.x versions, run `cargo add` to pin): `tauri` (with features `["devtools", "macos-private-api"]` for dev only), `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`, `notify = "6"`, `notify-debouncer-mini = "0.4"`, `pulldown-cmark = "0.10"`, `base64 = "0.22"`, `dirs = "5"`, `uuid = { version = "1", features = ["v4"] }`, `tokio = { version = "1", features = ["full"] }`, `axum = "0.7"`, `tower = "0.4"`, `tower-http = { version = "0.5", features = ["fs"] }`, `chrono = "0.4"`. Also add Tauri plugins via `cargo add`: `tauri-plugin-dialog`, `tauri-plugin-fs`, `tauri-plugin-opener` (match the Tauri 2 version family).
5. Configure `src-tauri/tauri.conf.json`:
   - `productName`: `ColaMD`
   - `identifier`: `com.marswave.colamd`
   - `app.windows[0]`: `title` "ColaMD", `width` 960, `height` 640, `minWidth` 480, `minHeight` 360, `resizable` true, `decorations` false (frameless - we ship a custom titlebar), `transparent` false, `center` true.
   - `app.security.csp`: start permissive for dev (`"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"`) and tighten in Phase 6.
   - `bundle.active`: true, `bundle.targets`: `["msi","nsis","dmg","appimage","deb"]`, `bundle.icon`: point at placeholder icons in `src-tauri/icons/` (you can generate defaults with `npm run tauri icon` later).
   - `bundle.appAssociations` (macOS/Linux) and Windows file associations: register `.md` and `.markdown`.
6. Replace the scaffolded `src/` (renderer) with an empty placeholder for now - we port the real renderer in Phase 2. Keep a minimal `index.html` + `main.ts` that just renders "ColaMD scaffold" so the app boots.
7. Write a minimal `src-tauri/src/main.rs` that initializes Tauri with the dialog, fs, and opener plugins, and a single `greet` command returning `"colamd-tauri ready"`. Wire it so the placeholder renderer calls it on load and logs the result.
8. Run `npm install`, then `npm run tauri dev`. Confirm the frameless window opens and the placeholder text renders. Run `cargo fmt` and `cargo clippy -- -D warnings` in `src-tauri/` and fix everything.
9. Create this directory structure (empty files OK, to be filled in later phases):
   ```
   src-tauri/src/{commands.rs, watcher.rs, slides.rs, export.rs, theme.rs}
   src/renderer/{main.ts, editor.ts, ipc.ts, titlebar.ts}
   src/styles/
   src/themes-assets/
   ```
10. Write a top-level `README.md` with: project name, one-line description, "Tauri 2 rebuild of ColaMD", dev/build commands (`npm run tauri dev`, `npm run tauri build`), and a pointer to `AGENTS.md` and `plan.md`.

### Done when

- [ ] `npm run tauri dev` opens a frameless window titled "ColaMD" with the placeholder rendering.
- [ ] `cargo clippy -- -D warnings` is clean in `src-tauri/`.
- [ ] `cargo fmt` is clean.
- [ ] `package.json`, `Cargo.toml`, `tauri.conf.json` match the spec above.
- [ ] The directory structure in step 9 exists.
- [ ] `README.md` exists and points to `AGENTS.md` and `plan.md`.

---

## Phase 1 - Fetch the upstream source as the port reference

### Prompt

You need the original Electron source as a reference for the renderer and behavior. Do **not** copy it into the project tree - it lives in a sibling reference folder.

1. Clone the upstream repo into a sibling directory: from the parent of the working directory, run `git clone https://github.com/marswaveai/ColaMD.git ColaMD-upstream`. If it already exists, `git -C ../ColaMD-upstream pull` instead.
2. Read and summarize, for your own working memory, these upstream files (do not paste them into the project):
   - `src/main/index.ts` and every file under `src/main/` - the Electron main process: window creation, menus, file dialogs, fs.watch logic, the slides local server, PDF/HTML export.
   - `src/preload/index.ts` - the exact IPC API surface the renderer expects (method names, argument shapes, return shapes). This is the contract you must reproduce via Tauri commands.
   - `src/renderer/` - the Milkdown editor setup, theme handling, titlebar/activity-dot logic, slides templates, and how the renderer calls the preload API.
   - `themes/` - the bundled theme CSS files.
   - `electron-builder.yml`, `electron.vite.config.ts` - build config, only for reference.
3. Write `docs/upstream-map.md` inside the working project with: (a) a table mapping each upstream `src/main/*` responsibility to the Rust module that will replace it (`commands.rs`, `watcher.rs`, `slides.rs`, `export.rs`, `theme.rs`); (b) the full preload IPC contract as a TypeScript interface so the Rust commands and the renderer's `ipc.ts` agree exactly; (c) a list of every renderer file and whether it will be reused as-is, reused with edits, or dropped.
4. Do not modify any project source in this phase. This is reconnaissance + contract capture only.

### Done when

- [ ] `../ColaMD-upstream` exists and is on `main`.
- [ ] `docs/upstream-map.md` exists with the responsibility table, the IPC contract, and the renderer reuse list.
- [ ] No project source files were changed in this phase.

---

## Phase 2 - Port the renderer and establish the IPC contract

### Prompt

Now port the Milkdown renderer into the Tauri webview and rewire its IPC from preload to Tauri `invoke`/`listen`. This is the biggest "reuse" phase.

1. From `../ColaMD-upstream/src/renderer/`, copy into `src/renderer/`: the Milkdown editor setup, all editor modules, the titlebar markup and activity-dot logic, and any renderer utilities. Keep the original file names where practical. Do **not** copy the preload API calls verbatim - you will rewire them in step 3.
2. Copy `../ColaMD-upstream/src/renderer/index.html` (or the HTML entry) to `index.html` at the project root (or wherever Vite expects it). Adjust script/style entry paths to match the Vite setup. Strip anything Electron-specific (`<webview>`, Electron preload tags).
3. Create `src/renderer/ipc.ts` that exports an object with the **same method names and signatures** as the upstream preload API (per `docs/upstream-map.md`), but implemented on top of `@tauri-apps/api`:
   - File operations (`openFile`, `saveFile`, `newFile`, ...) -> `invoke('open_file', ...)` etc. Use camelCase in TS, snake_case in Rust.
   - Events the renderer must *listen* to (`file-changed`, `agent-active`, `agent-idle`, `theme-changed`) -> `listen('file-changed', cb)`.
   - Commands the renderer must *call* that have no return value -> still use `invoke`.
   - Keep the API surface identical so the rest of the renderer code does not need to change.
4. Install renderer deps: `npm install @milkdown/kit remark-breaks @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-fs @tauri-apps/plugin-opener`. Match the upstream Milkdown version (`@milkdown/kit@^7.19.2`, `remark-breaks@^4.0.0`).
5. In `src-tauri/src/commands.rs`, stub every Rust command referenced by `ipc.ts` with `todo!()` bodies but correct signatures and `#[tauri::command]` attributes. Register them all in `main.rs`'s `invoke_handler`. The goal: the renderer imports compile and every call resolves to a known (unimplemented) command. The app should boot to the editor UI even though commands panic when called - that is fine for this phase.
6. Configure Vite (`vite.config.ts`) for the Tauri renderer: set `clearScreen: false`, `server.strictPort: true`, `server.port: 1420` (Tauri default), `envPrefix: ['VITE_', 'TAURI_ENV_*']`, and the HMR settings Tauri docs recommend. Ensure the build output goes where `tauri.conf.json` expects (`frontendDist`).
7. Boot the app with `npm run tauri dev`. Confirm: the Milkdown editor renders, you can type, smart line breaks work, the titlebar (with the activity dot) is visible and draggable via `data-tauri-drag-region`. Calling file commands will panic - that is expected and OK for now.
8. Run `npm run build` (renderer) and confirm it succeeds. Run `cargo fmt`, `cargo clippy -- -D warnings` in `src-tauri/`.

### Done when

- [ ] Milkdown WYSIWYG editor renders inside the Tauri webview.
- [ ] Titlebar is visible, frameless, and draggable.
- [ ] Activity dot markup is present in the DOM.
- [ ] `src/renderer/ipc.ts` reproduces the upstream preload API surface on top of Tauri APIs.
- [ ] Every Rust command referenced by `ipc.ts` exists as a `#[tauri::command]` stub in `commands.rs` and is registered in `main.rs`.
- [ ] `npm run build` and `cargo clippy -- -D warnings` are clean.

---

## Phase 3 - Core file commands and live agent sync (the central feature)

### Prompt

Implement the real file read/write and the live agent sync - the headline feature of ColaMD.

1. In `commands.rs`, implement (replace `todo!()`):
   - `open_file() -> Option<{path: String, content: String}>` using `tauri-plugin-dialog` `open()` filtered to `.md`/`.markdown`, then `std::fs::read_to_string`.
   - `save_file(path: Option<String>, content: String) -> String` - if `path` is None, prompt with `save()` dialog (default `.md`), then write. Return the final path.
   - `new_file() -> {path: String, content: String}` - create an untitled buffer (empty content, path `""`); saving triggers `save_file`.
   - `read_file(path: String) -> String`.
   - `write_file(path: String, content: String) -> ()`.
   - `get_default_content() -> String` - the same starter content upstream uses for a new doc.
2. Wire the renderer's File menu / shortcuts to these commands via `ipc.ts`. Verify open/edit/save round-trips end to end.
3. Create `src-tauri/src/watcher.rs`:
   - A `FileWatcher` struct holding a `notify-debouncer-mini` debouncer (debounce ~200ms) and the currently watched path.
   - `start(app: AppHandle, path: String)` - stops any prior watcher, starts a new one on `path` (watch the file itself; if the file is deleted/recreated, re-acquire - this is common when agents rewrite atomically). On each change event, emit `file-changed` with the new content (re-read the file) to the renderer.
   - **Activity state machine** (this is the core differentiator): maintain an `AgentActivity` enum `{Idle, Active, Settled}`. On the first change event after Idle, emit `agent-active` and set a timer. While events keep arriving, keep extending the timer. When no event arrives for ~600ms, emit `agent-idle` (and briefly flash green) and transition back to Idle. The renderer uses these events to pulse the titlebar dot orange while active and flash green when done - exactly matching upstream behavior.
   - Handle the atomic-rewrite case (agents often write via temp+rename): if `notify` reports the path removed then added, re-add the watch and treat it as a change.
   - Expose `watch_file(path: String)` as a `#[tauri::command]` and call it from the renderer whenever a file is opened or saved-to-a-new-path. Also expose `stop_watch()`.
   - Run the watcher on a Tokio runtime; do not block the Tauri command thread.
4. In the renderer, subscribe to `file-changed`, `agent-active`, `agent-idle`:
   - On `file-changed`: replace the Milkdown doc content with the new file content **without stealing focus** (preserve cursor if possible; at minimum, do not scroll-jump). Match upstream's reload behavior.
   - On `agent-active`: add the `active` class to the titlebar dot (orange breathing pulse via CSS).
   - On `agent-idle`: briefly add the `done` class (green flash), then remove.
5. Test the core feature manually: open a `.md` file in the running app, then in another terminal append to that file with `echo "edit" >> file.md` repeatedly. Confirm the dot pulses orange while you write and flashes green ~600ms after you stop, and the editor content updates each time without a reload.
6. Run `cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`. Fix everything.

### Done when

- [ ] Open / edit / save / new round-trip works end to end.
- [ ] Editing the open file externally updates the editor content live, no manual refresh.
- [ ] The titlebar dot pulses orange while external writes are happening and flashes green ~600ms after they stop.
- [ ] Atomic rewrites (temp+rename) do not break the watcher.
- [ ] `cargo clippy -- -D warnings` and `npm run build` are clean.

---

## Phase 4 - Menus, themes, links, drag & drop, file associations

### Prompt

Implement the supporting UX features.

1. **Application menu** using `tauri::menu` (Tauri 2 menu API). Reproduce the upstream menu structure exactly: File (New, New Slides, Open, Open as Slides, Save, Save As..., Export..., Export Slides..., Close Window, Quit), Edit (Undo/Redo/Cut/Copy/Paste/Select All - wired to native webview editing where possible), Theme (list of built-in themes + Import Theme...), and an About item. Menu items that are not yet implemented (Slides, Export) can be disabled in this phase and enabled in Phases 5-6. Wire enabled items to the renderer via custom events or direct command calls.
2. **Themes**: move `../ColaMD-upstream/themes/*.css` into `src/themes-assets/`. Implement `theme.rs`:
   - `list_builtin_themes() -> Vec<{id: String, name: String, css: String}>` (embed CSS with `include_str!`).
   - `list_user_themes() -> Vec<...>` reading `~/.colamd/themes/` (use `dirs::config_dir` joined with `colamd/themes`).
   - `import_theme(source_path: String) -> ()` - copy the chosen CSS into `~/.colamd/themes/`.
   - `load_theme(id: String) -> String` - return the CSS for injection.
   - `set_theme(id: String) -> ()` - persist the active theme id (write to `~/.colamd/settings.json`) and emit `theme-changed`.
   Expose all as commands; renderer applies the CSS by injecting a `<style id="theme">` and swapping it on `theme-changed`.
3. **Cmd/Ctrl+Click links**: in the renderer, listen for click events on `<a>` inside the editor; when the modifier is held, call `ipc.openExternal(url)` which invokes `tauri-plugin-opener` `open_url`. Match upstream's exact modifier (Cmd on mac, Ctrl on Windows/Linux).
4. **Rich text copy**: ensure the webview's native copy preserves formatting (Milkdown/ProseMirror already produces rich HTML on copy). Verify by copying from the editor and pasting into a rich target (e.g. Word/Gmail web). No Rust work expected; if formatting is stripped, investigate WebView2 clipboard settings.
5. **Drag & drop files**: use Tauri's `onFileDropEvent` (or the `tauri-plugin-fs` drag-drop API for Tauri 2) to accept a dropped `.md` file - open it via the same path as `open_file`. Reject non-`.md` drops silently.
6. **File associations**: confirm `tauri.conf.json` registers `.md`/`.markdown` (set in Phase 0). Implement a `tauri::UriSchemeContext`/single-instance handler so that double-clicking a `.md` file in Explorer opens it in the running (or a new) ColaMD window. Test on Windows.
7. Run the full verification suite (`cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`). Manually smoke-test each feature above.

### Done when

- [ ] Application menu matches upstream structure; implemented items work, unimplemented items are disabled.
- [ ] All built-in themes load and switch; custom themes import and persist in `~/.colamd/themes/`.
- [ ] Cmd/Ctrl+click on an editor link opens it in the default browser.
- [ ] Rich text copy preserves formatting when pasted into a rich target.
- [ ] Dragging a `.md` file onto the window opens it.
- [ ] Double-clicking a `.md` file in Explorer opens it in ColaMD.
- [ ] `cargo clippy -- -D warnings` and `npm run build` are clean.

---

## Phase 5 - Slides: Markdown as Database

### Prompt

Implement the "Slides" feature - parsing a Markdown file into slide layouts and serving it as a slide deck in the browser.

1. Create `src-tauri/src/slides.rs` with a `parse_slides(markdown: &str) -> Vec<Slide>` function using `pulldown-cmark`:
   - Split the document on `---` horizontal rules (top-level only).
   - Read YAML frontmatter (`kicker`, `chip`, `page`).
   - Read `<!-- type: cover|statement|section|video|thankyou -->` layout comments per slide (default to `section`).
   - Read optional directives: `bg:`, `src:` (video), `preview:`.
   - For each slide, capture heading, body markdown, and the layout type.
   - Define a `Slide` struct that mirrors exactly what the upstream HTML templates consume.
2. Reuse the upstream slides HTML template(s) from `../ColaMD-upstream` (find them under `src/main/` or `src/renderer/` - wherever the slides HTML/CSS/JS lives). Copy the template assets into `src/themes-assets/slides/`. The template is the **view layer**; your Rust parser feeds it the parsed `Slide` data. Do not redesign the template.
3. Implement the **local slides server** with `axum`:
   - `start_slides_server(markdown: String, assets_dir: String) -> String` - binds `127.0.0.1` to an OS-assigned free port, renders the parsed slides into the HTML template, serves the result at `/` and the template assets (CSS/JS/images) at their paths. Returns the URL `http://127.0.0.1:{port}`.
   - Run the server on a Tokio task; keep a handle so it can be shut down when the app quits.
   - Guard the bind to loopback only - never expose externally.
4. Wire the two menu commands:
   - **File -> New Slides** (`Cmd/Ctrl+Shift+N`): create a `slides.md` from the upstream tutorial template content (embed it via `include_str!` from `src/themes-assets/slides/template.md`) and open it in the editor.
   - **File -> Open as Slides** (`Cmd/Ctrl+Shift+P`): if no file is open, create one first; then call `start_slides_server` with the current doc content and open the returned URL in the default browser via `tauri-plugin-opener`.
5. Enable the Slides menu items (they were disabled in Phase 4).
6. Test: create a `slides.md` with the upstream sample format, run Open as Slides, confirm a browser tab opens showing the deck with correct cover/statement/section/thankyou layouts. Test the `video` layout with a sample `src:` path.
7. Run the full verification suite.

### Done when

- [ ] `parse_slides` correctly handles frontmatter, all five layout types, and the `bg`/`src`/`preview` directives.
- [ ] "New Slides" creates and opens the tutorial template.
- [ ] "Open as Slides" starts a loopback server and opens the deck in the default browser.
- [ ] The rendered deck visually matches the upstream slides output for each layout type.
- [ ] The server binds only to 127.0.0.1 and shuts down on app quit.
- [ ] `cargo clippy -- -D warnings` and `npm run build` are clean.

---

## Phase 6 - Export (HTML single-file + PDF) and Slides export

### Prompt

Implement export. Match upstream's two export modes exactly.

1. **Document HTML export** (File -> Export... -> HTML): in `export.rs`, implement `export_html(path: String, out_path: String) -> ()`:
   - Read the `.md`, convert to HTML with `pulldown-cmark` applying the same smart-line-break behavior upstream uses (single newlines become `<br>` - replicate `remark-breaks` semantics in the Rust renderer, or document any divergence explicitly).
   - Wrap in a standalone HTML document with the currently active theme CSS inlined.
   - Inline local images as `data:` base64 URIs using the `base64` crate (resolve relative to the source file's directory). Remote image URLs are left as-is.
   - Write to `out_path` (from a save dialog).
2. **Document PDF export** (File -> Export... -> PDF): implement `export_pdf(window: WebviewWindow, out_path: String) -> ()` using the Tauri 2 print API. Strategy: load the same standalone HTML (from step 1, minus image inlining is fine) into a hidden offscreen `WebviewWindow`, call `print()`, and rely on the user picking "Save as PDF" in the WebView2 print dialog. This is the v1 approach agreed in the plan. Document clearly in `docs/export.md` that one-click headless PDF is a future enhancement.
3. **Slides export** (File -> Export Slides...): implement `export_slides(markdown: String, out_dir: String) -> ()`:
   - **Without video**: produce a single `index.html` with all assets (CSS/JS) and images inlined as base64. The user's friend can double-click it.
   - **With video**: produce a folder containing `index.html` plus the video files copied in, with `src:` paths rewritten to be relative. Detect "with video" by scanning parsed slides for any `video` layout with a `src:`.
   - Choose the mode automatically based on content; the save dialog picks the destination (file for no-video, directory for video).
4. Enable the Export menu items (disabled since Phase 4).
5. Tighten `tauri.conf.json` CSP now that all features are known: remove `'unsafe-inline'` from `script-src` if Vite output allows (it should, since Tauri hashes injected scripts); keep `'unsafe-inline'` on `style-src` only if themes require it. Re-test all features after the CSP change - this is a common break point.
6. Test each export path with a sample doc and a sample slides file (with and without a video). Open the exported HTML in a clean browser to verify it is self-contained.
7. Run the full verification suite.

### Done when

- [ ] Document HTML export is a self-contained file with inlined images and active theme.
- [ ] Document PDF export produces a PDF via the print dialog.
- [ ] Slides export without video is a single double-clickable `index.html`.
- [ ] Slides export with video is a folder with `index.html` + videos, paths relative.
- [ ] CSP is tightened and all features still work.
- [ ] `cargo clippy -- -D warnings` and `npm run build` are clean.

---

## Phase 7 - Cross-platform verification, packaging, and polish

### Prompt

Final phase. Verify cross-platform parity and produce installers.

1. **macOS verification** (if you have access; if not, document it as "untested in CI, requires Mac runner" and at minimum run `cargo check --target aarch64-apple-darwin` and `x86_64-apple-darwin`):
   - Run `npm run tauri dev` on macOS. Confirm WKWebView renders Milkdown correctly, frameless titlebar works with `macos-private-api`, menus appear in the system menu bar, Cmd+click opens links, `~/.colamd/themes/` resolves to the right place.
   - Fix any platform-specific issues (e.g. `data-tauri-drag-region` behavior, traffic-light positioning if you add native controls later).
2. **Linux verification** (same caveat - at minimum `cargo check --target x86_64-unknown-linux-gnu`):
   - Confirm WebKitGTK renders Milkdown, frameless window works, `~/.colamd/themes/` resolves via XDG dirs.
3. **Windows verification** (primary target - do this thoroughly):
   - Confirm WebView2 path, frameless window, file associations, drag-drop, live agent sync on a real atomic rewrite (have a script do `tmp && Move-Item tmp file.md -Force`), print-to-PDF, slides server, export. Fix any rough edges.
4. **Packaging**: run `npm run tauri build` on Windows and confirm it produces `msi` and `nsis` installers in `src-tauri/target/release/bundle/`. Check the installer size is in the expected ~5-15MB range (vs Electron's ~150MB). If icons are still placeholders, generate real ones from a source PNG with `npm run tauri icon path/to/icon.png` before building.
5. **Polish pass**: walk the running app against the upstream feature list in `AGENTS.md` and tick each feature. File any divergence as a follow-up TODO in `docs/parity-gaps.md`. Pay attention to: the exact orange/green dot animation timing, smart line break rendering, theme default, and the slides template visuals.
6. Update `README.md` with final build/run instructions, the bundle size achieved, and a "Differences from upstream Electron build" section (memory footprint, installer size, PDF export via print dialog).
7. Final verification: `cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`, `npm run tauri build` all succeed.

### Done when

- [ ] App runs and passes the feature checklist on Windows.
- [ ] macOS and Linux at least `cargo check` clean; ideally dev-run verified.
- [ ] `npm run tauri build` produces MSI + NSIS installers on Windows.
- [ ] Installer size is recorded in `README.md` and is dramatically smaller than Electron.
- [ ] `docs/parity-gaps.md` lists any remaining behavioral differences.
- [ ] `README.md` final section is written.
- [ ] `cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`, `npm run tauri build` all green.
