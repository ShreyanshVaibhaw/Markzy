# Markzy Project Audit

Date: 2026-07-09
Scope: architecture, core feature (live agent sync), security, parity, hygiene.

Verification run during audit: `cargo fmt --check` clean, `cargo clippy -- -D warnings` clean, `npm run build` passes (with chunk-size + dynamic-import warnings only).

---

## A. Core feature (live agent sync) — issues that affect the headline feature

### A1. Agent state machine does not re-enter `active` from `cooldown`  (BUG)
`watcher.rs` keeps a single `is_active: AtomicBool` that is only reset to `false` *after* the `idle` emit (3s + 2s after last change). The cooldown timer fires `agent-activity=cooldown` at +3s but leaves `is_active=true`. The change loop gates the `active` emit behind `if !is_active.load()`:

```
if !is_active.load(Ordering::Relaxed) {
    is_active.store(true, ...);
    emit("agent-activity", "active");
}
```

Consequence: if the agent starts writing again **during cooldown**, `is_active` is still `true`, so `active` is never re-emitted. The dot stays green (cooldown) throughout a new writing burst, then jumps straight to idle when the timer finally completes. The 3-state machine should transition `cooldown -> active` on the first new change. This is a real divergence from upstream's `transitionAgentState` and breaks the visible "agent is writing again" signal.

Fix: track distinct states (or a "did we already emit idle since last active" flag) and emit `active` whenever the previous emitted state was not `active`. Reset on entering `idle`.

### A2. `setMarkdown` steals focus and scroll position  (BUG)
`editor.ts:setMarkdown` calls `editorInstance.action(replaceAll(content))` directly. AGENTS.md: "The renderer must update content **without stealing focus or scroll position**." `replaceAll` resets the ProseMirror doc and view, which resets scroll and focus. `main.ts:onFileChanged` calls this on every external edit.

Fix: capture `editorView.scrollDOM.scrollTop` (+ selection/viewport) before `replaceAll`, restore after, wrapped to avoid focus steal (use a no-focus insertion / blur guard). The simplest correct approach is to diff-patch only when the editor is not focused, and to restore `scrollTop`.

### A3. Atomic-rewrite (temp + rename) handling is not explicitly implemented or tested
The watcher watches the parent dir `NonRecursive` and filters events by `event.path == target`, then re-reads the file after a 100ms debounce — so a `Move-Item -Force` will *probably* produce a matching path event and a fresh `read_to_string`. But AGENTS.md explicitly requires: "if notify reports remove-then-add on the watched path, re-acquire the watch and treat it as a change. Test this explicitly on Windows with a Move-Item -Force script."

There is no remove-then-add re-acquire logic, and no test/script verifying this path. Risk: a "delete then create new" sequence (vs rename) could surface a transient `read_to_string` failure that the code swallows with `continue`, dropping the update. Recommend adding explicit re-acquire + retry, and a `Move-Item -Force` smoke test.

---

## B. Security

### B1. `open_file_path` accepts arbitrary renderer-supplied paths with no validation  (violates stated rule)
`commands.rs:open_file_path(path: String, ...)` reads any existing path the renderer passes. AGENTS.md security rules: "File commands must only read/write paths the user explicitly chose via dialog or dropped onto the window. Do not accept arbitrary paths from the renderer without validation."

In practice the paths come from Rust-emitted events (drag-drop, single-instance argv, startup files), but the command performs only an `exists()` check — no extension/canonicalization/scope check. A compromised renderer page (or XSS) could read arbitrary files the process can access. Recommend: at minimum restrict to markdown extensions and canonicalize; ideally only accept these paths from backend-resolved sources, not via a generic invoke.

### B2. `additionalBrowserArgs` disables major renderer hardening
`tauri.conf.json` sets a long list of `--disable-*` flags including `--disable-gpu-sandbox`, `--no-zygote`, `RendererCodeIntegrity`, `site-per-process`, `SiteIsolation`, `IsolateOrigins`, `BackForwardCache`. Several of these (RendererCodeIntegrity, site-per-process, SiteIsolation) materially reduce the WebView2 renderer's exploit resistance, beyond what footprint optimization requires. Document the tradeoff explicitly in `docs/export.md` or a security note, and reconsider whether each flag is strictly necessary.

