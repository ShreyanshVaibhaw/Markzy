export interface Tab {
  id: string;
  filePath: string | null;
  title: string;
  content: string;
  savedContent: string;
  isSlides: boolean;
  dirty: boolean;
}

let tabs: Tab[] = [];
let activeTabId: string = "";
let tabCounter = 0;
let tabSwitchCallbacks: Array<(prev: Tab | null, next: Tab) => void> = [];
let tabCloseHandler: ((tabId: string) => void | Promise<void>) | null = null;

export function onTabSwitch(cb: (prev: Tab | null, next: Tab) => void): void {
  tabSwitchCallbacks.push(cb);
}

export function onTabCloseRequest(handler: (tabId: string) => void | Promise<void>): void {
  tabCloseHandler = handler;
}

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
      if (tabCloseHandler) void tabCloseHandler(tab.id);
    });

    el.appendChild(closeBtn);
    el.addEventListener("click", () => switchToTab(tab.id));
    bar.appendChild(el);
  });

  const newBtn = document.createElement("span");
  newBtn.className = "tab-new";
  newBtn.textContent = "+";
  newBtn.title = "New Tab (Ctrl+N)";
  newBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    createTab();
  });
  bar.appendChild(newBtn);
}

export function createTab(filePath?: string | null, content?: string, isSlides?: boolean): Tab {
  const prevTab = getActiveTab();
  const initialContent = content ?? "";
  const tab: Tab = {
    id: generateTabId(),
    filePath: filePath ?? null,
    title: filePath ? filePath.split(/[/\\]/).pop() || "Untitled" : "Untitled",
    content: initialContent,
    savedContent: filePath ? initialContent : "",
    isSlides: isSlides ?? false,
    dirty: !filePath && initialContent !== "",
  };
  tabs.push(tab);
  activeTabId = tab.id;
  renderTabBar();
  for (const cb of tabSwitchCallbacks) {
    cb(prevTab, tab);
  }
  return tab;
}

export function closeTab(tabId: string): void {
  if (tabs.length <= 1) {
    tabs[0].content = "";
    tabs[0].filePath = null;
    tabs[0].title = "Untitled";
    tabs[0].savedContent = "";
    tabs[0].dirty = false;
    tabs[0].isSlides = false;
    activeTabId = tabs[0].id;
    renderTabBar();
    return;
  }

  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  const oldTab = tabs[idx];
  const wasActive = activeTabId === tabId;
  tabs.splice(idx, 1);

  if (wasActive) {
    const newIdx = Math.min(idx, tabs.length - 1);
    activeTabId = tabs[newIdx].id;
  }

  renderTabBar();

  if (wasActive) {
    const newActive = getActiveTab();
    if (newActive) {
      for (const cb of tabSwitchCallbacks) {
        cb(oldTab, newActive);
      }
    }
  }
}

export function switchToTab(tabId: string): void {
  const prevTab = getActiveTab();
  if (prevTab && prevTab.id === tabId) return;

  const nextTab = tabs.find((t) => t.id === tabId);
  if (!nextTab) return;

  activeTabId = tabId;
  renderTabBar();
  for (const cb of tabSwitchCallbacks) {
    cb(prevTab, nextTab);
  }
}

export function getActiveTab(): Tab | null {
  return tabs.find((t) => t.id === activeTabId) ?? null;
}

export function getTabById(tabId: string): Tab | null {
  return tabs.find((t) => t.id === tabId) ?? null;
}

export function updateActiveTabContent(content: string): void {
  const tab = getActiveTab();
  if (!tab) return;
  const wasDirty = tab.dirty;
  tab.content = content;
  tab.dirty = content !== tab.savedContent;
  if (tab.dirty !== wasDirty) renderTabBar();
}

export function replaceActiveTabContent(content: string): void {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = content;
  tab.savedContent = content;
  tab.dirty = false;
  renderTabBar();
}

export function updateActiveTabFilePath(path: string): void {
  const tab = getActiveTab();
  if (tab) {
    tab.filePath = path;
    tab.title = path.split(/[/\\]/).pop() || "Untitled";
    renderTabBar();
  }
}

export function markActiveTabClean(): void {
  const tab = getActiveTab();
  if (tab) {
    tab.savedContent = tab.content;
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

export function getDirtyTabs(): Tab[] {
  return tabs.filter((tab) => tab.dirty);
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
