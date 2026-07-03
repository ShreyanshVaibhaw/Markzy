import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

let modalOpen = false;

export async function checkForUpdate(silent: boolean): Promise<void> {
  if (modalOpen) return;
  try {
    const update = await check();
    if (!update) {
      if (!silent) showInfo("Markzy is up to date");
      return;
    }
    showUpdateModal(update);
  } catch (e) {
    console.error("Update check failed:", e);
    if (!silent) showInfo("Couldn't check for updates");
  }
}

function showInfo(message: string): void {
  const toast = document.createElement("div");
  toast.className = "update-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function showUpdateModal(update: Update): void {
  modalOpen = true;

  const overlay = document.createElement("div");
  overlay.className = "update-overlay";
  overlay.innerHTML = `
    <div class="update-modal" role="dialog" aria-modal="true">
      <div class="update-header">
        <div class="update-title-wrap">
          <span class="update-title">Update available</span>
          <span class="update-version">v${update.version}</span>
        </div>
      </div>
      <div class="update-body">
        <p class="update-current"></p>
        <pre class="update-notes"></pre>
      </div>
      <div class="update-progress" hidden>
        <div class="update-progress-bar"><div class="update-progress-fill"></div></div>
        <span class="update-progress-text">Downloading…</span>
      </div>
      <div class="update-actions">
        <button class="update-btn update-btn-secondary" data-action="later">Later</button>
        <button class="update-btn update-btn-primary" data-action="install">Download &amp; Install</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const currentEl = overlay.querySelector(".update-current") as HTMLElement | null;
  if (currentEl) {
    getVersion()
      .then((v) => {
        currentEl.textContent = `You're on v${v}`;
      })
      .catch(() => {
        currentEl.textContent = "";
      });
  }

  const notesEl = overlay.querySelector(".update-notes") as HTMLElement | null;
  if (notesEl) {
    notesEl.textContent = update.body || "(No release notes)";
  }

  const close = (): void => {
    overlay.remove();
    modalOpen = false;
  };

  const laterBtn = overlay.querySelector('[data-action="later"]') as HTMLButtonElement | null;
  const installBtn = overlay.querySelector('[data-action="install"]') as HTMLButtonElement | null;
  const progress = overlay.querySelector(".update-progress") as HTMLElement | null;
  const fill = overlay.querySelector(".update-progress-fill") as HTMLElement | null;
  const progressText = overlay.querySelector(".update-progress-text") as HTMLElement | null;

  laterBtn?.addEventListener("click", close);

  installBtn?.addEventListener("click", async () => {
    if (!installBtn || !laterBtn || !progress || !fill || !progressText) return;
    installBtn.disabled = true;
    laterBtn.disabled = true;
    progress.hidden = false;

    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            progressText.textContent = contentLength
              ? "Downloading… 0%"
              : "Downloading…";
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              progressText.textContent = `Downloading… ${Math.round(
                (downloaded / contentLength) * 100,
              )}%`;
              fill.style.width = `${(downloaded / contentLength) * 100}%`;
            } else {
              progressText.textContent = `Downloading… ${(downloaded / 1048576).toFixed(1)} MB`;
            }
            break;
          case "Finished":
            fill.style.width = "100%";
            progressText.textContent = "Installing…";
            break;
        }
      });
      progressText.textContent = "Relaunching…";
      await relaunch();
    } catch (e) {
      console.error("Update install failed:", e);
      progressText.textContent = "Update failed";
      installBtn.disabled = false;
      laterBtn.disabled = false;
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}
