export interface Tab {
  id: string;
  filePath: string | null;
  title: string;
  content: string;
  isSlides: boolean;
  dirty: boolean;
}

let tabs: Tab[] = [];
let activeTabId: string = "";
let tabCounter = 0;

const TAB_BAR_ID = "tab-bar";

function generateTabId(): string {
  tabCounter += 1;
  return "tab-" + tabCounter;
}

function renderTabBar(): void {
  const bar = document.getElementById(TAB_BAR_ID);
  if (!bar) return;
  bar.innerHTML = "";

  tabs.forEach((tab) => {
    const el = document.createElement("span");
    el.className = "tab" + (tab.id === activeTabId ? " active" : "") + (tab.dirty ? " dirty" : "");
    el.textContent = tab.title;

    const closeBtn = document.createElement("span");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    el.appendChild(closeBtn);
    el.addEventListener("click", () => switchToTab(tab.id));
    bar.appendChild(el);
  });
}

export function createTab(filePath?: string | null, content?: string, isSlides?: boolean): Tab {
  const tab: Tab = {
    id: generateTabId(),
    filePath: filePath ?? null,
    title: filePath ? filePath.split(/[/\\]/).pop() || "Untitled" : "Untitled",
    content: content ?? "",
    isSlides: isSlides ?? false,
    dirty: false,
  };
  tabs.push(tab);
  activeTabId = tab.id;
  renderTabBar();
  return tab;
}

export function closeTab(tabId: string): void {
  if (tabs.length <= 1) {
    tabs[0].content = "";
    tabs[0].filePath = null;
    tabs[0].title = "Untitled";
    tabs[0].dirty = false;
    tabs[0].isSlides = false;
    activeTabId = tabs[0].id;
    renderTabBar();
    return;
  }

  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  tabs.splice(idx, 1);

  if (activeTabId === tabId) {
    const newIdx = Math.min(idx, tabs.length - 1);
    activeTabId = tabs[newIdx].id;
  }

  renderTabBar();
}

export function switchToTab(tabId: string): [Tab | null, Tab] {
  const prevTab = getActiveTab();
  if (prevTab && prevTab.id === tabId) return [null, prevTab];

  const nextTab = tabs.find((t) => t.id === tabId);
  if (!nextTab) return [prevTab, prevTab ?? tabs[0]];

  activeTabId = tabId;
  renderTabBar();
  return [prevTab, nextTab];
}

export function getActiveTab(): Tab | null {
  return tabs.find((t) => t.id === activeTabId) ?? null;
}

export function updateActiveTabContent(content: string): void {
  const tab = getActiveTab();
  if (tab) {
    tab.content = content;
    tab.dirty = true;
  }
}

export function updateActiveTabFilePath(path: string): void {
  const tab = getActiveTab();
  if (tab) {
    tab.filePath = path;
    tab.title = path.split(/[/\\]/).pop() || "Untitled";
    tab.dirty = false;
    renderTabBar();
  }
}

export function markActiveTabClean(): void {
  const tab = getActiveTab();
  if (tab) {
    tab.dirty = false;
    renderTabBar();
  }
}

export function setActiveTabSlides(isSlides: boolean): void {
  const tab = getActiveTab();
  if (tab) {
    tab.isSlides = isSlides;
  }
}

export function getActiveTabContent(): string {
  return getActiveTab()?.content ?? "";
}

export function getActiveTabFilePath(): string | null {
  return getActiveTab()?.filePath ?? null;
}

export function isActiveTabSlides(): boolean {
  return getActiveTab()?.isSlides ?? false;
}

export function hasTabs(): boolean {
  return tabs.length > 0;
}

export function ensureTab(): Tab {
  if (tabs.length === 0) {
    return createTab();
  }
  return getActiveTab()!;
}

export function getTabForPath(filePath: string): Tab | null {
  return tabs.find((t) => t.filePath === filePath) ?? null;
}
