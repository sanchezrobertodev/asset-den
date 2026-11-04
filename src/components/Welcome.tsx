import { FolderPlus, Hand } from "lucide-react";
import type { ReactNode } from "react";
import { t } from "../lib/i18n";
import { shortcut } from "../lib/shortcuts";
import { useStore } from "../store";
import { Button, Kbd } from "./ui";
import logo from "../../src-tauri/icons/128x128.png";
import logo2x from "../../src-tauri/icons/128x128@2x.png";

function Tip({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-line-soft bg-panel p-3.5">
      <span className="flex h-6 items-center text-muted">{icon}</span>
      <span className="font-medium text-fg">{title}</span>
      <span className="text-xs leading-[1.5] text-muted">{children}</span>
    </li>
  );
}

/** First run: what Mimikit does and the one step to start, instead of an empty grid. */
export function Welcome() {
  const importFolder = useStore((s) => s.importFolder);
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-7 py-10">
      <div className="flex w-full max-w-[600px] flex-col items-center text-center">
        <img src={logo} srcSet={`${logo} 1x, ${logo2x} 2x`} alt="" className="size-16" />
        <h2 className="mt-5 text-[22px] font-semibold tracking-[-.015em] text-fg">{t("welcome.title")}</h2>
        <p className="mt-2 max-w-[460px] text-fg-2">{t("welcome.intro")}</p>
        <Button variant="accent" size="lg" className="mt-6" onClick={() => void importFolder()}>
          <FolderPlus aria-hidden className="size-4" />
          {t("welcome.importFolder")}
        </Button>
        <p className="mt-3 text-xs text-muted">{t("welcome.readOnly")}</p>
        <ul aria-label={t("welcome.tips")} className="mt-10 grid w-full grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5 text-left">
          <Tip icon={<Hand aria-hidden className="size-4" />} title={t("welcome.drag.title")}>
            {t("welcome.drag.body")}
          </Tip>
          <Tip icon={<Kbd>{shortcut("peek").keys}</Kbd>} title={t("welcome.preview.title")}>
            {t("welcome.preview.body", { peekKey: shortcut("peek").keys })}
          </Tip>
          <Tip icon={<Kbd>{shortcut("search").keys}</Kbd>} title={t("welcome.search.title")}>
            {t("welcome.search.body", { tagExample: "#tags", typeExample: "type:audio" })}
          </Tip>
        </ul>
      </div>
    </div>
  );
}
