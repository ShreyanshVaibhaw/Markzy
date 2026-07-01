import type { ColaMDAPI } from "./ipc";

export function setupTitlebar(ipc: ColaMDAPI): void {
  const agentDot = document.getElementById("agent-dot");
  ipc.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === "idle" ? "" : state;
  });
}
