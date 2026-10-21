// The update feed (latest.json) is written by two builders: `make release` (Windows) and the Release workflow
// (macOS, Linux). Whichever runs second merges into what the first published instead of replacing it.

/** `update` with the platforms of `published` it doesn't replace, when both are the same version. */
export function mergeFeed(published, update) {
  if (published?.version !== update.version) return update;
  return { ...update, platforms: { ...published.platforms, ...update.platforms } };
}
