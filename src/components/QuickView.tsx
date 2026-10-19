import clsx from "clsx";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LoaderCircle,
  Pause,
  Play,
  SquareArrowOutUpRight,
  Star,
  X,
  ZoomIn,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WaveSurfer from "wavesurfer.js";
import { api, errorText, fileUrl } from "../api";
import { bytes, kindLabel } from "../lib/format";
import { addLights, dispose, frame, loadModel, stats } from "../lib/models";
import { fontFamily } from "../lib/thumbs";
import { useStore } from "../store";
import type { Asset } from "../types";
import { openAsset, revealAsset } from "./DetailPanel";
import { isTiny } from "./Thumb";
import { Button, IconButton, KindIcon } from "./ui";

/** Formats the webview shows natively; the rest get a PNG preview from the backend. */
const NATIVE_IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

function Message({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted">
      {busy && <LoaderCircle aria-hidden className="size-6 animate-spin" />}
      {children}
    </div>
  );
}

function ImageView({ asset, pixelated }: { asset: Asset; pixelated: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(null);
    if (NATIVE_IMAGE.has(asset.ext)) {
      setSrc(fileUrl(asset.path));
      return;
    }
    setSrc(null);
    let live = true;
    api
      .preview(asset.id)
      .then((p) => live && setSrc(convertFileSrc(p)))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [asset.id, asset.ext, asset.path, asset.mtime]);

  const onWheel = (e: WheelEvent) => setZoom((z) => Math.min(32, Math.max(0.1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  const onDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });

  if (error) return <Message>Couldn't decode this image: {error}</Message>;
  if (!src) return <Message busy>Decoding…</Message>;
  return (
    <div
      className="checker relative h-full cursor-grab overflow-hidden active:cursor-grabbing"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }}
    >
      <img
        src={src}
        alt={asset.name}
        draggable={false}
        onError={() => setError("the webview can't display it")}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        className={clsx("absolute inset-0 h-full w-full object-contain", (pixelated || isTiny(asset)) && "pixelated")}
      />
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-scrim px-1.5 py-0.5 font-mono text-[11px] text-white">
        <ZoomIn aria-hidden className="size-3" />
        {Math.round(zoom * 100)}% · scroll to zoom, drag to pan, double-click to reset
      </span>
    </div>
  );
}

