import clsx from "clsx";
import { Pause, Play, Repeat } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { errorText, fileUrl } from "../api";
import { onThemeColors, reducedMotion, themeColor } from "../lib/prefs";
import { useStore } from "../store";
import type { Asset } from "../types";
import { toggleChip, usePreviewFailure } from "./Viewers";

// Its own chunk: wavesurfer loads on the first audio preview, not at startup.
export default function AudioView({ asset, full }: { asset: Asset; full: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const fail = usePreviewFailure();
  const loop = useStore((s) => s.audioLoop);
  const setLoop = useStore((s) => s.setAudioLoop);

  useEffect(() => {
    if (!box.current) return;
    setPlaying(false);
    let live = true;
    const w = WaveSurfer.create({
      container: box.current,
      url: fileUrl(asset.path),
      height: full ? 180 : 90,
      waveColor: themeColor("--line-x"),
      progressColor: themeColor("--accent"),
      cursorWidth: 0,
      barWidth: full ? 4 : 3,
      barGap: full ? 3 : 2,
      barRadius: 1,
    });
    ws.current = w;
    w.on("ready", (d) => {
      setTime({ now: 0, total: d });
      if (full && !reducedMotion()) void w.play().catch(() => {});
    });
    w.on("timeupdate", (t) => setTime((x) => ({ ...x, now: t })));
    w.on("play", () => setPlaying(true));
    w.on("pause", () => setPlaying(false));
    // Read at the end rather than captured, so toggling Loop doesn't reload the waveform.
    w.on("finish", () => useStore.getState().audioLoop && void w.play(0).catch(() => {}));
    w.on("error", (e) => live && fail(`Can't play this file here: ${errorText(e)}`));
    return () => {
      live = false;
      w.destroy();
    };
  }, [asset.id, asset.path, asset.mtime, full, fail]);

  // A theme or accent change repaints the waveform without reloading the audio.
  useEffect(() => onThemeColors(() => ws.current?.setOptions({ waveColor: themeColor("--line-x"), progressColor: themeColor("--accent") })), []);

  const fmt = (s: number) => (s < 10 && s % 1 ? `0:0${s.toFixed(1)}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
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
        <button
          type="button"
          aria-pressed={loop}
          title="Play again from the start when it ends"
          onClick={() => setLoop(!loop)}
          className={clsx(toggleChip(loop), "ml-auto flex items-center gap-1")}
        >
          <Repeat aria-hidden className="size-3" /> Loop
        </button>
      </div>
    </div>
  );
}
