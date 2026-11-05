import type { Asset, FolderFilter, Root } from "../types";
import { baseName, folderOf, rootLabel } from "./format.ts";

/** A folder in the library, with totals that include everything below it. */
export interface FolderNode {
  /** `${rootId}:${path}`. */
  key: string;
  rootId: number;
  /** "/"-separated path inside the root; "" for the root itself. */
  path: string;
  name: string;
  count: number;
  bytes: number;
  children: FolderNode[];
}

export const folderKey = (rootId: number, path: string) => `${rootId}:${path}`;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** One tree per root, built from the indexed files (folders without assets don't appear). */
export function buildTree(assets: Asset[], roots: Root[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  const node = (rootId: number, path: string, name: string) => {
    const key = folderKey(rootId, path);
    let n = nodes.get(key);
    if (!n) {
      n = { key, rootId, path, name, count: 0, bytes: 0, children: [] };
      nodes.set(key, n);
      if (path) {
        const parent = folderOf(path);
        node(rootId, parent, parent ? baseName(parent) : "").children.push(n);
      }
    }
    return n;
  };
  const tops = roots.map((r) => node(r.id, "", rootLabel(roots, r.id)));
  for (const a of assets) {
    let path = folderOf(a.relPath);
    // Count the file in its folder and every folder above it.
    for (;;) {
      const n = node(a.rootId, path, baseName(path));
      n.count++;
      n.bytes += a.size;
      if (!path) break;
      path = folderOf(path);
    }
  }
  const sort = (n: FolderNode) => {
    n.children.sort((a, b) => collator.compare(a.name, b.name));
    n.children.forEach(sort);
  };
  tops.forEach(sort);
  return tops;
}

/** The chain from the root down to `f`, for breadcrumbs. */
export function pathTo(tree: FolderNode[], f: FolderFilter): FolderNode[] {
  const out: FolderNode[] = [];
  let n = tree.find((r) => r.rootId === f.rootId);
  if (!n) return out;
  out.push(n);
  if (!f.path) return out;
  for (const seg of f.path.split("/")) {
    n = n.children.find((c) => c.name === seg);
    if (!n) break;
    out.push(n);
  }
  return out;
}

/** Keys of `f` and every folder above it, so the tree can expand down to it. */
export function ancestorKeys(f: FolderFilter): string[] {
  const keys = [folderKey(f.rootId, "")];
  let acc = "";
  for (const seg of f.path ? f.path.split("/") : []) {
    acc = acc ? `${acc}/${seg}` : seg;
    keys.push(folderKey(f.rootId, acc));
  }
  return keys;
}

export function parentOf(f: FolderFilter): FolderFilter {
  return { rootId: f.rootId, path: folderOf(f.path) };
}

let cache: { assets: Asset[]; roots: Root[]; tree: FolderNode[] } | null = null;

/** The tree for the current library, rebuilt only when assets or roots change (the sidebar and header share it). */
export function treeFor(assets: Asset[], roots: Root[]): FolderNode[] {
  if (!cache || cache.assets !== assets || cache.roots !== roots) cache = { assets, roots, tree: buildTree(assets, roots) };
  return cache.tree;
}
