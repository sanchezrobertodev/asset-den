// Path helpers, with no imports so the Node tests can use them. Display formatting is in fmt.ts.

/** Folder part of a "/"-separated relative path. */
export function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
