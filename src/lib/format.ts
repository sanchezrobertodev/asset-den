import type { Kind } from "../types";

export const kindLabel: Record<Kind, string> = {
  image: "Images",
  audio: "Audio",
  model: "3D models",
  font: "Fonts",
  video: "Video",
  text: "Text & data",
  other: "Other",
};

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** "3h ago", "Yesterday", "4d ago", "2w ago", then a date. */
export function ago(ms: number, now = Date.now()): string {
  if (!ms) return "—";
  const d = (now - ms) / 86_400_000;
  if (d < 1 / 24) return "Just now";
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 2) return "Yesterday";
  if (d < 7) return `${Math.round(d)}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function date(ms: number): string {
  return ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

/** Folder part of a "/"-separated relative path. */
export function folderOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
