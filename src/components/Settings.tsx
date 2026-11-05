import clsx from "clsx";
import { getVersion } from "@tauri-apps/api/app";
import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useAgents } from "../agent/bridge";
import { agentName } from "../agent/run";
import { api } from "../api";
import { useAppUpdate } from "../appUpdate";
import { baseName } from "../lib/format";
import { ago, bytes } from "../lib/fmt";
import { locales, t } from "../lib/i18n";
import type { Theme } from "../lib/prefs";
import { ACCENTS, THEMES, accentName, themeById, themeName, type ThemeId } from "../lib/themes";
import { forgetThumbnails } from "../lib/thumbs";
import { languageName, systemLanguage } from "../locales";
import { useStore } from "../store";
import { analyse, cancelAnalysis, pauseAnalysis } from "./Analysis";
import { Button, Label, Modal, Segmented, T } from "./ui";

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

/** The UI language; System follows the OS languages. Changing it reloads the window. */
function LanguagePicker() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  return (
    <select
      aria-label={t("settings.appearance.language")}
      value={locales().includes(language) ? language : "system"}
      onChange={(e) => setLanguage(e.target.value)}
      className="h-[30px] flex-none rounded-lg border border-line-strong bg-field px-1.5 text-fg"
    >
      <option value="system">{t("settings.appearance.languageSystem", { name: languageName(systemLanguage) })}</option>
      {locales().map((code) => (
        <option key={code} value={code} lang={code}>
          {languageName(code)}
        </option>
      ))}
    </select>
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

/** Arrow keys move the choice in a radio group, as native radios do; only the chosen item is in the Tab order. */
function radioKeys<T>(items: T[], value: T, onChange: (v: T) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    onChange(items[(items.indexOf(value) + step + items.length) % items.length]);
    const group = e.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
}

/** A small picture of a theme: sidebar, two lines of text and an accent button, in that theme's own colours. */
function ThemePreview({ id }: { id: ThemeId }) {
  const theme = themeById(id);
  return (
    <span data-theme={theme.id} data-scheme={theme.scheme} className="flex h-full min-w-0 flex-1 bg-bg">
      <span className="w-1/4 border-r border-line bg-panel" />
      <span className="flex flex-1 flex-col justify-center gap-1 px-2">
        <span className="h-1.5 w-3/4 rounded-full bg-fg" />
        <span className="h-1.5 w-1/2 rounded-full bg-muted" />
        <span className="mt-0.5 h-2 w-6 rounded-sm bg-accent" />
      </span>
    </span>
  );
}

const THEME_CHOICES: Theme[] = ["system", ...THEMES.map((theme) => theme.id)];

function ThemePicker() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label={t("settings.appearance.theme")} onKeyDown={radioKeys(THEME_CHOICES, theme, setTheme)} className="grid grid-cols-4 gap-2.5">
      {THEME_CHOICES.map((id) => {
        const on = id === theme;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setTheme(id)}
            className={clsx(
              "flex min-w-0 flex-col gap-1.5 rounded-[10px] p-1.5 text-left text-xs transition-colors duration-150",
              on ? "text-fg outline-2 outline-offset-2 outline-accent" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            <span className="keep-color flex h-12 overflow-hidden rounded-md border border-line-strong">
              {id === "system" ? (
                <>
                  <ThemePreview id="light" />
                  <ThemePreview id="dark" />
                </>
              ) : (
                <ThemePreview id={id} />
              )}
            </span>
            <span className="line-clamp-2 px-0.5">{themeName(id)}</span>
          </button>
        );
      })}
    </div>
  );
}

