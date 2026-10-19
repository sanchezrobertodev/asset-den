// Thumbnail lookups, cached per file version for the session so scrolling back never re-asks the backend.

import * as THREE from "three";
import { api } from "../api";
import type { Asset } from "../types";
import { addLights, dispose, frame, loadModel } from "./models";

const cache = new Map<string, Promise<string | null>>();
const key = (a: Asset) => `${a.id}:${a.mtime}:${a.size}`;

export function thumbnailFor(a: Asset): Promise<string | null> {
  const k = key(a);
  let p = cache.get(k);
  if (!p) {
    p = api
      .thumbnail(a.id)
      .then((path) => path ?? (a.kind === "model" ? renderModelThumb(a) : null))
      .catch(() => null);
    cache.set(k, p);
  }
  return p;
}

// One shared offscreen renderer for model thumbnails, used one model at a time.
let renderer: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

function renderModelThumb(a: Asset): Promise<string | null> {
  const job = queue.then(async () => {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(256, 256, false);
    const scene = new THREE.Scene();
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(35, 1);
    const { object } = await loadModel(a);
    scene.add(object);
    frame(camera, object);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((r) => renderer!.domElement.toBlob(r, "image/png"));
    dispose(object);
    if (!blob) return null;
    return api.saveThumbnail(a.id, new Uint8Array(await blob.arrayBuffer()));
  });
  queue = job.catch(() => {});
  return job.catch(() => null);
}

const fonts = new Map<number, Promise<string | null>>();

/** Registers the font file as a FontFace and returns its family name, or null if it fails to load. */
export function fontFamily(a: Asset, url: string): Promise<string | null> {
  let p = fonts.get(a.id);
  if (!p) {
    const family = `asset-font-${a.id}-${a.mtime}`;
    p = new FontFace(family, `url("${url}")`)
      .load()
      .then((f) => {
        document.fonts.add(f);
        return family;
      })
      .catch(() => null);
    fonts.set(a.id, p);
  }
  return p;
}
