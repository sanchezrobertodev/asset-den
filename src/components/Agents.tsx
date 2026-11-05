import { useId } from "react";
import { useAgents } from "../agent/bridge";
import { agentName } from "../agent/run";
import { t } from "../lib/i18n";
import { useStore } from "../store";
import { Button } from "./ui";

/**
 * "Allow Claude Code to see your library?", for the oldest app waiting, over everything else. It never takes focus,
 * so a key pressed for something else can't answer it; Settings › AI agents asks the same inside its dialog.
 */
export function AgentAsk() {
  const q = useAgents((s) => s.questions[0]);
  const answer = useAgents((s) => s.answer);
  const inSettings = useStore((s) => s.modal === "settings");
  const id = useId();
  if (!q || inSettings) return null;
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      className="fixed top-4 right-4 z-[80] w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-line-x bg-field p-4 shadow-[0_24px_60px_-16px_rgba(0,0,0,.6)]"
    >
      <h2 id={`${id}-title`} className="text-[14px] font-semibold text-fg">
        {t("agents.askTitle", { name: agentName(q.name) })}
      </h2>
      {/* What the app calls itself, as it said it. */}
      <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
        {q.name} {q.version}
      </p>
      <p id={`${id}-body`} className="mt-2 text-xs text-muted">
        {t("agents.askBody")}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" onClick={() => answer(q.name, false)}>
          {t("agents.deny")}
        </Button>
        <Button size="sm" variant="accent" onClick={() => answer(q.name, true)}>
          {t("agents.allow")}
        </Button>
      </div>
    </div>
  );
}