function AccentPicker() {
  const accent = useStore((s) => s.accent);
  const setAccent = useStore((s) => s.setAccent);
  return (
    <div
      role="radiogroup"
      aria-label={t("settings.appearance.accent")}
      onKeyDown={radioKeys(
        ACCENTS.map((a) => a.id),
        accent,
        setAccent,
      )}
      className="flex flex-none gap-2"
    >
      {ACCENTS.map((a) => {
        const on = a.id === accent;
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={accentName(a.id)}
            title={accentName(a.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => setAccent(a.id)}
            style={{ "--accent-h": a.h, "--accent-c-light": a.light, "--accent-c-dark": a.dark } as CSSProperties}
            className={clsx(
              "accent-swatch keep-color flex size-6 items-center justify-center rounded-full text-accent-fg",
              on && "outline-2 outline-offset-2 outline-fg",
            )}
          >
            {on && <Check aria-hidden className="size-3.5" />}
          </button>
        );
      })}
    </div>
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
    <Modal title={t("settings.title")} onClose={close} wide>
      <Section title={t("settings.sections.appearance")}>
        <Row label={t("settings.appearance.language")} hint={t("settings.appearance.languageHint")}>
          <LanguagePicker />
        </Row>
        <div className="flex flex-col gap-2.5 py-2">
          <span className="text-fg">{t("settings.appearance.theme")}</span>
          <ThemePicker />
        </div>
        <Row label={t("settings.appearance.accent")} hint={t("settings.appearance.accentHint")}>
          <AccentPicker />
        </Row>
        <Row label={t("settings.appearance.kindLabels")} hint={t("settings.appearance.kindLabelsHint")}>
          <Segmented
            label={t("settings.appearance.kindLabels")}
            value={s.kindLabels}
            onChange={s.setKindLabels}
            options={[
              { value: "both", label: t("settings.appearance.kindLabelsBoth") },
              { value: "icon", label: t("settings.appearance.kindLabelsIcon") },
              { value: "name", label: t("settings.appearance.kindLabelsName") },
            ]}
          />
        </Row>
        <Row label={t("settings.appearance.startView")} hint={t("settings.appearance.startViewHint")}>
          <Segmented
            label={t("settings.appearance.startView")}
            value={s.startView}
            onChange={s.setStartView}
            options={[
              { value: "home", label: t("settings.appearance.startViewHome") },
              { value: "library", label: t("settings.appearance.startViewLibrary") },
            ]}
          />
        </Row>
        <Row label={t("settings.appearance.thumbSize")} hint={t("settings.appearance.thumbSizeHint")}>
          <div className="flex flex-none items-center gap-2.5">
            <input
              type="range"
              aria-label={t("settings.appearance.thumbSize")}
              min={110}
              max={320}
              step={10}
              value={s.thumbSize}
              onChange={(e) => s.setThumbSize(Number(e.target.value))}
              className="w-32 accent-[var(--accent)]"
            />
            <span className="w-11 text-right font-mono text-xs text-muted">{t("settings.appearance.thumbSizeValue", { size: s.thumbSize })}</span>
          </div>
        </Row>
        <Row label={t("settings.appearance.pixelated")} hint={t("settings.appearance.pixelatedHint")}>
          <Switch label={t("settings.appearance.pixelated")} on={s.pixelated} onChange={s.setPixelated} />
        </Row>
      </Section>
      <Section title={t("settings.sections.library")}>
        <IgnoredFolders />
        <ImageAnalysis />
      </Section>
      <Section title={t("agents.title")}>
        <Agents />
      </Section>
      <Section title={t("settings.sections.backups")}>
        <Backups />
      </Section>
      <Section title={t("settings.sections.storage")}>
        <ThumbnailCache />
      </Section>
      {updatesSupported && (
        <Section title={t("settings.sections.updates")}>
          <Row label={t("settings.updates.checkOnLaunch")} hint={t("settings.updates.checkOnLaunchHint")}>
            <Switch label={t("settings.updates.checkOnLaunch")} on={s.checkUpdates} onChange={s.setCheckUpdates} />
          </Row>
        </Section>
      )}
      <Section title={t("settings.sections.about")}>
        <Row label={version ? t("settings.about.version", { version }) : "Mimikit"} hint={t("settings.about.license")}>
          <div className="flex gap-2">
            <Link to="releases">{t("settings.about.releases")}</Link>
            <Link to="source">{t("settings.about.source")}</Link>
          </div>
        </Row>
        <Row label={t("settings.about.support")} hint={t("settings.about.supportHint")}>
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
          {t("settings.ignored.title")}
        </span>
        <span className="text-xs text-muted">{t("settings.ignored.hint")}</span>
      </div>
      <div className="focus-ring-within flex flex-wrap items-center gap-1.5 rounded-[9px] border border-line-strong bg-card p-1.5">
        {names.map((n) => (
          <span key={n} className="flex h-6 items-center gap-1.5 rounded-md bg-active py-0 pr-1 pl-[9px] font-mono text-xs inset-ring-1 inset-ring-line">
            {n}
            <button
              type="button"
              aria-label={t("settings.ignored.remove", { name: n })}
              onClick={(e) => {
                // The name goes away with its button; keep focus in the field.
                e.currentTarget.closest("div")?.querySelector("input")?.focus();
                void save(names.filter((x) => x !== n));
              }}
              className="flex size-4 items-center justify-center rounded text-muted hover:text-fg hover:inset-ring-1 hover:inset-ring-line-x"
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
          placeholder={names.length ? t("settings.ignored.addAnother") : t("settings.ignored.placeholder")}
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
          {t("settings.ignored.invalid")}
        </span>
      )}
      <div className="flex items-center justify-between gap-4">
        <span className={clsx("text-xs", changed ? "text-fg-2" : "text-muted")}>
          {changed ? t("settings.ignored.saved") : t("settings.ignored.pending")}
        </span>
        <Button size="sm" disabled={!roots.length || busy} onClick={() => roots.forEach((r) => void rescan(r.id))}>
          {busy ? t("settings.ignored.rescanning") : t("settings.ignored.rescan")}
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
  if (min < 1) return t("settings.analysis.underMinute");
  if (min < 90) return t("settings.analysis.minutes", { count: min });
  return t("settings.analysis.hours", { count: Math.round(min / 60) });
}

function ImageAnalysis() {
  const a = useStore((s) => s.analysis);
  const left = a.total - a.done;
  return (
    <>
      <Row
        label={t("settings.analysis.title")}
        hint={
          <>
            <T k="settings.analysis.progress" vars={{ done: a.done, count: a.total }} tags={[<span className="font-mono" />]} />{" "}
            {left > 0 && !a.running
              ? t("settings.analysis.remaining", { count: left, time: duration(left) })
              : t("settings.analysis.asYouGo")}
          </>
        }
      >
        <div className="flex flex-none gap-2">
          {/* The same first button throughout, so focus stays on it when it changes. */}
          <Button size="sm" disabled={!a.running && left <= 0} onClick={() => (a.running ? pauseAnalysis(!a.paused) : analyse())}>
            {a.running ? (a.paused ? t("settings.analysis.resume") : t("settings.analysis.pause")) : t("settings.analysis.analyse")}
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
              {t("settings.cancel")}
            </Button>
          )}
        </div>
      </Row>
      <Row label={t("settings.analysis.keep")} hint={t("settings.analysis.keepHint")}>
        <Switch label={t("settings.analysis.keep")} on={a.keep} onChange={(on) => void api.setKeepAnalysed(on).catch(useStore.getState().setError)} />
      </Row>
    </>
  );
}

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
    const dest = await api.pickFolder(t("settings.backups.pickTitle"));
    if (!dest) return;
    setBusy(true);
    try {
      showToast(t("settings.backups.saved", { name: baseName(await api.backupLibrary(dest)), folder: dest }));
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
        <Row label={t("settings.backups.restoreTitle", { name: baseName(restoring) })} hint={t("settings.backups.restoreHint")}>
          <div className="flex flex-none gap-2">
            <Button size="sm" disabled={busy} onClick={() => setRestoring(null)}>
              {t("settings.cancel")}
            </Button>
            <Button size="sm" ref={confirm} variant="invert" disabled={busy} onClick={() => void restore(restoring)}>
              {busy ? t("settings.backups.restoring") : t("settings.backups.restoreRestart")}
            </Button>
          </div>
        </Row>
      ) : (
        <Row label={t("settings.backups.library")} hint={t("settings.backups.libraryHint")}>
          <div className="flex flex-none gap-2">
            <Button size="sm" disabled={busy} onClick={() => void backUp()}>
              {busy ? t("settings.backups.backingUp") : t("settings.backups.backUp")}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void pick()}>
              {t("settings.backups.restore")}
            </Button>
          </div>
        </Row>
      )}
      <Row label={t("settings.backups.auto")} hint={t("settings.backups.autoHint")}>
        <Button size="sm" onClick={() => void api.backupsFolder().then(api.revealPath).catch(setError)}>
          {t("settings.backups.showFolder")}
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
      showToast(before === null ? t("settings.cache.clearedCache") : t("settings.cache.cleared", { size: bytes(before) }));
    } catch (e) {
      setError(e);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Row
      label={t("settings.cache.title")}
      hint={<T k="settings.cache.hint" vars={{ size: size === null ? "…" : bytes(size) }} tags={[<span className="font-mono" />]} />}
    >
      <Button size="sm" disabled={clearing || !size} onClick={() => void clear()}>
        {clearing ? t("settings.cache.clearing") : t("settings.cache.clear")}
      </Button>
    </Row>
  );
}

