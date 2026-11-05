// The window's side of the agent bridge (Settings › AI agents). The backend listens for the `mimikit mcp` relays that
// agent apps start and hands each tool call here (event "agent-call"). The call is checked against the apps the user
// allowed, asking "Allow …?" the first time; run.ts runs it on the library this window holds; `agent_reply` answers.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { create } from "zustand";
import { api, assetUrl, fileUrl } from "../api";
import { holdFont } from "../lib/fonts";
import { thumbnailFor } from "../lib/thumbs";
import { useStore } from "../store";
import type { Asset } from "../types";
import { agentName, cleanAgent, errorResult, gate, runTool, type Agent, type Io, type Session, type ToolResult } from "./run.ts";

const KEY = "mimikit.agents.v1";
/** How long a call waits for the user's "Allow?": under the backend's 120 s, so the agent hears why. */
const ASK_MS = 100_000;

interface Saved {
  on: boolean;
  /** Agent apps the user let in, by the name they give (e.g. "claude-code"). */
  allowed: string[];
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { on: v.on === true, allowed: Array.isArray(v.allowed) ? v.allowed.filter((x: unknown) => typeof x === "string") : [] };
  } catch {
    return { on: false, allowed: [] };
  }
}

function save({ on, allowed }: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ on, allowed }));
  } catch {
    // Not saved: the switch is off again on the next launch.
  }
}

/** An "Allow …?" waiting for the user: one per agent app, for every relay of it that asked meanwhile. */
export interface Question {
  name: string;
  version: string;
  pids: number[];
}

interface AgentsState extends Saved {
  /** This program's path, for the setup commands. */
  exe: string | null;
  /** Relays that made a call, in the order they first did. */
  sessions: Session[];
  /** Relays the user disconnected or didn't allow, until Mimikit restarts. */
  blocked: number[];
  questions: Question[];
  setOn: (on: boolean) => Promise<void>;
  answer: (name: string, allow: boolean) => void;
  /** Lets an allowed app in again only after asking. */
  forget: (name: string) => void;
  pause: (pid: number, paused: boolean) => void;
  disconnect: (pid: number) => void;
}

/** Calls waiting on each app's question; each is told when it's answered or the switch goes off. */
const waiting = new Map<string, (() => void)[]>();
function release(name: string) {
  for (const done of waiting.get(name) ?? []) done();
  waiting.delete(name);
}

export const useAgents = create<AgentsState>((set, get) => ({
  ...load(),
  exe: null,
  sessions: [],
  blocked: [],
  questions: [],
  setOn: async (on) => {
    try {
      const exe = await invoke<string>("set_agent_bridge", { on });
      // Off forgets the apps allowed so far, so on again asks each one anew.
      set(on ? { on, exe } : { on, exe, allowed: [], sessions: [], questions: [] });
      save(get());
      if (!on) for (const name of [...waiting.keys()]) release(name);
    } catch (e) {
      useStore.getState().setError(e);
    }
  },
  answer: (name, allow) => {
    const q = get().questions.find((x) => x.name === name);
    set((s) => ({
      questions: s.questions.filter((x) => x.name !== name),
      ...(allow ? { allowed: [...new Set([...s.allowed, name])] } : { blocked: [...s.blocked, ...(q?.pids ?? [])] }),
    }));
    save(get());
    release(name);
  },
  forget: (name) => {
    set((s) => ({ allowed: s.allowed.filter((x) => x !== name) }));
    save(get());
  },
  pause: (pid, paused) => set((s) => ({ sessions: s.sessions.map((x) => (x.pid === pid ? { ...x, paused } : x)) })),
  disconnect: (pid) => set((s) => ({ sessions: s.sessions.filter((x) => x.pid !== pid), blocked: [...s.blocked, pid] })),
}));

/** Waits until the user answers `agent`'s app's question: false if they haven't in time. */
function ask(agent: Agent): Promise<boolean> {
  return new Promise((resolve) => {
    const list = waiting.get(agent.name) ?? [];
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      waiting.set(agent.name, (waiting.get(agent.name) ?? []).filter((x) => x !== done));
      resolve(false);
    }, ASK_MS);
    waiting.set(agent.name, [...list, done]);
    const { questions } = useAgents.getState();
    const q = questions.find((x) => x.name === agent.name);
    useAgents.setState({
      questions: q
        ? questions.map((x) => (x === q ? { ...x, pids: [...new Set([...x.pids, agent.pid])] } : x))
        : [...questions, { name: agent.name, version: agent.version, pids: [agent.pid] }],
    });
    if (!q) void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
  });
}

async function decide(agent: Agent, tool: string, args: unknown): Promise<ToolResult> {
  let g = gate(agent, useAgents.getState());
  if (g === "ask") {
    if (!(await ask(agent)))
      return errorResult("no_answer", "The user hasn't answered Mimikit's question yet: whether to let your app see their library.", "Ask the user to answer it in Mimikit's window, then try again.");
    g = gate(agent, useAgents.getState());
    if (g === "ask") return errorResult("not_running", "The user turned AI agents off in Mimikit.", "Don't retry unless the user turns them on again.");
  }
  if (g !== "run") return g;
  useAgents.setState((s) => {
    const old = s.sessions.find((x) => x.pid === agent.pid);
    const now = { ...agent, calls: (old?.calls ?? 0) + 1, last: Date.now(), paused: false };
    return { sessions: old ? s.sessions.map((x) => (x === old ? now : x)) : [...s.sessions, now] };
  });
  return runTool(tool, args, io(agent));
}

