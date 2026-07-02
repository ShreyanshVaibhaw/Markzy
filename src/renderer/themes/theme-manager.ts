const themes: Record<string, string> = {
  light: "theme-light",
  dark: "theme-dark",
  elegant: "theme-elegant",
  newsprint: "theme-newsprint",
  cappuccino: "theme-cappuccino",
  nord: "theme-nord",
  "solarized-light": "theme-solarized-light",
  "solarized-dark": "theme-solarized-dark",
  dracula: "theme-dracula",
  "github-dark": "theme-github-dark",
  "tokyo-night": "theme-tokyo-night",
  gruvbox: "theme-gruvbox",
  "catppuccin-mocha": "theme-catppuccin-mocha",
  "one-dark": "theme-one-dark",
};

let customStyleEl: HTMLStyleElement | null = null;

export function applyTheme(name: string, customCSS?: string): void {
  const body = document.body;

  Object.values(themes).forEach((cls) => body.classList.remove(cls));
  body.classList.remove("theme-custom");

  if (customStyleEl) {
    customStyleEl.remove();
    customStyleEl = null;
  }

  if (customCSS || name.startsWith("custom:")) {
    if (customCSS) {
      customStyleEl = document.createElement("style");
      customStyleEl.textContent = customCSS;
      document.head.appendChild(customStyleEl);
    }
    body.classList.add("theme-custom");
  } else if (themes[name]) {
    body.classList.add(themes[name]);
  }

  localStorage.setItem("markzy-theme", name);
}

export function loadSavedTheme(): string {
  return localStorage.getItem("markzy-theme") || "elegant";
}