/** A setup command or config snippet, with Copy. */
function Setup({ label, text }: { label: string; text: string }) {
  const { setError, showToast } = useStore();
  const copy = () => navigator.clipboard.writeText(text).then(() => showToast(t("agents.copied")), () => setError(t("agents.copyFailed")));
  return (
    <div className="flex flex-col gap-1.5 py-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line-soft bg-active px-2.5 py-1.5 font-mono text-[11.5px] text-fg-2 select-all">
          {text}
        </pre>
        <Button size="sm" onClick={() => void copy()}>
          {t("agents.copy")}
        </Button>
      </div>
    </div>
  );
}

/** Settings › AI agents: the switch, how to connect an agent app, and who's connected (src/agent/bridge.ts). */
function Agents() {
  const a = useAgents();
  const exe = a.exe ?? "mimikit";
  const now = Date.now();
  return (
    <>
      <Row label={t("agents.switch")} hint={a.on ? `${t("agents.switchHint")} ${t("agents.offNote")}` : t("agents.switchHint")}>
        <Switch label={t("agents.switch")} on={a.on} onChange={(on) => void a.setOn(on)} />
      </Row>
      {a.on && (
        <>
          {a.questions.map((q) => (
            <Row key={q.name} label={t("agents.askTitle", { name: agentName(q.name) })} hint={t("agents.askBody")}>
              <div className="flex flex-none gap-2">
                <Button size="sm" onClick={() => a.answer(q.name, false)}>
                  {t("agents.deny")}
                </Button>
                <Button size="sm" variant="accent" onClick={() => a.answer(q.name, true)}>
                  {t("agents.allow")}
                </Button>
              </div>
            </Row>
          ))}
          <Setup label={t("agents.claudeCode")} text={`claude mcp add --scope user mimikit -- "${exe}" mcp`} />
          <Setup label={t("agents.claudeDesktop")} text={JSON.stringify({ mcpServers: { mimikit: { command: exe, args: ["mcp"] } } }, null, 2)} />
          <p className="pb-2 text-xs text-muted">{t("agents.other")}</p>
          <span className="pt-2 text-fg">{t("agents.connected")}</span>
          {a.sessions.length ? (
            a.sessions.map((x) => (
              <Row
                key={x.pid}
                label={`${agentName(x.name)} ${x.version}`}
                hint={x.paused ? t("agents.paused") : t("agents.calls", { count: x.calls, ago: ago(x.last, now) })}
              >
                <div className="flex flex-none gap-2">
                  <Button size="sm" onClick={() => a.pause(x.pid, !x.paused)}>
                    {x.paused ? t("agents.resume") : t("agents.pause")}
                  </Button>
                  <Button size="sm" onClick={() => a.disconnect(x.pid)}>
                    {t("agents.disconnect")}
                  </Button>
                </div>
              </Row>
            ))
          ) : (
            <p className="py-2 text-xs text-muted">{t("agents.none")}</p>
          )}
          {a.allowed.map((name) => (
            <Row key={name} label={`${t("agents.allowed")}: ${agentName(name)}`} hint={t("agents.allowedHint")}>
              <Button size="sm" onClick={() => a.forget(name)}>
                {t("agents.forget")}
              </Button>
            </Row>
          ))}
        </>
      )}
    </>
  );
}
