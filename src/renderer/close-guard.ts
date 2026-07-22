export type CloseChoice = "Save" | "Don't Save" | "Cancel";

export async function resolveUnsavedChanges<T>(
  items: readonly T[],
  choose: (item: T) => Promise<CloseChoice>,
  save: (item: T) => Promise<boolean>,
): Promise<boolean> {
  for (const item of items) {
    const choice = await choose(item);
    if (choice === "Cancel") return false;
    if (choice === "Don't Save") continue;
    if (choice !== "Save" || !(await save(item))) return false;
  }
  return true;
}
