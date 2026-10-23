import clsx from "clsx";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Download, Grid3x3, LoaderCircle, Pause, Play, Repeat, StepBack, StepForward } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { api, errorText, fileUrl } from "../api";
import { bytes } from "../lib/format";
import { frameSize, gridFor, guessGrid } from "../lib/sprites";
import { fontFamily } from "../lib/thumbs";
import { useStore } from "../store";
import type { Asset, SpriteSheet } from "../types";
import { isTiny } from "./Thumb";

/** Formats the webview shows natively; the rest get a PNG preview from the backend. */
const NATIVE_IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);

export function Note({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted">
      {busy && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
      {children}
    </div>
  );
}

const chipBox = "rounded-md bg-active px-2 py-1 font-mono text-[11px] whitespace-nowrap";
export const chip = `${chipBox} text-fg-2`;
/** A chip that toggles something; accent text while on. */
export const toggleChip = (on: boolean) => clsx(chipBox, "font-sans", on ? "text-accent" : "text-fg-2");

function ImageView({ asset, pixelated, full }: { asset: Asset; pixelated: boolean; full: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fit, setFit] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const sheet = useStore((s) => s.sheets[asset.id]);
  const loadSheet = useStore((s) => s.loadSheet);
  const saveSheet = useStore((s) => s.saveSheet);
  // null follows the saved slicing: an asset animated before opens animated.
  const [animate, setAnimate] = useState<boolean | null>(null);
  const animating = animate ?? !!sheet;

  useEffect(() => {
    if (useStore.getState().sheets[asset.id] === undefined) void loadSheet(asset.id);
  }, [asset.id, loadSheet]);

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
  const toggle = (
    <button
      type="button"
      aria-pressed={animating}
      disabled={sheet === undefined}
      onClick={() => setAnimate(!animating)}
      title="Play the image as a sprite sheet"
      className={clsx(toggleChip(animating), "disabled:opacity-50")}
    >
      Animate
    </button>
  );
  if (animating && sheet !== undefined)
    return (
      <SpriteView asset={asset} src={src} sheet={sheet} onSheet={(v) => void saveSheet(asset.id, v)} pixelated={pixelated} full={full} toggle={toggle} />
    );
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
      <div className="flex items-center gap-1.5" onDoubleClick={(e) => e.stopPropagation()}>
        <span className={chip}>
          {[dims, fit !== null ? `${full ? "shown at " : ""}${Math.round(fit * zoom * 100)}%` : ""].filter(Boolean).join(" · ")}
          {full && " · scroll to zoom, drag to pan"}
        </span>
        {toggle}
      </div>
    </div>
  );
}

const DEFAULT_FPS = 12;
const MAX_CELLS = 1024;

/** A number field that only reports values in range, so typing "1" on the way to "12" doesn't fight the user. */
function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
      className="h-[26px] w-[52px] rounded-md border border-line-strong bg-bg px-1.5 font-mono text-[11px] text-fg"
    />
  );
}

/** Saves each frame of the sheet as a PNG in a folder the user picks, cut from the original file. */
function ExportFrames({ asset, sheet }: { asset: Asset; sheet: SpriteSheet }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [skipEmpty, setSkipEmpty] = useState(false);
  const run = async () => {
    if (menu.current) menu.current.open = false;
    const { showToast, setError } = useStore.getState();
    const dest = await api.pickFolder(`Export the frames of ${asset.name} to…`);
    if (!dest) return;
    try {
      const r = await api.exportFrames(asset.id, sheet.cols, sheet.rows, skipEmpty, dest);
      const what = `${r.written} ${r.written === 1 ? "frame" : "frames"}`;
      if (r.failed.length) setError(`Exported ${what}. ${r.failed.length} failed: ${r.failed.slice(0, 3).join("; ")}`);
      else if (!r.first) showToast("Every frame is empty, so nothing was exported.");
      else showToast(`Exported ${what} to ${dest}`, () => api.revealPath(r.first!).catch(setError), "Show in folder");
    } catch (e) {
      setError(e);
    }
  };
  return (
    <details ref={menu} className="relative">
      <summary className={clsx(toggleChip(false), "flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden")}>
        <Download aria-hidden className="size-3" /> Export frames…
      </summary>
      <div className="absolute right-0 bottom-full z-30 mb-1.5 flex w-56 flex-col gap-2.5 rounded-xl border border-line-strong bg-field p-3 text-xs text-fg shadow-2xl">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
          Skip fully transparent frames
        </label>
        <button type="button" onClick={() => void run()} className="h-7 rounded-md bg-accent px-2.5 font-semibold text-accent-fg">
          Choose folder…
        </button>
      </div>
    </details>
  );
}

