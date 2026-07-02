import type { MarkzyAPI } from "./ipc";

export function setupTitlebar(ipc: MarkzyAPI): void {
  const agentDot = document.getElementById("agent-dot");
  ipc.onAgentActivity((state) => {
    if (agentDot) agentDot.className = state === "idle" ? "" : state;
  });
}
