import clsx from "clsx";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fileUrl } from "../api";
import { fontFamily, thumbnailFor } from "../lib/thumbs";
import type { Asset } from "../types";
import { KindIcon } from "./ui";

/** Sprites this small are pixel art: scale them up crisp instead of blurry. */
export const isTiny = (a: Asset) => !!a.width && !!a.height && a.width <= 64 && a.height <= 64;

/** Square preview for a card or row: real thumbnail where possible, "Aa" for fonts, a kind icon otherwise. */
export function Thumb({
  asset,
  pixelated,
  small,
  className,
}: {
  asset: Asset;
  pixelated?: boolean;
  small?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(null);
    setFamily(null);
    setFailed(false);
    let live = true;
    if (asset.kind === "image" && asset.ext === "svg") setSrc(fileUrl(asset.path));
    else if (asset.kind === "image" || asset.kind === "model")
      void thumbnailFor(asset).then((p) => live && (p ? setSrc(convertFileSrc(p)) : setFailed(true)));
    else if (asset.kind === "font")
      void fontFamily(asset, fileUrl(asset.path)).then((f) => live && (f ? setFamily(f) : setFailed(true)));
    return () => {
      live = false;
    };
  }, [asset.id, asset.mtime, asset.size, asset.kind, asset.ext, asset.path]);

  return (
    <div className={clsx("checker flex items-center justify-center overflow-hidden", className)}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          className={clsx("h-full w-full object-contain", (pixelated || isTiny(asset)) && "pixelated")}
        />
      ) : family ? (
        <span style={{ fontFamily: family }} className={clsx("leading-none text-fg", small ? "text-sm" : "text-4xl")}>
          Aa
        </span>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <KindIcon kind={asset.kind} className={small ? "size-4" : "size-9"} />
          {!small && (
            <span className="font-mono text-[11px] text-muted uppercase">{asset.ext || "file"}</span>
          )}
        </div>
      )}
    </div>
  );
}
