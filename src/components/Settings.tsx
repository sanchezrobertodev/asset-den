import clsx from "clsx";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useAppUpdate } from "../appUpdate";
import { bytes } from "../lib/format";
import { forgetThumbnails } from "../lib/thumbs";
import { useStore } from "../store";
import { analyse, cancelAnalysis, pauseAnalysis } from "./Analysis";
import { Button, Label, Modal, Segmented } from "./ui";

const close = () => useStore.getState().setModal(null);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col border-t border-line-soft pt-3 pb-2 first:border-t-0 first:pt-0">
      <Label className="pb-1">{title}</Label>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-fg">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Link({ to, children }: { to: Parameters<typeof api.openLink>[0]; children: ReactNode }) {
  const setError = useStore((s) => s.setError);
  return (
    <Button size="sm" onClick={() => void api.openLink(to).catch(setError)}>
      {children} <ExternalLink aria-hidden className="size-3.5" />
    </Button>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx(
        "relative h-5 w-9 flex-none rounded-full border transition-colors duration-150",
        on ? "border-accent bg-accent" : "border-line-x bg-active",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute top-px left-px size-4 rounded-full transition-transform duration-150",
          on ? "translate-x-4 bg-accent-fg" : "bg-muted",
        )}
      />
    </button>
  );
}

/** App settings: appearance, ignored folders, the thumbnail cache, updates and version info. */
export function SettingsDialog() {
  const s = useStore();
  const updatesSupported = useAppUpdate((u) => u.supported);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);

  return (
    <Modal title="Settings" onClose={close} wide>
      <Section title="Appearance">
        <Row label="Theme">
          <Segmented
            label="Theme"
            value={s.theme}
            onChange={s.setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </Row>
        <Row label="Thumbnail size" hint="Card size in the grid. The slider above the grid changes it too.">
          <div className="flex flex-none items-center gap-2.5">
            <input
              type="range"
              aria-label="Thumbnail size"
              min={110}
              max={320}
              step={10}
              value={s.thumbSize}
              onChange={(e) => s.setThumbSize(Number(e.target.value))}
              className="w-32 accent-[var(--accent)]"
            />
            <span className="w-11 text-right font-mono text-xs text-muted">{s.thumbSize}px</span>
          </div>
        </Row>
        <Row label="Pixel-art scaling" hint="Enlarge images with sharp pixels instead of smoothing them.">
          <Switch label="Pixel-art scaling" on={s.pixelated} onChange={s.setPixelated} />
        </Row>
      </Section>
      <Section title="Library">
        <IgnoredFolders />
        <ImageAnalysis />
      </Section>
      <Section title="Backups">
        <Backups />
      </Section>
      <Section title="Storage">
        <ThumbnailCache />
      </Section>
      {updatesSupported && (
        <Section title="Updates">
          <Row label="Check for updates on launch" hint="Looks quietly a few seconds after start. Nothing installs without asking.">
            <Switch label="Check for updates on launch" on={s.checkUpdates} onChange={s.setCheckUpdates} />
          </Row>
        </Section>
      )}
      <Section title="About">
        <Row label={version ? `Asset Den ${version}` : "Asset Den"} hint="Open source, MIT License">
          <div className="flex gap-2">
            <Link to="releases">Releases</Link>
            <Link to="source">Source code</Link>
          </div>
        </Row>
        <Row label="Support Asset Den" hint="It's free. Tips keep it going.">
          <Link to="ko-fi">Ko-fi</Link>
        </Row>
      </Section>
    </Modal>
  );
}