function AudioView({ asset }: { asset: Asset }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    setError(null);
    const css = getComputedStyle(document.documentElement);
    const w = WaveSurfer.create({
      container: box.current,
      url: fileUrl(asset.path),
      height: 180,
      waveColor: css.getPropertyValue("--border-strong").trim(),
      progressColor: css.getPropertyValue("--accent").trim(),
      cursorColor: css.getPropertyValue("--fg").trim(),
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    });
    ws.current = w;
    w.on("ready", (d) => {
      setTime({ now: 0, total: d });
      void w.play().catch(() => {});
    });
    w.on("timeupdate", (t) => setTime((x) => ({ ...x, now: t })));
    w.on("play", () => setPlaying(true));
    w.on("pause", () => setPlaying(false));
    w.on("error", (e) => setError(errorText(e)));
    return () => w.destroy();
  }, [asset.id, asset.path, asset.mtime]);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-10">
      {error ? (
        <Message>Can't play this file here: {error}</Message>
      ) : (
        <>
          <div ref={box} className="w-full" />
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void ws.current?.playPause()} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <span className="font-mono text-xs text-muted">
              {fmt(time.now)} / {fmt(time.total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function ModelView({ asset }: { asset: Asset }) {
  const box = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState(false);
  const [info, setInfo] = useState<{ vertices: number; triangles: number; clips: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wire = useRef<(on: boolean) => void>(() => {});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setInfo(null);
    setError(null);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(40, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const clock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;
    let object: THREE.Object3D | null = null;
    let raf = 0;
    let live = true;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    loadModel(asset)
      .then(({ object: o, animations }) => {
        if (!live) return dispose(o);
        object = o;
        scene.add(o);
        const r = frame(camera, o, controls.target);
        const grid = new THREE.GridHelper(r * 4, 20, 0x667085, 0x3a4357);
        grid.position.y = new THREE.Box3().setFromObject(o).min.y;
        scene.add(grid);
        if (animations.length) {
          mixer = new THREE.AnimationMixer(o);
          mixer.clipAction(animations[0]).play();
        }
        wire.current = (on) =>
          o.traverse((c) => {
            const m = (c as THREE.Mesh).material;
            for (const mat of Array.isArray(m) ? m : m ? [m] : []) (mat as THREE.MeshStandardMaterial).wireframe = on;
          });
        setInfo({ ...stats(o), clips: animations.length });
      })
      .catch((e) => live && setError(errorText(e)));

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (object) dispose(object);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [asset.id, asset.path, asset.mtime]);

  useEffect(() => wire.current(wireframe), [wireframe, info]);

  return (
    <div className="relative h-full">
      <div ref={box} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0">
          <Message>Couldn't load this model: {error}</Message>
        </div>
      )}
      {!info && !error && (
        <div className="pointer-events-none absolute inset-0">
          <Message busy>Loading model…</Message>
        </div>
      )}
      {info && (
        <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-md bg-scrim px-2.5 py-1.5 font-mono text-[11px] text-white">
          <span>{info.triangles.toLocaleString()} tris</span>
          <span>{info.vertices.toLocaleString()} verts</span>
          {info.clips > 0 && <span>{info.clips} animation{info.clips > 1 ? "s" : ""} (playing first)</span>}
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
            Wireframe
          </label>
          <span className="text-white/70">drag to orbit · scroll to zoom</span>
        </div>
      )}
    </div>
  );
}

const PANGRAM = "The quick brown fox jumps over the lazy dog";

function FontView({ asset }: { asset: Asset }) {
  const [family, setFamily] = useState<string | null | undefined>(undefined);
  const [sample, setSample] = useState(PANGRAM);
  useEffect(() => {
    setFamily(undefined);
    let live = true;
    void fontFamily(asset, fileUrl(asset.path)).then((f) => live && setFamily(f));
    return () => {
      live = false;
    };
  }, [asset]);
  if (family === undefined) return <Message busy>Loading font…</Message>;
  if (family === null) return <Message>This font couldn't be loaded.</Message>;
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <input
        aria-label="Sample text"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        className="mb-6 h-9 w-full max-w-xl rounded-md border border-border-strong bg-bg px-3 text-sm"
      />
      <div style={{ fontFamily: family }} className="space-y-4 text-fg">
        {[12, 16, 24, 36, 48, 72].map((px) => (
          <div key={px} className="flex items-baseline gap-4">
            <span className="w-10 shrink-0 font-mono text-[11px] text-muted" style={{ fontFamily: "var(--font-mono)" }}>
              {px}px
            </span>
            <span style={{ fontSize: px }} className="truncate leading-tight">
              {sample || PANGRAM}
            </span>
          </div>
        ))}
        <div className="pt-4 text-2xl leading-relaxed break-all">
          ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !?&amp;@#$%()[]{"{}"}
        </div>
      </div>
    </div>
  );
}

function TextView({ asset }: { asset: Asset }) {
  const [text, setText] = useState<{ text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    setError(null);
    let live = true;
    api
      .readText(asset.id)
      .then((t) => {
        if (!live) return;
        if (asset.ext === "json" && !t.truncated) {
          try {
            t = { ...t, text: JSON.stringify(JSON.parse(t.text), null, 2) };
          } catch {
            /* not valid JSON: show as-is */
          }
        }
        setText(t);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [asset.id, asset.ext, asset.mtime]);
  if (error) return <Message>Couldn't read this file: {error}</Message>;
  if (!text) return <Message busy>Reading…</Message>;
  return (
    <div className="h-full overflow-auto">
      {text.truncated && (
        <p className="sticky top-0 border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-muted">
          Showing the first 1 MB of {bytes(asset.size)}.
        </p>
      )}
      <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg select-text">{text.text}</pre>
    </div>
  );
}

function Viewer({ asset, pixelated }: { asset: Asset; pixelated: boolean }) {
  switch (asset.kind) {
    case "image":
      return <ImageView asset={asset} pixelated={pixelated} />;
    case "audio":
      return <AudioView asset={asset} />;
    case "model":
      return <ModelView asset={asset} />;
    case "font":
      return <FontView asset={asset} />;
    case "video":
      return (
        <video key={asset.id} src={fileUrl(asset.path)} controls autoPlay className="h-full w-full bg-black object-contain">
          This video format can't be played here.
        </video>
      );
    case "text":
      return <TextView asset={asset} />;
    default:
      return (
        <Message>
          <KindIcon kind="other" className="size-10" />
          No preview for .{asset.ext} files.
          <Button size="sm" onClick={() => void revealAsset(asset)}>
            <FolderOpen aria-hidden className="size-4" /> Show in folder
          </Button>
        </Message>
      );
  }
}

export function QuickView({ asset, index, total, onStep }: { asset: Asset; index: number; total: number; onStep: (d: number) => void }) {
  const { pixelated, setQuickView, setFavorite } = useStore();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => prev?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex bg-scrim p-6" onMouseDown={() => setQuickView(false)}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view: ${asset.name}`}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl outline-none focus-visible:outline-none"
      >
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <IconButton label="Previous (Left arrow)" onClick={() => onStep(-1)} disabled={index <= 0}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next (Right arrow)" onClick={() => onStep(1)} disabled={index >= total - 1}>
            <ChevronRight className="size-4" />
          </IconButton>
          <KindIcon kind={asset.kind} className="ml-1 size-4" />
          <h2 className="min-w-0 truncate text-sm font-semibold">{asset.name}</h2>
          <span className="font-mono text-xs whitespace-nowrap text-muted">
            {kindLabel[asset.kind]} · {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
            {bytes(asset.size)} · {index + 1}/{total}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <IconButton
              label={asset.favorite ? "Unfavorite (F)" : "Favorite (F)"}
              aria-pressed={asset.favorite}
              onClick={() => void setFavorite([asset.id], !asset.favorite)}
            >
              <Star className={clsx("size-4", asset.favorite && "fill-warn text-warn")} />
            </IconButton>
            <IconButton label="Show in folder" onClick={() => void revealAsset(asset)}>
              <FolderOpen className="size-4" />
            </IconButton>
            {asset.kind !== "other" && (
              <IconButton label="Open in default app (Enter)" onClick={() => void openAsset(asset)}>
                <SquareArrowOutUpRight className="size-4" />
              </IconButton>
            )}
            <IconButton label="Close (Esc or Space)" onClick={() => setQuickView(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Viewer asset={asset} pixelated={pixelated} />
        </div>
        <footer className="shrink-0 truncate border-t border-border px-4 py-1.5 font-mono text-[11px] text-muted" title={asset.path}>
          {asset.path}
        </footer>
      </div>
    </div>
  );
}
