import clsx from "clsx";
import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { useAppUpdate } from "../appUpdate";
import { bytes } from "../lib/format";
import { forgetThumbnails } from "../lib/thumbs";
import { useStore } from "../store";
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
        <Row label={version ? `Asset Den ${version}` : "Asset Den"} hint="MIT License">
          <Button size="sm" onClick={() => void api.openReleases().catch(s.setError)}>
            Releases <ExternalLink aria-hidden className="size-3.5" />
          </Button>
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
      <div className="flex flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-card p-1.5">
        {names.map((n) => (
          <span key={n} className="flex h-6 items-center gap-1.5 rounded-md bg-line py-0 pr-1 pl-[9px] font-mono text-xs">
            {n}
            <button
              type="button"
              aria-label={`Stop ignoring ${n}`}
              onClick={() => void save(names.filter((x) => x !== n))}
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