function IgnoredFolders() {
  const { roots, scanning, rescan, setError } = useStore();
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    api.ignoredFolders().then(setNames, setError);
  }, [setError]);

  const save = async (next: string[]) => {
    try {
      setNames(await api.setIgnoredFolders(next));
      setChanged(true);
    } catch (e) {
      setError(e);
    }
  };
  const name = draft.trim();
  const invalid = /[\\/]/.test(name);
  const add = () => {
    if (!name || invalid) return;
    setDraft("");
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) void save([...names, name]);
  };
  const busy = Object.keys(scanning).length > 0;

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-col gap-0.5">
        <span id="ignored-label" className="text-fg">
          Ignored folders
        </span>
        <span className="text-xs text-muted">
          Folders with these names are skipped in every library folder, like hidden folders, node_modules and .meta files
          already are.
        </span>
      </div>
      <div className="focus-ring-within flex flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-card p-1.5">
        {names.map((n) => (
          <span key={n} className="flex h-6 items-center gap-1.5 rounded-md bg-line py-0 pr-1 pl-[9px] font-mono text-xs">
            {n}
            <button
              type="button"
              aria-label={`Stop ignoring ${n}`}
              onClick={(e) => {
                // The name goes away with its button; keep focus in the field.
                e.currentTarget.closest("div")?.querySelector("input")?.focus();
                void save(names.filter((x) => x !== n));
              }}
              className="flex size-4 items-center justify-center rounded text-muted hover:bg-line-x hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          aria-labelledby="ignored-label"
          aria-invalid={invalid}
          aria-describedby={invalid ? "ignored-error" : undefined}
          value={draft}
          maxLength={255}
          placeholder={names.length ? "Add another, press Enter" : "Folder name, like Backup or _old, then Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Backspace" && !draft && names.length) void save(names.slice(0, -1));
          }}
          className="h-6 min-w-[200px] flex-1 border-0 bg-transparent px-1 text-xs text-fg outline-none"
        />
      </div>
      {invalid && (
        <span id="ignored-error" className="text-xs text-danger">
          Enter one folder name, not a path.
        </span>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className={clsx("text-xs", changed ? "text-fg-2" : "text-muted")}>
          {changed ? "Saved. Rescan to apply it to files already in the library." : "Changes apply on the next rescan. Files stay on disk."}
        </span>
        <Button size="sm" disabled={!roots.length || busy} onClick={() => roots.forEach((r) => void rescan(r.id))}>
          {busy ? "Rescanning…" : "Rescan now"}
        </Button>
      </div>
    </div>
  );
}

/** Images a pass analyses per second, for the estimate: 320 measured on mixed generated images with 4 workers (16
 * threads); real textures decode slower and smaller CPUs get fewer workers. */
const PER_SECOND = 150;

function duration(images: number) {
  const min = Math.round(images / PER_SECOND / 60);
  if (min < 1) return "under a minute";
  if (min < 90) return `about ${min} minute${min === 1 ? "" : "s"}`;
  return `about ${Math.round(min / 60)} hours`;
}

function ImageAnalysis() {
  const a = useStore((s) => s.analysis);
  const left = a.total - a.done;
  const n = (x: number) => x.toLocaleString();
  return (
    <>
      <Row
        label="Image analysis"
        hint={
          <>
            <span className="font-mono">{n(a.done)}</span> of <span className="font-mono">{n(a.total)}</span> images analysed for Find similar and
            search by colour.{" "}
            {left > 0 && !a.running
              ? `The other ${n(left)} take ${duration(left)}, on spare CPU. Images you browse are analysed as you go.`
              : "Images you browse are analysed as you go."}
          </>
        }
      >
        <div className="flex flex-none gap-2">
          {/* The same first button throughout, so focus stays on it when it changes. */}
          <Button size="sm" disabled={!a.running && left <= 0} onClick={() => (a.running ? pauseAnalysis(!a.paused) : analyse())}>
            {a.running ? (a.paused ? "Resume" : "Pause") : "Analyse images"}
          </Button>
          {a.running && (
            <Button
              size="sm"
              onClick={(e) => {
                // Cancel goes away; keep focus on the button next to it.
                (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
                cancelAnalysis();
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </Row>
      <Row
        label="Keep new and changed images analysed"
        hint="Analyses images as they're added or changed while Asset Den is open. Turns on by itself after the first full analysis."
      >
        <Switch label="Keep new and changed images analysed" on={a.keep} onChange={(on) => void api.setKeepAnalysed(on).catch(useStore.getState().setError)} />
      </Row>
    </>
  );
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function Backups() {
  const { setError, showToast } = useStore();
  const [busy, setBusy] = useState(false);
  // A backup picked to restore, waiting for confirmation.
  const [restoring, setRestoring] = useState<string | null>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!restoring) return;
    const focus = () => confirm.current?.focus();
    focus();
    // The file dialog can still hold focus here; when the window gets it back, the webview would refocus elsewhere.
    window.addEventListener("focus", focus, { once: true });
    return () => window.removeEventListener("focus", focus);
  }, [restoring]);

  const backUp = async () => {
    const dest = await api.pickFolder("Save a library backup to…");
    if (!dest) return;
    setBusy(true);
    try {
      showToast(`Saved ${fileName(await api.backupLibrary(dest))} in ${dest}.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const pick = async () => {
    try {
      setRestoring(await api.pickBackup(await api.backupsFolder()));
    } catch (e) {
      setError(e);
    }
  };
  const restore = async (path: string) => {
    setBusy(true);
    try {
      await api.restoreLibrary(path); // Restarts the app when it works.
    } catch (e) {
      setError(e);
      setBusy(false);
      setRestoring(null);
    }
  };

  return (
    <>
      {restoring ? (
        <Row
          label={`Restore ${fileName(restoring)}?`}
          hint="It replaces your library: folders, tags, ratings, notes, collections and sprite grids. The current library is saved in the backups folder first. Asset Den restarts to finish."
        >
          <div className="flex flex-none gap-2">
            <Button size="sm" disabled={busy} onClick={() => setRestoring(null)}>
              Cancel
            </Button>
            <Button size="sm" ref={confirm} variant="invert" disabled={busy} onClick={() => void restore(restoring)}>
              {busy ? "Restoring…" : "Restore and restart"}
            </Button>
          </div>
        </Row>
      ) : (
        <Row label="Library backup" hint="Folders, tags, ratings, notes, collections and sprite grids. Your asset files aren't included.">
          <div className="flex flex-none gap-2">
            <Button size="sm" disabled={busy} onClick={() => void backUp()}>
              {busy ? "Backing up…" : "Back up…"}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void pick()}>
              Restore…
            </Button>
          </div>
        </Row>
      )}
      <Row label="Automatic backups" hint="One a day when Asset Den opens. The last 5 are kept.">
        <Button size="sm" onClick={() => void api.backupsFolder().then(api.revealPath).catch(setError)}>
          Show folder
        </Button>
      </Row>
    </>
  );
}

function ThumbnailCache() {
  const { setError, showToast } = useStore();
  const [size, setSize] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    api.cacheSize().then(setSize, setError);
  }, [setError]);

  const clear = async () => {
    setClearing(true);
    try {
      const before = size;
      await api.clearThumbnailCache();
      forgetThumbnails();
      setSize(await api.cacheSize());
      showToast(`Cleared ${before === null ? "the thumbnail cache" : bytes(before)}. Thumbnails are rebuilt as you browse.`);
    } catch (e) {
      setError(e);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Row
      label="Thumbnail cache"
      hint={
        <>
          <span className="font-mono">{size === null ? "…" : bytes(size)}</span> of thumbnails and previews Asset Den made. Your
          asset files aren't touched.
        </>
      }
    >
      <Button size="sm" disabled={clearing || !size} onClick={() => void clear()}>
        {clearing ? "Clearing…" : "Clear thumbnail cache"}
      </Button>
    </Row>
  );
}
