// The tools an AI agent can call through `mimikit mcp` (src-tauri/src/mcp.rs), described once, here. The relay lists a
// copy, src-tauri/agent-tools.json, so it can answer while Mimikit is closed; tools.test.ts keeps that copy in step.
// The schemas use a small subset of JSON Schema, and run.ts checks every call against them before running it.

export interface Schema {
  type: "object" | "array" | "string" | "integer" | "number" | "boolean";
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  default?: unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Schema;
  annotations: { title: string; readOnlyHint: true; idempotentHint: true; openWorldHint: false };
}

/** Most ids, rows and characters one call takes or returns. */
export const LIMITS = { details: 50, sheet: 16, thumbnails: 4, show: 500, page: 100, tags: 500, readChars: 20_000 };

const read = (title: string) => ({ title, readOnlyHint: true, idempotentHint: true, openWorldHint: false }) as const;
const ids = (max: number, what: string): Schema => ({ type: "array", items: { type: "integer" }, minItems: 1, maxItems: max, description: `${what} At most ${max}.` });
const object = (properties: Record<string, Schema> = {}, required: string[] = []): Schema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const int = (description: string, minimum = 0, maximum?: number): Schema => ({ type: "integer", minimum, ...(maximum !== undefined ? { maximum } : {}), description });

const FILTERS = object({
  exts: { type: "array", items: { type: "string", maxLength: 10 }, maxItems: 50, description: 'File extensions, lowercase without the dot: ["png", "ogg"].' },
  minW: int("Least image width in pixels. Only images whose size is known match any of the four pixel filters."),
  maxW: int("Most image width in pixels."),
  minH: int("Least image height in pixels."),
  maxH: int("Most image height in pixels."),
  square: { type: "boolean", description: "Only images as wide as they are tall." },
  minBytes: int("Least file size in bytes."),
  maxBytes: int("Most file size in bytes."),
  days: int("Only files modified within this many days.", 1),
  untagged: { type: "boolean", description: "Only assets without tags." },
  anyTags: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 50, description: "Only assets with at least one of these tags (exact names, see list_tags)." },
  minRating: int("At least this many stars (1 to 5).", 1, 5),
  minMs: int("Least audio length in milliseconds. Only audio whose length is known matches either length filter."),
  maxMs: int("Most audio length in milliseconds."),
  color: { type: "string", maxLength: 20, description: "A main colour of the image: red, orange, yellow, green, teal, blue, purple, pink, brown, white, gray, black, or #rrggbb." },
});