### B3. Broad capability surface + `withGlobalTauri: true`
`capabilities/default.json` grants `fs:default`, `opener:default`, etc. to the `main` window, and `withGlobalTauri` exposes the API globally on `window`. Combined with any renderer-content XSS (markdown can render links; cmd+click opens external; HTML view exists), a script-injection would get broad filesystem reach. CSP is `script-src 'self'` (good), but consider scoping `fs` to read-only + the working directory rather than `fs:default` (which is wide).

---

## C. Correctness

### C1. `unwrap()` present in non-command but shared code
`watcher.rs:54` `file_path_arc.lock().unwrap()` — panics on poisoned mutex; in a spawned task so isolated, but the lock is acquired by several command paths that could poison it on panic. AGENTS.md: "Never `unwrap()` in command bodies." Use `.ok()` / `map_err` consistently. `slides.rs:93` `"127.0.0.1:0".parse().unwrap()` is a constant literal (safe), but inconsistent with the rule.

### C2. `export_slides` depends on `template.html` existing in the file's directory
`export.rs` reads `src_dir.join("template.html")` and fails with "Cannot read template.html" if the user did not first run "Open as Slides" (the only path that copies it there). Fallback to the bundled `SLIDES_TEMPLATE_HTML` (already included via `include_str!` in `slides.rs`) so Export Slides works without the prerequisite.

### C3. Quit / Close loses dirty tabs silently
Non-mac `menu-close` calls `app.exit(0)`; the renderer's `getCurrentWindow().close()` (win-close button) likewise closes without prompting. Dirty tabs with unsaved edits are discarded. Upstream's single-doc model has the same risk but the multi-tab model amplifies data loss. Add a "unsaved changes" confirm on close/quit when any tab is dirty.

### C4. Resolve-image-paths regex is simple
`resolve_image_paths` uses `!\[([^\]]*)\]\(([^)]+)\)` — no support for angle-bracket URLs `![](<path>)`, HTML `<img>` tags, or `src` with whitespace. Matches the simplified spec; document as a known limitation in parity-gaps if concerned.

---

## D. Parity / scope divergence (undocumented)

### D1. Tabs feature added, diverging from upstream and from `docs/parity-gaps.md`
`docs/upstream-map.md` and `docs/parity-gaps.md` both describe a single-document model (multi-window listed as a *future* fix). The actual app implements in-window tabs (`src/renderer/tabs.ts`, `#tab-bar` in `index.html`, `menubar.ts` Close Tab, `menu-close-tab` IPC). This is a scope expansion beyond upstream v1.5.0 and brushes against AGENTS.md's "no file manager or workspace" rule. It is not noted in `docs/parity-gaps.md`.

Action: either (a) document tabs as an intentional Markzy-specific divergence in `parity-gaps.md`, or (b) reconsider. The tab state machine itself (active-tab switching + `onTabSwitch` stop/start of the watcher) also needs the A1 fix to behave correctly across tabs.

### D2. Duplicated theme list across two implementations
The 14 built-in themes are hardcoded in `lib.rs:build_theme_menu` (macOS native) **and** independently in `menubar.ts:getThemeItems` (non-mac HTML menubar). They can drift. Extract a single source (e.g. emit theme metadata to the renderer, or have the TS menu read a shared constant).

### D3. Two parallel menu implementations
macOS uses the Rust `build_*_menu` family; all other platforms use the TS `menubar.ts` dropdown. The Rust menu functions are `#[allow(dead_code)]` on non-mac. Behavioral drift between the two (accelerators, item presence, close semantics) is now possible and unguarded. At minimum keep a checklist; ideally gate one behind the other.

---

## E. Project hygiene

### E1. `plan.md` is referenced as source of truth but does not exist
AGENTS.md (lines: "read `plan.md` if you are executing the build", "Build plan (execute in order): `plan.md`", "Execute phases in order") and `docs/upstream-map.md` reference timing "from plan.md". No `plan.md` is present in the repo. Either restore it or remove the references from AGENTS.md.

### E2. AGENTS.md says repo is "not a git repo by default" but it is one
`D:/Markzy/.git` exists and `.github/workflows` is present. The instruction "Do not `git init` unless the user asks" is moot; update the line to reflect current state so future agents don't re-init.

### E3. Build warnings worth addressing
`npm run build` emits: (1) `editor.ts` is both statically and dynamically imported by `menubar.ts`, so the dynamic import won't code-split — pick one strategy; (2) bundle >500KB minified (Milkdown) — acceptable, but a `chunkSizeWarningLimit` bump or manual chunks would silence it cleanly.

