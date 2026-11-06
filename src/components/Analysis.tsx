import clsx from "clsx";
import { LoaderCircle, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { t } from "../lib/i18n";
import { useStore } from "../store";
import { focusAssets, IconButton } from "./ui";

const run = (p: Promise<unknown>) => void p.catch(useStore.getState().setError);

export const analyse = () => run(api.analyseImages());
export const pauseAnalysis = (paused: boolean) => run(api.pauseAnalysis(paused));
export const cancelAnalysis = () => run(api.cancelAnalysis());

/**
 * The running analysis pass under the folder list, with Pause and Cancel. Screen readers hear when it starts, pauses
 * and ends, not every count.
 */
/** `compact`: just a spinner that says what runs, for the sidebar's rail. */
export function AnalysisProgress({ compact }: { compact?: boolean }) {
  const a = useStore((s) => s.analysis);
  const was = useRef(a);
  const [said, setSaid] = useState("");
  useEffect(() => {
    const before = was.current;
    was.current = a;
    if (a.running && !before.running) setSaid(t("analysis.started"));
    else if (a.running && a.paused !== before.paused) setSaid(a.paused ? t("analysis.paused") : t("analysis.resumed"));
    else if (!a.running && before.running)
      setSaid(a.done >= a.total ? t("analysis.finished", { count: a.total }) : t("analysis.stopped", { count: a.total, done: a.done }));
  }, [a]);

  return (
    <>
      <p role="status" className="sr-only">
        {said}
      </p>
      {a.running && compact && (
        <span title={a.paused ? t("analysis.pausedTitle") : t("analysis.runningTitle")} className="flex size-9 items-center justify-center text-muted">
          <LoaderCircle role="img" aria-label={a.paused ? t("analysis.pausedTitle") : t("analysis.runningTitle")} className={clsx("size-4", !a.paused && "animate-spin")} />
        </span>
      )}
      {a.running && !compact && (
        <div className="flex flex-col rounded-lg bg-hover py-1 pr-0.5 pl-2.5 text-xs">
          <div className="flex items-center">
            <span className="min-w-0 flex-1 truncate text-fg">{a.paused ? t("analysis.pausedTitle") : t("analysis.runningTitle")}</span>
            <IconButton label={a.paused ? t("analysis.resume") : t("analysis.pause")} onClick={() => pauseAnalysis(!a.paused)}>
              {a.paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
            </IconButton>
            <IconButton
              label={t("analysis.cancel")}
              onClick={() => {
                // This line goes away with its buttons.
                focusAssets();
                cancelAnalysis();
              }}
            >
              <X aria-hidden className="size-3.5" />
            </IconButton>
          </div>
          <span className="font-mono text-[11px] text-muted">{t("analysis.progress", { done: a.done, total: a.total })}</span>
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
      <span>{t("analysis.pending", { count: left, covered: t("analysis.covered", { count: a.done }) })}</span>
      {a.running && !a.paused ? (
        <span>{t("analysis.analysingNow")}</span>
      ) : (
        <button type="button" onClick={() => (a.running ? pauseAnalysis(false) : analyse())} className="font-semibold text-accent hover:underline">
          {a.running ? t("analysis.resumeAnalysis") : t("analysis.analyseNow")}
        </button>
      )}
    </div>
  );
}