export const TOOLS: ToolDef[] = [
  {
    name: "overview",
    description:
      "Start here. A summary of the user's Mimikit library of game assets: how many assets of each type, the library folders, the most used tags, the collections, and how much of the image analysis (colour search, similar) is done.",
    inputSchema: object(),
    annotations: read("Library overview"),
  },
  {
    name: "search",
    description: [
      "Find assets with Mimikit's search language, the Filters panel, a sort and pages. Returns short rows (id, name, type, folder, bytes, pixel size or length in seconds); get_assets gives full details and file paths, view shows them.",
      "Query words, all of which must match (case doesn't matter):",
      "- plain words match the folder path and file name, or a whole tag: `coin`, `ui button`",
      "- `type:image` (or audio, model, font, video, text, other)",
      "- `in:sprites` a subfolder's name starts with this (for one library folder, pass folder instead)",
      "- `#player` a tag starts with this",
      "- `size:>1mb`, `size:<200kb` (b, kb, mb, gb)",
      "- `dur:<2s`, `dur:>1m` audio length (ms, s, m)",
      "- `rating:>=4`, `rating:3`",
      "- `note:redo` the user's note on the asset contains this",
      "- `color:red`, `color:#ff8800` a main colour of the image (analysed images only)",
    ].join("\n"),
    inputSchema: object({
      query: { type: "string", maxLength: 500, description: "Words in the search language above. Empty or left out: everything." },
      filters: { ...FILTERS, description: "The Filters panel. A smart collection's rule.filters from list_collections can be passed as it is." },
      favorites: { type: "boolean", description: "Only the user's favorites." },
      collection: int("Only the assets of this collection (an id from list_collections); for a smart collection, what matches its search now."),
      folder: int("Only the assets in this library folder and its subfolders (an id from overview's folders)."),
      sort: { type: "string", enum: ["name", "kind", "size", "mtime", "folder"], default: "name", description: "Order: name, kind (type), size, mtime (modified) or folder." },
      desc: { type: "boolean", default: false, description: "Largest, newest or last first." },
      limit: { type: "integer", minimum: 1, maximum: LIMITS.page, default: 30, description: `Rows per page, at most ${LIMITS.page}.` },
      offset: { type: "integer", minimum: 0, default: 0, description: "Rows to skip: nextOffset from the previous page." },
    }),
    annotations: read("Search assets"),
  },
  {
    name: "get_assets",
    description:
      "Full details of some assets: the absolute file path (to copy the file or load it in code), size, modified date, pixel size or audio length and format, tags, rating, favorite, the user's note, collections, main colours and sprite-sheet grid.",
    inputSchema: object({ ids: ids(LIMITS.details, "Asset ids from search, similar or view.") }, ["ids"]),
    annotations: read("Asset details"),
  },
  {
    name: "similar",
    description:
      "Images that look like one image, closest first (Mimikit's Find similar): the same picture at another size or with small edits, frames of one animation, tiles of one set. Only analysed images take part; overview says how many are.",
    inputSchema: object(
      {
        id: int("The image to compare with."),
        maxDistance: { type: "integer", minimum: 1, maximum: 24, default: 10, description: "How different they may be: 1 nearly identical, 10 the app's default, 24 loose." },
        limit: { type: "integer", minimum: 1, maximum: LIMITS.page, default: 30, description: `Rows, at most ${LIMITS.page}.` },
      },
      ["id"],
    ),
    annotations: read("Similar images"),
  },
  {
    name: "view",
    description: `Look at assets. layout "sheet" (the default): one contact sheet of up to ${LIMITS.sheet} assets in 160 px cells, numbered in the order of ids, about 40 image tokens per asset: good for comparing and picking. layout "thumbnails": up to ${LIMITS.thumbnails} separate pictures of 512 px, for a closer look. Images, 3D models and videos show their thumbnail, fonts a line of sample text, other types their type.`,
    inputSchema: object(
      {
        ids: ids(LIMITS.sheet, "Assets to look at, in the order to number them."),
        layout: { type: "string", enum: ["sheet", "thumbnails"], default: "sheet", description: "One numbered contact sheet, or one picture per asset." },
      },
      ["ids"],
    ),
    annotations: read("View assets"),
  },
  {
    name: "list_tags",
    description: `Every tag in the library with how many assets have it, most used first (at most ${LIMITS.tags}).`,
    inputSchema: object(),
    annotations: read("List tags"),
  },
  {
    name: "list_collections",
    description:
      "The user's collections: id, name and how many assets each has. A smart collection also gives its saved search (query and filters), which search takes as it is. To list a collection's assets, use search with its id.",
    inputSchema: object(),
    annotations: read("List collections"),
  },
  {
    name: "read_text",
    description: `The text of a text or data file in the library (JSON, TXT, Markdown, XML, CSV, YAML, shaders, scripts…) or of a file without an extension such as LICENSE or README: licences, credits and notes that come with a pack. At most ${LIMITS.readChars.toLocaleString("en")} characters; a longer text is cut, and the answer says so.`,
    inputSchema: object({ id: int("The text file's asset id.") }, ["id"]),
    annotations: read("Read a text file"),
  },
  {
    name: "show",
    description:
      "Show assets to the user: Mimikit's library switches to exactly these assets, in this order, so the user sees what you mean. It replaces the user's current search and filters in the window, and changes nothing in the library.",
    inputSchema: object({ ids: ids(LIMITS.show, "Assets to show.") }, ["ids"]),
    annotations: read("Show in Mimikit"),
  },
];
