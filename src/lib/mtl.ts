// Which .mtl files to try for an OBJ: the ones its `mtllib` lines name, then one with the OBJ's own base name.

/** Candidate .mtl paths for the OBJ at `objPath` with contents `objText`, in priority order. */
export function mtlCandidates(objPath: string, objText: string): string[] {
  const sep = objPath.includes("\\") ? "\\" : "/";
  const cut = Math.max(objPath.lastIndexOf("/"), objPath.lastIndexOf("\\"));
  const dir = objPath.slice(0, cut + 1);
  const paths: string[] = [];
  // An OBJ may declare several libraries, one mtllib line each (a name may contain spaces).
  for (const [, lib] of objText.matchAll(/^mtllib[ \t]+(.+?)[ \t]*$/gm)) {
    // Absolute paths come from the exporter's machine; look for that file next to the OBJ instead.
    const absolute = /^([a-zA-Z]:)?[\\/]/.test(lib);
    const rel = absolute ? lib.slice(Math.max(lib.lastIndexOf("/"), lib.lastIndexOf("\\")) + 1) : lib;
    paths.push(dir + rel.replace(/[\\/]/g, sep));
  }
  paths.push(objPath.replace(/\.[^.\\/]*$/, "") + ".mtl");
  const out: string[] = [];
  for (const p of paths) if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out;
}