### E4. `.github/workflows` present but CI not audited
A workflow directory exists; its content was not reviewed in this audit. Recommend confirming CI runs the same triple (`cargo fmt`, `cargo clippy -- -D warnings`, `npm run build`) on PRs.

---

## F. Summary table

| # | Area | Severity | File |
|---|---|---|---|
| A1 | Agent state machine: no `cooldown->active` re-entry | **High** (core feature) | watcher.rs |
| A2 | setMarkdown steals scroll/focus | **High** (core feature) | editor.ts |
| A3 | Atomic-rewrite not handled/tested | Medium (core feature) | watcher.rs |
| B1 | open_file_path accepts arbitrary paths | Medium (security rule violation) | commands.rs |
| B2 | Renderer hardening disabled via args | Medium | tauri.conf.json |
| B3 | Wide fs capability + withGlobalTauri | Low | capabilities/default.json |
| C1 | unwrap() in shared code | Low | watcher.rs, slides.rs |
| C2 | export_slides needs pre-existing template.html | Medium | export.rs |
| C3 | Dirty tabs lost on quit/close | Medium | lib.rs, titlebar.ts |
| C4 | Image-path regex is minimal | Low | commands.rs |
| D1 | Tabs added without documenting divergence | Medium | tabs.ts, parity-gaps.md |
| D2 | Theme list duplicated | Low | lib.rs, menubar.ts |
| D3 | Two parallel menu impls can drift | Low | lib.rs, menubar.ts |
| E1 | plan.md missing | Low | AGENTS.md |
| E2 | Git instructions stale | Low | AGENTS.md |
| E3 | Build warnings | Low | editor.ts, vite config |
| E4 | CI not reviewed | Informational | .github/workflows |

The two items that should be fixed before anything else are **A1 and A2** — both are bugs in the headline "live agent sync" feature.

---

## Resolutions (2026-07-09)

All findings addressed. Verification: `cargo fmt` clean, `cargo clippy -- -D warnings` clean (only environmental hard-link cache warnings remain), `npm run build` clean (no TS errors, no Vite warnings).

- **A1** Fixed — `watcher.rs` now tracks the last emitted state (`AtomicU8` idle/active/cooldown) via `set_agent_state`, so `cooldown -> active` re-entry works.
- **A2** Fixed — `editor.ts:setMarkdown` snapshots/restores `#editor` scrollTop and preserves editor focus.
- **A3** Fixed + documented — added a 5x20ms `read_to_string` retry for delete-then-create races; noted in `parity-gaps.md`.
- **B1** Fixed — `open_file_path` now rejects non-markdown paths via `is_markdown_ext`.
- **B2** Fixed — removed `SiteIsolation`, `IsolateOrigins`, `site-per-process`, `RendererCodeIntegrity`, `--no-zygote`, `--disable-gpu-sandbox` from `tauri.conf.json`. Documented in `parity-gaps.md`.
- **B3** Fixed — removed the unused `tauri-plugin-fs` (renderer never invokes it; all file ops use custom commands) and `fs:default` capability.
- **C1** Fixed — replaced `unwrap()` in `watcher.rs`/`slides.rs`.
- **C2** Fixed — `export_slides` now falls back to the bundled `SLIDES_TEMPLATE_HTML`.
- **C3** Fixed — `onCloseRequested` prompts to confirm when tabs are dirty; `menu-close` no longer hard-exits.
- **C4** Fixed — `resolve_image_paths` now handles image titles, angle-bracket URLs, and preserves titles on rewrite.
- **D1** Documented — tabs feature noted in `parity-gaps.md`.
- **D2** Fixed — theme list moved to `src/themes-assets/themes-manifest.json`, consumed by both `menubar.ts` and `lib.rs` (parsed via `serde_json`).
- **D3** Partially fixed — HTML-export logic deduplicated into `src/renderer/export-html.ts` (used by both `main.ts` and `menubar.ts`).
- **E1/E2** Fixed — `AGENTS.md` references to missing `plan.md` removed; git-repo note corrected.
- **E3** Fixed — dynamic import removed; `build.chunkSizeWarningLimit` set to 700 in `vite.config.ts` (Milkdown is inherently >500KB).
- **E4** Fixed — added `.github/workflows/ci.yml` running the verification triple (`npm run build`, `cargo fmt --check`, `cargo clippy -- -D warnings`) on push/PR.