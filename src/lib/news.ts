// "What's new" on Home after an update: the CHANGELOG sections since the version last seen. No run-time imports,
// so the Node test can load it.

const KEY = "assetden.seenVersion";

/** The version whose notes were last seen; null on a first run, or after updating from 0.5.0 or older. */
export function seenVersion(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function markSeen(version: string) {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    /* storage unavailable: the note shows again next launch */
  }
}

/**
 * The changelog sections newer than `from`, up to and including `to`, newest first. Only `to`'s section when `from`
 * isn't listed (or isn't older), and "" when `to` has none.
 */
export function notesSince(changelog: string, from: string | null, to: string): string {
  const parts = changelog.split(/^(?=## \[)/m);
  const at = (v: string | null) => (v ? parts.findIndex((p) => p.startsWith(`## [${v}]`)) : -1);
  const start = at(to);
  if (start < 0) return "";
  const end = at(from);
  return parts
    .slice(start, end > start ? end : start + 1)
    .join("")
    .replace(/^## \[([^\]]+)\]/gm, "## $1")
    .trim();
}
