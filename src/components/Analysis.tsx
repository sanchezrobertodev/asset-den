import clsx from "clsx";
import { Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { focusAssets, IconButton } from "./ui";

const n = (x: number) => x.toLocaleString();
const run = (p: Promise<unknown>) => void p.catch(useStore.getState().setError);

export const analyse = () => run(api.analyseImages());
export const pauseAnalysis = (paused: boolean) => run(api.pauseAnalysis(paused));
export const cancelAnalysis = () => run(api.cancelAnalysis());

/**
 * The running analysis pass under the folder list, with Pause and Cancel. Screen readers hear when it starts, pauses
 * and ends, not every count.
 */
export function AnalysisProgress() {
  const a = useStore((s) => s.analysis);
  const was = useRef(a);
  const [said, setSaid] = useState("");
  useEffect(() => {
    const before = was.current;
    was.current = a;
    if (a.running && !before.running) setSaid("Analysing images…");
    else if (a.running && a.paused !== before.paused) setSaid(a.paused ? "Image analysis paused." : "Image analysis resumed.");
    else if (!a.running && before.running)
      setSaid(a.done >= a.total ? `Image analysis finished. ${n(a.total)} images analysed.` : `Image analysis stopped. ${n(a.done)} of ${n(a.total)} images analysed.`);
  }, [a]);

  return (
    <>
      <p role="status" className="sr-only">
        {said}
      </p>
      {a.running && (
        <div className="flex flex-col rounded-lg bg-hover py-1 pr-0.5 pl-2.5 text-xs">
          <div className="flex items-center">
            <span className="min-w-0 flex-1 truncate text-fg">{a.paused ? "Analysis paused" : "Analysing images"}</span>
            <IconButton label={a.paused ? "Resume image analysis" : "Pause image analysis"} onClick={() => pauseAnalysis(!a.paused)}>
              {a.paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
            </IconButton>
            <IconButton
              label="Cancel image analysis"
              onClick={() => {
                // This line goes away with its buttons.
                focusAssets();
                cancelAnalysis();
              }}
            >
              <X aria-hidden className="size-3.5" />
            </IconButton>
          </div>
          <span className="font-mono text-[11px] text-muted">
            {n(a.done)} of {n(a.total)}
          </span>
          <div aria-hidden className="mt-1.5 mr-2 mb-1.5 h-[3px] overflow-hidden rounded-full bg-line-soft">
            <div className="h-full bg-accent" style={{ width: `${a.total ? (100 * a.done) / a.total : 0}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

/** Where results depend on analysis (Find similar, colour search): what they cover, and a way to analyse the rest. */
export function AnalysisNote({ className }: { className?: string }) {
  const a = useStore((s) => s.analysis);
  const left = a.total - a.done;
  if (left <= 0) return null;
  return (
    <div className={clsx("flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-muted", className)}>
      <span>
        {n(left)} {left === 1 ? "image isn't" : "images aren't"} analysed yet — results only cover the {n(a.done)} that {a.done === 1 ? "is" : "are"}.
      </span>
      {a.running && !a.paused ? (
        <span>Analysing now…</span>
      ) : (
        <button type="button" onClick={() => (a.running ? pauseAnalysis(false) : analyse())} className="font-semibold text-accent hover:underline">
          {a.running ? "Resume analysis" : "Analyse now"}
        </button>
      )}
    </div>
  );
}
