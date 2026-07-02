import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MarkzyAPI } from "./ipc";

export function setupTitlebar(ipc: MarkzyAPI): void {
  const agentDot = document.getElementById("agent-dot");
  ipc.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === "idle" ? "" : state;
  });

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
