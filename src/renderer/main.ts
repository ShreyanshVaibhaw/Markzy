import { invoke } from "@tauri-apps/api/core";

async function init() {
  const statusEl = document.getElementById("status");
  try {
    const msg = await invoke<string>("greet");
    if (statusEl) statusEl.textContent = msg;
  } catch (e) {
    if (statusEl) statusEl.textContent = `IPC error: ${e}`;
  }
}

window.addEventListener("DOMContentLoaded", init);
