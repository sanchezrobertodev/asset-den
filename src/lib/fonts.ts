// Font files registered as FontFaces for the cards and the side panel. Keyed by family, which includes mtime, so an
// edited font (or a new one reusing an id) loads afresh. Faces nobody shows are unloaded, oldest first, once there are
// more than FONT_LIMIT, so scrolling through a big font pack doesn't keep every font in memory.

import type { Asset } from "../types";

export const FONT_LIMIT = 200;
const fonts = new Map<string, { face: Promise<FontFace | null>; users: number }>();

/**
 * Loads the font file as a FontFace and passes its family name to `onReady` (null if it fails to load). Returns a
 * function to call when the font isn't shown anymore.
 */
export function holdFont(a: Asset, url: string, onReady: (family: string | null) => void): () => void {
  const family = `asset-font-${a.id}-${a.mtime}`;
  const entry = fonts.get(family) ?? {
    users: 0,
    face: new FontFace(family, `url("${url}")`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        return f;
      })
      .catch(() => {
        // Not cached, so a later try (say, after its folder is relinked) loads it again.
        fonts.delete(family);
        return null;
      }),
  };
  fonts.delete(family); // set again, as the most recent
  fonts.set(family, entry);
  entry.users++;
  let live = true;
  void entry.face.then((f) => live && onReady(f && family));
  return () => {
    live = false;
    entry.users--;
    for (const [k, e] of fonts) {
      if (fonts.size <= FONT_LIMIT) break;
      if (e.users) continue;
      fonts.delete(k);
      void e.face.then((f) => f && document.fonts.delete(f));
    }
  };
}
