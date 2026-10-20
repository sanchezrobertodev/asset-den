import clsx from "clsx";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { fileUrl } from "../api";
import { fontFamily, requestThumbnail } from "../lib/thumbs";
import type { Asset } from "../types";

/** Sprites this small are pixel art: scale them up crisp instead of blurry. */
export const isTiny = (a: Asset) => !!a.width && !!a.height && a.width <= 64 && a.height <= 64;

/** Label sizes for the design's placeholder tiles: card, list row, filmstrip. */
const sizes = {
  card: { font: "text-[38px]", ext: "text-[11px]" },
  row: { font: "text-[15px]", ext: "text-[8px]" },
  strip: { font: "text-[22px]", ext: "text-[10px]" },
};

/**
 * Square preview: the real thumbnail on a checkerboard for images and models, "Aa" in the font itself for fonts,
 * and the design's striped tile with the extension for everything else.
 */
export function Thumb({
  asset,
  pixelated,
  size = "card",
  className,
}: {
  asset: Asset;
  pixelated?: boolean;
  size?: keyof typeof sizes;
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
    // Withdrawn on unmount, so cards a fast scroll passes never cost a thumbnail.
    let withdraw = () => {};
    if (asset.kind === "image" && asset.ext === "svg") setSrc(fileUrl(asset.path));
    else if (asset.kind === "image" || asset.kind === "model")
      withdraw = requestThumbnail(asset, (p) => live && (p ? setSrc(convertFileSrc(p)) : setFailed(true)));
    else if (asset.kind === "font")
      void fontFamily(asset, fileUrl(asset.path)).then((f) => live && (f ? setFamily(f) : setFailed(true)));
    return () => {
      live = false;
      withdraw();
    };
  }, [asset.id, asset.mtime, asset.size, asset.kind, asset.ext, asset.path]);

  const picture = src && !failed;
  return (
    <div
      data-kind={asset.kind}
      className={clsx(
        "flex items-center justify-center overflow-hidden",
        picture || asset.kind === "image" ? "checker" : "stripes",
        className,
      )}
    >
      {picture ? (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          className={clsx("h-full w-full object-contain", (pixelated || isTiny(asset)) && "pixelated")}
        />
      ) : asset.kind === "font" ? (
        <span style={family ? { fontFamily: family } : undefined} className={clsx("leading-none text-fg", sizes[size].font)}>
          Aa
        </span>
      ) : (
        <span className={clsx("k-text font-mono tracking-[.04em] uppercase", sizes[size].ext)}>{asset.ext || "file"}</span>
      )}
    </div>
  );
}