let started = false;

/** Listens for agent calls and turns the bridge on if it was on. Off also removes an endpoint file left by a crash. */
export async function startAgents() {
  if (started) return;
  started = true;
  await listen<{ id: number; call: { tool?: unknown; args?: unknown; agent?: unknown } }>("agent-call", ({ payload: { id, call } }) => {
    void decide(cleanAgent(call.agent), String(call.tool), call.args)
      .catch(() => errorResult("internal", "Mimikit couldn't finish this call.", "Try again. If it keeps failing, tell the user."))
      .then((result) => invoke("agent_reply", { id, result }))
      .catch(() => {});
  });
  const { on } = useAgents.getState();
  try {
    useAgents.setState({ exe: await invoke<string>("set_agent_bridge", { on }) });
  } catch (e) {
    useAgents.setState({ on: false });
    useStore.getState().setError(e);
  }
}

function io(agent: Agent): Io {
  return {
    library: () => {
      const { assets, roots, collections, notes, analysis } = useStore.getState();
      return { assets, roots, collections, notes, analysis };
    },
    // shortcut: a load the window started a moment ago answers without colours, until it lands.
    palettes: async () => {
      await useStore.getState().loadPalettes();
      return useStore.getState().palettes;
    },
    sheet: api.getSpriteSheet,
    similar: api.findSimilar,
    text: api.readText,
    pictures,
    show: (ids) => {
      useStore.getState().showAssets(ids, agentName(agent.name));
      void getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
    },
  };
}

// ---------- pictures for `view` ----------

/** Formats the webview shows natively, as in Viewers.tsx; the rest get a PNG preview from the backend. */
const NATIVE_IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"]);
const CELL = 160;
const GAP = 6;
const BIG = 512;

function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // the asset protocol is another origin; without this the canvas can't be read
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = url;
  });
}

/** What to draw for `a`: the image itself for a big picture, else its thumbnail; null for kinds without one. */
async function source(a: Asset, big: boolean): Promise<HTMLImageElement | null> {
  try {
    if (a.kind === "image" && big) return await image(NATIVE_IMAGE.has(a.ext) ? assetUrl(a) : convertFileSrc(await api.preview(a.id)));
    if (a.kind !== "image" && a.kind !== "video" && a.kind !== "model") return null;
    const path = await thumbnailFor(a);
    return path ? await image(convertFileSrc(path)) : null;
  } catch {
    return null;
  }
}

/** A font's family name once it's loaded, and the function that lets it go. */
function font(a: Asset): Promise<{ family: string | null; release: () => void }> {
  return new Promise((resolve) => {
    const release = holdFont(a, fileUrl(a.path), (family) => resolve({ family, release: () => release() }));
  });
}

/** Draws `a` into the `size` square at x, y: on a checkerboard, so transparency shows. */
async function drawAsset(ctx: CanvasRenderingContext2D, a: Asset, x: number, y: number, size: number, big: boolean) {
  for (let i = 0; i < size; i += 10)
    for (let j = 0; j < size; j += 10) {
      ctx.fillStyle = (i + j) % 20 ? "#d6d6d6" : "#f2f2f2";
      ctx.fillRect(x + i, y + j, Math.min(10, size - i), Math.min(10, size - j));
    }
  const img = await source(a, big);
  if (img) {
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const scale = Math.min(size / w, size / h);
    ctx.imageSmoothingEnabled = scale < 1; // pixel art scales up crisp
    ctx.drawImage(img, x + (size - w * scale) / 2, y + (size - h * scale) / 2, w * scale, h * scale);
    return;
  }
  // No picture: the font's own letters, or the type in this file's words (never the file's name).
  const f = a.kind === "font" ? await font(a) : null;
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = f?.family ? `${Math.round(size * 0.32)}px "${f.family}"` : `600 ${Math.round(size * 0.12)}px system-ui, sans-serif`;
  ctx.fillText(f?.family ? "Aa" : a.kind, x + size / 2, y + size / 2);
  f?.release();
}

function png(canvas: HTMLCanvasElement) {
  return canvas.toDataURL("image/png").split(",")[1];
}

/** Base64 PNGs for `view`: one contact sheet numbered like its legend, or one picture per asset. */
async function pictures(assets: Asset[], layout: "sheet" | "thumbnails"): Promise<string[]> {
  if (layout === "thumbnails") {
    return Promise.all(
      assets.map(async (a) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = BIG;
        await drawAsset(canvas.getContext("2d")!, a, 0, 0, BIG, true);
        return png(canvas);
      }),
    );
  }
  const cols = Math.min(4, assets.length);
  const rows = Math.ceil(assets.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * CELL + (cols + 1) * GAP;
  canvas.height = rows * CELL + (rows + 1) * GAP;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, a] of assets.entries()) {
    const x = GAP + (i % cols) * (CELL + GAP);
    const y = GAP + Math.floor(i / cols) * (CELL + GAP);
    await drawAsset(ctx, a, x, y, CELL, false);
    ctx.fillStyle = "rgba(0,0,0,.78)";
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, 28, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x + 18, y + 14.5);
  }
  return [png(canvas)];
}