/** Plays an image as a grid of frames drawn on a canvas. The slicing is saved per asset through `onSheet`. */
function SpriteView({
  asset,
  src,
  sheet,
  onSheet,
  pixelated,
  full,
  toggle,
}: {
  asset: Asset;
  src: string;
  sheet: SpriteSheet | null;
  onSheet: (s: SpriteSheet) => void;
  pixelated: boolean;
  full: boolean;
  toggle: ReactNode;
}) {
  const setPixelated = useStore((s) => s.setPixelated);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [loop, setLoop] = useState(true);

  useEffect(() => {
    setImg(null);
    setError(null);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setError("the webview can't display it");
    i.src = src;
    return () => {
      i.onload = i.onerror = null;
    };
  }, [src]);

  const w = img?.naturalWidth ?? 0;
  const h = img?.naturalHeight ?? 0;
  const update = (patch: Partial<SpriteSheet>) => {
    const next = { cols: 1, rows: 1, fps: DEFAULT_FPS, ...sheet, ...patch };
    const clamp = (n: number) => Math.min(MAX_CELLS, Math.max(1, n));
    onSheet({ ...next, cols: clamp(next.cols), rows: clamp(next.rows) });
  };

  // Entering Animate on an image without a saved slicing saves the guess, so it opens animated next time.
  const guessed = useRef(false);
  useEffect(() => {
    if (!img || sheet !== null || guessed.current) return;
    guessed.current = true;
    onSheet({ ...guessGrid(img.naturalWidth, img.naturalHeight), fps: DEFAULT_FPS });
  }, [img, sheet, onSheet]);

  const count = sheet ? sheet.cols * sheet.rows : 1;
  const at = frame % count;
  const fps = sheet?.fps ?? DEFAULT_FPS;
  const size = sheet ? frameSize(w, h, sheet) : { w: 1, h: 1 };

  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => setFrame((f) => (loop ? (f % count) + 1 : Math.min((f % count) + 1, count - 1))), 1000 / fps);
    return () => clearInterval(t);
  }, [playing, loop, count, fps]);
  useEffect(() => {
    if (!loop && at === count - 1) setPlaying(false);
  }, [loop, at, count]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !img || !sheet) return;
    if (c.width !== size.w || c.height !== size.h) [c.width, c.height] = [size.w, size.h];
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.drawImage(img, (at % sheet.cols) * size.w, Math.floor(at / sheet.cols) * size.h, size.w, size.h, 0, 0, size.w, size.h);
  }, [img, sheet, at, size.w, size.h]);

  if (error) return <Note>Couldn't decode this image: {error}</Note>;
  if (!img || !sheet) return <Note busy>Slicing…</Note>;
  const stepBy = (d: number) => {
    setPlaying(false);
    setFrame((f) => ((f % count) + d + count) % count);
  };
  const play = () => {
    if (!playing && !loop && at === count - 1) setFrame(0);
    setPlaying(!playing);
  };
  const square = "flex size-[26px] items-center justify-center rounded-md bg-active text-fg-2 hover:text-fg";
  const pill = (on: boolean) => clsx(toggleChip(on), "flex items-center gap-1");
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <div className="relative min-h-0 w-full flex-1">
        <canvas
          ref={canvas}
          aria-label={`Frame ${at + 1} of ${count}`}
          className={clsx("absolute inset-0 h-full w-full object-contain", pixelated && "pixelated")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted" onDoubleClick={(e) => e.stopPropagation()}>
        {toggle}
        <button type="button" aria-label="Previous frame" title="Previous frame" onClick={() => stepBy(-1)} className={square}>
          <StepBack aria-hidden className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
          onClick={play}
          className="flex size-[26px] items-center justify-center rounded-full bg-accent text-accent-fg"
        >
          {playing ? <Pause aria-hidden className="size-3 fill-current" /> : <Play aria-hidden className="size-3 fill-current" />}
        </button>
        <button type="button" aria-label="Next frame" title="Next frame" onClick={() => stepBy(1)} className={square}>
          <StepForward aria-hidden className="size-3.5" />
        </button>
        <span className={clsx(chip, "tabular-nums")}>
          {at + 1} / {count}
        </span>
        <NumField label="Columns" value={sheet.cols} min={1} max={MAX_CELLS} onChange={(cols) => update({ cols })} />
        <span aria-hidden>×</span>
        <NumField label="Rows" value={sheet.rows} min={1} max={MAX_CELLS} onChange={(rows) => update({ rows })} />
        {full && (
          <>
            <span className="ml-2">frame</span>
            <NumField label="Frame width in pixels" value={size.w} min={1} max={w} onChange={(fw) => update(gridFor(w, h, fw, size.h))} />
            <span aria-hidden>×</span>
            <NumField label="Frame height in pixels" value={size.h} min={1} max={h} onChange={(fh) => update(gridFor(w, h, size.w, fh))} />
            <span className="ml-2">fps</span>
            <NumField label="Frames per second" value={fps} min={1} max={60} onChange={(v) => update({ fps: v })} />
            <button type="button" aria-pressed={loop} onClick={() => setLoop(!loop)} className={clsx(pill(loop), "ml-2")}>
              <Repeat aria-hidden className="size-3" /> Loop
            </button>
            <button type="button" aria-pressed={pixelated} title="Pixel-art scaling" onClick={() => setPixelated(!pixelated)} className={pill(pixelated)}>
              <Grid3x3 aria-hidden className="size-3" /> Pixel
            </button>
            <ExportFrames asset={asset} sheet={sheet} />
          </>
        )}
      </div>
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

// three.js and wavesurfer are most of the bundle, so these load on first use.
const AudioView = lazy(() => import("./AudioView"));
const ModelView = lazy(() => import("./ModelView"));

/** The preview for one asset. `full` is the full-screen stage; otherwise the compact side-panel stage. */
export function Viewer({ asset, pixelated, full = false }: { asset: Asset; pixelated: boolean; full?: boolean }) {
  switch (asset.kind) {
    case "image":
      // Keyed so per-asset state (zoom, Animate) never leaks into the next asset.
      return <ImageView key={asset.id} asset={asset} pixelated={pixelated} full={full} />;
    case "audio":
      return (
        <Suspense fallback={<Note busy>Loading audio…</Note>}>
          <AudioView asset={asset} full={full} />
        </Suspense>
      );
    case "model":
      return (
        <Suspense
          fallback={
            <div className={clsx("stripes w-full rounded-xl", full ? "h-full" : "h-[200px]")}>
              <Note busy>Loading model…</Note>
            </div>
          }
        >
          <ModelView asset={asset} full={full} />
        </Suspense>
      );
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
