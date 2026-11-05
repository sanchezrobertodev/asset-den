// Path helpers, with no imports so the Node tests can use them. Display formatting is in fmt.ts.

/** Folder part of a "/"-separated relative path. */
export function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * A library folder's name. When another library folder has the same name, the nearest parent folder that tells them
 * apart follows it: "files · assets" and "files · audio".
 */
export function rootLabel(roots: { id: number; path: string }[], id: number): string {
  const parts = (path: string) => path.split(/[\\/]/).filter(Boolean);
  const own = parts(roots.find((r) => r.id === id)?.path ?? "");
  const name = own.at(-1) ?? "";
  const twins = roots.filter((r) => r.id !== id && parts(r.path).at(-1) === name).map((r) => parts(r.path));
  for (let up = 2; twins.length && up <= own.length; up++) if (twins.every((p) => p.at(-up) !== own.at(-up))) return `${name} · ${own.at(-up)}`;
  return name;
}
