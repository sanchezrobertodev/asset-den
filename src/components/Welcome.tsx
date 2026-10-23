import { FolderPlus, Hand } from "lucide-react";
import type { ReactNode } from "react";
import { shortcut } from "../lib/shortcuts";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-line-soft bg-panel p-3.5">
      <span className="flex h-6 items-center text-muted">{icon}</span>
      <span className="font-medium text-fg">{title}</span>
      <span className="text-xs leading-[1.5] text-muted">{children}</span>
    </li>
  );
}

/** First run: what Asset Den does and the one step to start, instead of an empty grid. */
export function Welcome() {
  const importFolder = useStore((s) => s.importFolder);
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-7 py-10">
      <div className="flex w-full max-w-[600px] flex-col items-center text-center">
        <div aria-hidden className="size-11 rounded-xl bg-accent" />
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-.015em] text-fg">Welcome to Asset Den</h2>
        <p className="mt-2 max-w-[460px] text-fg-2">
          Point it at a folder of game assets and it indexes every sprite, sound, model, font and video in it, then keeps
          watching for changes.
        </p>
        <Button variant="accent" size="lg" className="mt-6" onClick={() => void importFolder()}>
          <FolderPlus aria-hidden className="size-4" />
          Import a folder
        </Button>
        <p className="mt-3 text-xs text-muted">You can add more folders later. Asset Den only reads them: your files are never changed.</p>
        <ul aria-label="Tips" className="mt-10 grid w-full grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5 text-left">
          <Tip icon={<Hand aria-hidden className="size-4" />} title="Drag into your engine">
            Drop any card into Unity, Godot or a folder to copy the file there.
          </Tip>
          <Tip icon={<Kbd>{shortcut("peek").keys}</Kbd>} title="Preview in place">
            Select an asset and press Space to look, Enter for full screen.
          </Tip>
          <Tip icon={<Kbd>{shortcut("search").keys}</Kbd>} title="Find anything">
            Search names, #tags, type:audio or folders from anywhere.
          </Tip>
        </ul>
      </div>
    </div>
  );
}
