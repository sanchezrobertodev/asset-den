import { create } from "zustand";
import { api, errorText, type AppUpdate, type DownloadProgress } from "./api";
import { loadPrefs } from "./lib/prefs";

/** Mimikit's own updates (the Tauri updater), separate from the library store. */
export type AppUpdatePhase = "idle" | "checking" | "upToDate" | "available" | "installing" | "error";

interface AppUpdateState {
  /** null until known; false where the feed has no build for this platform (no checks, no UI). */
  supported: boolean | null;
  phase: AppUpdatePhase;
  update: AppUpdate | null;
  progress: DownloadProgress | null;
  error: string | null;
  /** The error came from installing, not checking. */
  installFailed: boolean;
  dialogOpen: boolean;

  /** Asks the backend whether this platform gets updates, then schedules the quiet launch check if it does. */
  init: () => Promise<void>;
  /** `quiet` (the launch check) keeps failures (offline, no release yet) out of sight. */
  check: (opts?: { quiet?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  setDialogOpen: (open: boolean) => void;
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  supported: null,
  phase: "idle",
  update: null,
  progress: null,
  error: null,
  installFailed: false,
  dialogOpen: false,

  init: async () => {
    try {
      set({ supported: await api.appUpdatesSupported() });
    } catch {
      set({ supported: false });
    }
    // Look once the library is up, unless turned off in Settings; a quiet check keeps failures (offline, no release yet) silent.
    if (get().supported && loadPrefs().checkUpdates) setTimeout(() => void get().check({ quiet: true }), 4000);
  },

  check: async (opts) => {
    const { phase, supported } = get();
    if (!supported || phase === "checking" || phase === "installing") return;
    set({ phase: "checking", error: null, installFailed: false });
    try {
      const update = await api.checkAppUpdate();
      set({ update, phase: update ? "available" : "upToDate" });
    } catch (e) {
      set({ phase: opts?.quiet ? "idle" : "error", error: errorText(e) });
    }
  },

  install: async () => {
    if (get().phase === "installing" || !get().update) return;
    set({ phase: "installing", progress: null, error: null, installFailed: false, dialogOpen: true });
    try {
      await api.installAppUpdate((progress) => set({ progress }));
    } catch (e) {
      set({ phase: "error", error: errorText(e), installFailed: true });
    }
  },

  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

/** Opens the dialog and checks, unless an update is already known. */
export function openUpdates() {
  const s = useAppUpdate.getState();
  s.setDialogOpen(true);
  if (s.phase !== "available" && s.phase !== "installing") void s.check();
}
