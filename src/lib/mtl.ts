// Which .mtl files to try for an OBJ: the one its `mtllib` line names, then one with the OBJ's own base name.

/** Candidate .mtl paths for the OBJ at `objPath` with contents `objText`, in the order to try them. */
export function mtlCandidates(objPath: string, objText: string): string[] {
  const sep = objPath.includes("\\") ? "\\" : "/";
  const cut = Math.max(objPath.lastIndexOf("/"), objPath.lastIndexOf("\\"));
  const dir = objPath.slice(0, cut + 1);
  const out: string[] = [];
  const lib = /^mtllib[ \t]+(.+?)[ \t]*$/m.exec(objText)?.[1];
  if (lib) {
    // Absolute paths come from the exporter's machine; look for that file next to the OBJ instead.
    const absolute = /^([a-zA-Z]:)?[\\/]/.test(lib);
    const rel = absolute ? lib.slice(Math.max(lib.lastIndexOf("/"), lib.lastIndexOf("\\")) + 1) : lib;
    out.push(dir + rel.replace(/[\\/]/g, sep));
  }
  const own = objPath.replace(/\.[^.\\/]*$/, "") + ".mtl";
  if (!out.some((p) => p.toLowerCase() === own.toLowerCase())) out.push(own);
  return out;
}
