import clsx from "clsx";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import WaveSurfer from "wavesurfer.js";
import { api, errorText, fileUrl } from "../api";
import { bytes } from "../lib/format";
import { addLights, dispose, frame, loadModel, stats } from "../lib/models";
import { fontFamily } from "../lib/thumbs";
import type { Asset } from "../types";
import { isTiny } from "./Thumb";

/** Formats the webview shows natively; the rest get a PNG preview from the backend. */
const NATIVE_IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

function Note({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted">
      {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
      {children}
    </div>
  );
}

const chip = "rounded-md bg-active px-2 py-1 font-mono text-[11px] whitespace-nowrap text-fg-2";

function ImageView({ asset, pixelated, full }: { asset: Asset; pixelated: boolean; full: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fit, setFit] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(null);
    setFit(null);
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

  const measure = () => {
    const el = img.current;
    if (el?.naturalWidth) setFit(el.clientWidth / el.naturalWidth);
  };
  const onWheel = (e: WheelEvent) => setZoom((z) => Math.min(32, Math.max(0.1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  const onDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });

  if (error) return <Note>Couldn't decode this image: {error}</Note>;
  if (!src) return <Note busy>Decoding…</Note>;
  const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : "";
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <div
        className={clsx("relative min-h-0 w-full flex-1 overflow-hidden", full && "cursor-grab active:cursor-grabbing")}
        onWheel={full ? onWheel : undefined}
        onPointerDown={full ? onDown : undefined}
        onPointerMove={full ? onMove : undefined}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={
          full
            ? (e) => {
                e.stopPropagation();
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }
            : undefined
        }
      >
        <img
          ref={img}
          src={src}
          alt={asset.name}
          draggable={false}
          onLoad={measure}
          onError={() => setError("the webview can't display it")}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          className={clsx(
            "absolute inset-0 m-auto max-h-full max-w-full object-contain shadow-[0_8px_30px_rgba(0,0,0,.45)]",
            isTiny(asset) && "h-full w-full",
            (pixelated || isTiny(asset)) && "pixelated",
          )}
        />
      </div>
      <span className={chip}>
        {[dims, fit !== null ? `${full ? "shown at " : ""}${Math.round(fit * zoom * 100)}%` : ""].filter(Boolean).join(" · ")}
        {full && " · scroll to zoom, drag to pan"}
      </span>
    </div>
  );
}

function AudioView({ asset, full }: { asset: Asset; full: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    setError(null);
    setPlaying(false);
    const css = getComputedStyle(document.documentElement);
    const w = WaveSurfer.create({
      container: box.current,
      url: fileUrl(asset.path),
      height: full ? 180 : 90,
      waveColor: css.getPropertyValue("--line-x").trim(),
      progressColor: css.getPropertyValue("--accent").trim(),
      cursorWidth: 0,
      barWidth: full ? 4 : 3,
      barGap: full ? 3 : 2,
      barRadius: 1,
    });
    ws.current = w;
    w.on("ready", (d) => {
      setTime({ now: 0, total: d });
      if (full) void w.play().catch(() => {});
    });
    w.on("timeupdate", (t) => setTime((x) => ({ ...x, now: t })));
    w.on("play", () => setPlaying(true));
    w.on("pause", () => setPlaying(false));
    w.on("error", (e) => setError(errorText(e)));
    return () => w.destroy();
  }, [asset.id, asset.path, asset.mtime, full]);

  const fmt = (s: number) => (s < 10 && s % 1 ? `0:0${s.toFixed(1)}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  if (error) return <Note>Can't play this file here: {error}</Note>;
  return (
    <div className={clsx("flex w-full flex-col", full ? "max-w-[760px] gap-[26px]" : "gap-[18px]")}>
      <div ref={box} className="w-full" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void ws.current?.playPause()}
          aria-label={playing ? "Pause" : "Play"}
          className={clsx("flex items-center justify-center rounded-full bg-accent text-accent-fg", full ? "size-[46px]" : "size-[38px]")}
        >
          {playing ? <Pause aria-hidden className="size-4 fill-current" /> : <Play aria-hidden className="size-4 fill-current" />}
        </button>
        <span className={clsx("font-mono text-fg-2", full ? "text-[13px]" : "text-xs")}>
          {fmt(time.now)} / {fmt(time.total)}
        </span>
      </div>
    </div>
  );
}

function ModelView({ asset, full }: { asset: Asset; full: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState(false);
  const [info, setInfo] = useState<{ vertices: number; triangles: number; clips: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wire = useRef<(on: boolean) => void>(() => {});
  const reset = useRef<() => void>(() => {});

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
        reset.current = () => frame(camera, o, controls.target);
        const css = getComputedStyle(document.documentElement);
        const grid = new THREE.GridHelper(r * 4, 20, new THREE.Color(css.getPropertyValue("--line-x").trim()), new THREE.Color(css.getPropertyValue("--line").trim()));
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
    <div className={clsx("stripes relative w-full overflow-hidden rounded-xl", full ? "h-full" : "h-[200px]")}>
      <div ref={box} className="h-full w-full" />
      {(error || !info) && (
        <div className="pointer-events-none absolute inset-0">
          {error ? <Note>Couldn't load this model: {error}</Note> : <Note busy>Loading model…</Note>}
        </div>
      )}
      {info && (
        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          <span className={chip}>
            {info.triangles.toLocaleString()} tris · {info.vertices.toLocaleString()} verts
            {info.clips > 0 && ` · ${info.clips} anim`}
          </span>
          {full && (
            <>
              <button type="button" aria-pressed={wireframe} onClick={() => setWireframe((w) => !w)} className={clsx(chip, "font-sans", wireframe && "text-accent")}>
                Wireframe
              </button>
              <button type="button" onClick={() => reset.current()} className={clsx(chip, "font-sans")}>
                Reset view
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const PANGRAM = "The quick brown fox jumps over the lazy dog";

function FontView({ asset, full }: { asset: Asset; full: boolean }) {
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
  if (family === undefined) return <Note busy>Loading font…</Note>;
  if (family === null) return <Note>This font couldn't be loaded.</Note>;
  return (
    <div className={clsx("flex w-full flex-col", full ? "max-w-[820px] gap-4" : "gap-2")} style={{ fontFamily: family }}>
      <span className={clsx("leading-none", full ? "text-[140px]" : "text-[64px]")}>Aa</span>
      {full ? (
        <input
          aria-label="Sample text"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="border-0 bg-transparent p-0 text-[36px] text-fg outline-none"
          style={{ fontFamily: family }}
        />
      ) : (
        <span className="text-[19px] leading-snug">{PANGRAM}</span>
      )}
      <span className={clsx("text-fg-2", full ? "text-xl" : "text-[13px]")}>ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</span>
    </div>
  );
}

function TextView({ asset, full }: { asset: Asset; full: boolean }) {
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
  if (error) return <Note>Couldn't read this file: {error}</Note>;
  if (!text) return <Note busy>Reading…</Note>;
  const lines = text.text.split("\n");
  const shown = full ? lines.slice(0, 5000) : lines.slice(0, 9);
  const pad = String(shown.length).length;
  return (
    <div
      className={clsx(
        "w-full overflow-auto rounded-xl border border-line bg-card font-mono select-text",
        full ? "max-h-full max-w-[760px] px-6 py-5 text-sm leading-[1.8]" : "px-3.5 py-3 text-xs leading-[1.7]",
      )}
    >
      {shown.map((t, i) => (
        <div key={i} className="flex gap-3.5 whitespace-pre">
          <span className="shrink-0 text-right text-faint" style={{ width: `${pad}ch` }}>
            {i + 1}
          </span>
          <span>{t}</span>
        </div>
      ))}
      {(text.truncated || shown.length < lines.length) && (
        <div className="pt-1 text-faint">… {full ? `showing the start of ${bytes(asset.size)}` : `${lines.length - shown.length} more lines`}</div>
      )}
    </div>
  );
}

/** The preview for one asset. `full` is the full-screen stage; otherwise the compact side-panel stage. */
export function Viewer({ asset, pixelated, full = false }: { asset: Asset; pixelated: boolean; full?: boolean }) {
  switch (asset.kind) {
    case "image":
      return <ImageView asset={asset} pixelated={pixelated} full={full} />;
    case "audio":
      return <AudioView asset={asset} full={full} />;
    case "model":
      return <ModelView asset={asset} full={full} />;
    case "font":
      return <FontView asset={asset} full={full} />;
    case "video":
      return (
        <video
          key={asset.id}
          src={fileUrl(asset.path)}
          controls
          autoPlay={full}
          className={clsx("w-full rounded-xl bg-black object-contain", full ? "h-full" : "max-h-[200px]")}
        >
          This video format can't be played here.
        </video>
      );
    case "text":
      return <TextView asset={asset} full={full} />;
    default:
      return (
        <Note>
          <span className={clsx("font-mono text-fg", full ? "text-[28px]" : "text-xl")}>.{asset.ext}</span>
          No preview for this file type
        </Note>
      );
  }
}
