// Rebuilds src-tauri/icons from icon/:
// - app.png: the chest, for every icon except the macOS one.
// - mac.png: the same chest on a rounded tile for the macOS .icns, since macOS boxes in icons that aren't one.
// - 16.png: a hand-drawn frame for the 16 px slot of icon.ico (Explorer lists and the like), where a downscale of the
//   chest blurs into a blob. 24.png and 48.png are the same drawing at the sidebar logo's sizes.
import { execSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = "src-tauri/icons";

function tauriIcon(src) {
  const dir = mkdtempSync(join(tmpdir(), "icons-"));
  execSync(`npx tauri icon "${src}" -o "${dir}"`, { stdio: "ignore" });
  return dir;
}

/** The images in an .ico, which `tauri icon` stores as PNGs. */
function icoPngs(buf) {
  return Array.from({ length: buf.readUInt16LE(4) }, (_, i) => {
    const at = 6 + 16 * i;
    const offset = buf.readUInt32LE(at + 12);
    return buf.subarray(offset, offset + buf.readUInt32LE(at + 8));
  });
}

/** An .ico that holds each PNG as is (PNG entries need Windows Vista or later). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, i) => {
    const size = png.readUInt32BE(16); // width from the IHDR chunk; the frames are square
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at); // 0 means 256
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4); // colour planes
    head.writeUInt16LE(32, at + 6); // bits per pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs]);
}

const app = tauriIcon("icon/app.png");
const mac = tauriIcon("icon/mac.png");
// Only the files tauri icon made, so anything else kept in there (a tray icon, say) is left alone.
for (const f of readdirSync(out)) {
  const src = join(f === "icon.icns" ? mac : app, f);
  if (statSync(src, { throwIfNoEntry: false })?.isFile()) copyFileSync(src, join(out, f));
}
const tauriPngs = icoPngs(readFileSync(join(app, "icon.ico")));
const isPng = (b) => b.readUInt32BE(0) === 0x89504e47;
if (!tauriPngs.every(isPng) || !tauriPngs.some((png) => png.readUInt32BE(16) === 16)) {
  throw new Error("tauri icon's icon.ico no longer holds PNG frames with a 16 px one: update scripts/icons.mjs");
}
const pngs = tauriPngs.map((png) => (png.readUInt32BE(16) === 16 ? readFileSync("icon/16.png") : png));
writeFileSync(join(out, "icon.ico"), ico(pngs));
rmSync(app, { recursive: true });
rmSync(mac, { recursive: true });
console.log(`Rebuilt ${out} from icon/`);
