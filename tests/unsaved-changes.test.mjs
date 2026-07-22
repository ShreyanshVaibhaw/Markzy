import assert from "node:assert/strict";
import test from "node:test";

globalThis.document = { getElementById: () => null };

const tabs = await import("../node_modules/.cache/markzy-tests/tabs.js");
const { resolveUnsavedChanges } = await import(
  "../node_modules/.cache/markzy-tests/close-guard.js"
);

test("tracks edits against the saved baseline", () => {
  const tab = tabs.createTab("C:\\notes\\example.md", "saved");
  assert.equal(tab.dirty, false);

  tabs.updateActiveTabContent("changed");
  assert.equal(tab.dirty, true);

  tabs.updateActiveTabContent("saved");
  assert.equal(tab.dirty, false);

  tabs.updateActiveTabContent("changed again");
  tabs.markActiveTabClean();
  assert.equal(tab.savedContent, "changed again");
  assert.equal(tab.dirty, false);

  tabs.replaceActiveTabContent("external change");
  assert.equal(tab.content, "external change");
  assert.equal(tab.savedContent, "external change");
  assert.equal(tab.dirty, false);
});

test("marks populated untitled documents dirty", () => {
  const tab = tabs.createTab(null, "draft");
  assert.equal(tab.dirty, true);
});

test("handles mixed save and don't-save choices", async () => {
  const choices = new Map([
    ["first", "Save"],
    ["second", "Don't Save"],
    ["third", "Save"],
  ]);
  const saved = [];
  const result = await resolveUnsavedChanges(
    ["first", "second", "third"],
    async (item) => choices.get(item),
    async (item) => {
      saved.push(item);
      return true;
    },
  );

  assert.equal(result, true);
  assert.deepEqual(saved, ["first", "third"]);
});

test("cancel stops the close sequence", async () => {
  const prompted = [];
  const result = await resolveUnsavedChanges(
    ["first", "second", "third"],
    async (item) => {
      prompted.push(item);
      return item === "second" ? "Cancel" : "Don't Save";
    },
    async () => true,
  );

  assert.equal(result, false);
  assert.deepEqual(prompted, ["first", "second"]);
});

test("failed or canceled saves keep the document open", async () => {
  const result = await resolveUnsavedChanges(
    ["document"],
    async () => "Save",
    async () => false,
  );

  assert.equal(result, false);
});
