import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { exit } from "@tauri-apps/plugin-process";
import type { MarkzyAPI } from "./ipc";
import { hasDirtyTabs } from "./tabs";

export function setupTitlebar(ipc: MarkzyAPI): void {
  const agentDot = document.getElementById("agent-dot");
  const win = getCurrentWindow();
  win.onCloseRequested(async (event) => {
    event.preventDefault();
    if (hasDirtyTabs()) {
      const ok = await confirm("You have unsaved changes. Close anyway?", {
        title: "Markzy",
        kind: "warning",
      });
      if (!ok) return;
    }
    await exit(0);
  });
  ipc.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === "idle" ? "" : state;
  });

  const titlebar = document.getElementById("titlebar");
  if (titlebar) {
    titlebar.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".menubar-btn") ||
        target.closest(".win-dot") ||
        target.closest("#slides-btn") ||
        target.closest("#agent-dot") ||
        target.closest("#app-logo")
      ) {
        return;
      }
      if (e.detail === 2) return;
      getCurrentWindow().startDragging();
    });

    titlebar.addEventListener("dblclick", (e) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(".menubar-btn") ||
        target.closest(".win-dot") ||
        target.closest("#slides-btn") ||
        target.closest("#agent-dot")
      ) {
        return;
      }
      const win = getCurrentWindow();
      win.isMaximized().then((maximized) => {
        if (maximized) win.unmaximize();
        else win.maximize();
      });
    });
  }

  const winBtnMin = document.querySelector(".win-minimize") as HTMLButtonElement | null;
  const winBtnMax = document.querySelector(".win-maximize") as HTMLButtonElement | null;
  const winBtnClose = document.querySelector(".win-close") as HTMLButtonElement | null;

  if (winBtnMin) {
    winBtnMin.addEventListener("click", () => {
      getCurrentWindow().minimize();
    });
  }

  if (winBtnMax) {
    winBtnMax.addEventListener("click", async () => {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    });
  }

  if (winBtnClose) {
    winBtnClose.addEventListener("click", () => {
      getCurrentWindow().close();
    });
  }
}
