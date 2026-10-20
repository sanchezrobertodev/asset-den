import { CircleAlert, CircleArrowUp, CircleCheck, LoaderCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { DownloadProgress } from "../api";
import { openUpdates, useAppUpdate } from "../appUpdate";
import { Button, Modal } from "./ui";

function percent(p: DownloadProgress | null): number | null {
  return p?.total ? Math.min(100, Math.round((p.downloaded / p.total) * 100)) : null;
}

function progressText(p: DownloadProgress | null): string {
  if (!p) return "Starting download…";
  const mb = (n: number) => (n / 1_000_000).toFixed(1);
  const pct = percent(p);
  if (pct === 100) return "Installing…";
  return p.total ? `Downloading ${mb(p.downloaded)} of ${mb(p.total)} MB (${pct}%)` : `Downloading ${mb(p.downloaded)} MB`;
}

/** `code` and **bold**; links and other Markdown show as plain text. */
function inline(text: string): ReactNode[] {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?kbd>/g, "")
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
        <code key={i} className="rounded bg-active px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      ) : part.startsWith("**") && part.endsWith("**") && part.length > 3 ? (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      ),
    );
}

/** Renders a Keep a Changelog section: headings, bullet lists (with wrapped lines) and paragraphs. */
export function ReleaseNotes({ notes }: { notes: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="mb-3 list-disc space-y-1 pl-5">
        {list.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    if (line && list.length && /^\s+/.test(raw)) {
      list[list.length - 1] += ` ${line}`;
      continue;
    }
    flush();
    if (heading)
      blocks.push(
        <h3 key={blocks.length} className="mb-1.5 text-[11px] font-medium tracking-[.06em] text-faint uppercase">
          {inline(heading[1])}
        </h3>,
      );
    else if (line)
      blocks.push(
        <p key={blocks.length} className="mb-3">
          {inline(line)}
        </p>,
      );
  }
  flush();
  return <div className="leading-relaxed text-fg-2">{blocks}</div>;
}

/** Sidebar-footer notice when the launch check found a newer version. */
export function UpdateNotice() {
  const { phase, update } = useAppUpdate();
  if ((phase !== "available" && phase !== "installing") || !update) return null;
  return (
    <button
      type="button"
      onClick={openUpdates}
      className="flex items-center gap-2 rounded-lg bg-accent/15 px-2.5 py-2 text-left text-xs text-fg hover:bg-accent/25"
    >
      <CircleArrowUp aria-hidden className="size-4 flex-none text-accent" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">Asset Den {update.version}</span> is available
      </span>
      <span className="font-semibold text-accent">View</span>
    </button>
  );
}

export function UpdateDialog() {
  const { dialogOpen, phase, update, progress, error, installFailed, check, install, setDialogOpen } = useAppUpdate();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, () => setVersion(null));
  }, []);
  if (!dialogOpen) return null;
  const close = () => phase !== "installing" && setDialogOpen(false);
  const pct = percent(progress);

  return (
    <Modal
      title={phase === "available" || phase === "installing" ? `Asset Den ${update?.version}` : "Updates"}
      onClose={close}
      footer={
        phase === "available" ? (
          <>
            <Button onClick={close}>Later</Button>
            <Button variant="accent" data-autofocus onClick={() => void install()}>
              Install &amp; restart
            </Button>
          </>
        ) : phase === "error" ? (
          <>
            <Button onClick={close}>Close</Button>
            <Button variant="invert" data-autofocus onClick={() => void (installFailed ? install() : check())}>
              Try again
            </Button>
          </>
        ) : phase !== "installing" ? (
          <Button data-autofocus onClick={close}>
            Close
          </Button>
        ) : undefined
      }
    >
      {phase === "checking" && (
        <p role="status" className="flex items-center gap-2">
          <LoaderCircle aria-hidden className="size-4 animate-spin" /> Checking for a new version…
        </p>
      )}
      {phase === "upToDate" && (
        <p role="status" className="flex items-center gap-2">
          <CircleCheck aria-hidden className="size-4 text-accent" />
          You have the latest version{version ? ` (${version})` : ""}.
        </p>
      )}
      {phase === "error" && (
        <p role="alert" className="flex items-start gap-2 text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 flex-none" />
          <span>
            {installFailed ? "Couldn't install the update" : "Couldn't check for updates"}: {error}
          </span>
        </p>
      )}
      {(phase === "available" || phase === "installing") && update && (
        <div className="flex flex-col gap-3">
          <p className="text-muted">
            You have {update.currentVersion}. Updates are signed, and Asset Den verifies the signature before installing.
          </p>
          {phase === "installing" ? (
            <div role="status" className="flex flex-col gap-2">
              <div
                role="progressbar"
                aria-label="Update download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct ?? undefined}
                className="h-1.5 w-full overflow-hidden rounded-full bg-active"
              >
                <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <span className="text-xs text-muted">{progressText(progress)}. Asset Den restarts when it's done.</span>
            </div>
          ) : update.notes ? (
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line bg-card px-4 pt-3">
              <ReleaseNotes notes={update.notes} />
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
