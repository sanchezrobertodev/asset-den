// node --experimental-strip-types src/lib/locales.test.ts
// Every language has the English keys, placeholders and tags; the backend error strings still match the Rust source.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

type Dict = { [k: string]: string | Dict };
const dir = new URL("../locales/", import.meta.url);
const read = (lang: string, ns: string) => JSON.parse(readFileSync(new URL(`${lang}/${ns}.json`, dir), "utf8")) as Dict;
const flat = (d: Dict, p = ""): [string, string][] =>
  Object.entries(d).flatMap(([k, v]) => (typeof v === "string" ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));

const PLURAL = /_(zero|one|two|few|many|other)$/;
const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?\d+\/?>/g)].map((m) => m[0]).sort();

const namespaces = readdirSync(new URL("en/", dir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const en = new Map(namespaces.map((ns) => [ns, new Map(flat(read("en", ns)))]));
const failures: string[] = [];

// The type of t()'s keys lists every English file.
const i18n = readFileSync(new URL("i18n.ts", import.meta.url), "utf8");
for (const ns of namespaces) if (!i18n.includes(`  ${ns}: typeof ${ns};`)) failures.push(`i18n.ts Resources is missing ${ns}`);

/** Base key → its strings (plural forms grouped). */
function groups(entries: Map<string, string>) {
  const g = new Map<string, Map<string, string>>();
  for (const [key, s] of entries) {
    const base = key.replace(PLURAL, "");
    if (!g.has(base)) g.set(base, new Map());
    g.get(base)!.set(PLURAL.exec(key)?.[1] ?? "", s);
  }
  return g;
}

for (const lang of readdirSync(dir).filter((d) => !d.includes("."))) {
  const rules = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  for (const ns of namespaces) {
    let mine: Map<string, string>;
    try {
      mine = new Map(flat(read(lang, ns)));
    } catch {
      failures.push(`${lang}/${ns}.json is missing or not valid JSON`);
      continue;
    }
    const enGroups = groups(en.get(ns)!);
    const myGroups = groups(mine);
    for (const [base, forms] of myGroups) {
      if (!enGroups.has(base)) failures.push(`${lang} ${ns}.${base} is not in English`);
      for (const [form, s] of forms) if (!s.trim()) failures.push(`${lang} ${ns}.${base}${form && "_" + form} is empty`);
    }
    for (const [base, enForms] of enGroups) {
      const forms = myGroups.get(base);
      if (!forms) {
        failures.push(`${lang} is missing ${ns}.${base}`);
        continue;
      }
      const plural = [...enForms.keys()].some(Boolean);
      if (plural) {
        if (!forms.has("other")) failures.push(`${lang} ${ns}.${base} has no _other`);
        if (rules.includes("one") && !forms.has("one") && lang !== "en") failures.push(`${lang} ${ns}.${base} has no _one`);
      }
      const ref = enForms.get("other") ?? enForms.get("")!;
      for (const [form, s] of forms) {
        // A singular form may say "one" instead of {{count}}.
        const want = vars(ref).filter((v) => !(v === "count" && (form === "one" || form === "zero")));
        const got = vars(s).filter((v) => !(v === "count" && (form === "one" || form === "zero")));
        if (want.join() !== got.join()) failures.push(`${lang} ${ns}.${base}${form && "_" + form}: placeholders ${got} instead of ${want}`);
        if (tags(ref).join() !== tags(s).join()) failures.push(`${lang} ${ns}.${base}${form && "_" + form}: tags ${tags(s)} instead of ${tags(ref)}`);
      }
    }
  }
}

// errorText() recognises a backend error by its English text, so each one must still be in the Rust source: {{name}}
// stands for a {…} placeholder there.
const rust = readdirSync(new URL("../../src-tauri/src/", import.meta.url))
  .filter((f) => f.endsWith(".rs"))
  .map((f) => readFileSync(new URL(`../../src-tauri/src/${f}`, import.meta.url), "utf8"))
  .join("\n")
  .replaceAll('\\"', '"');
for (const [key, s] of en.get("errors")!) {
  const re = new RegExp(s.split(/\{\{\s*\w+\s*\}\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\{[^}]*\\}"));
  if (!re.test(rust)) failures.push(`errors.${key} no longer matches a message in src-tauri/src: ${s}`);
}

assert.deepEqual(failures, []);
console.log(`locales: ${readdirSync(dir).filter((d) => !d.includes(".")).length} language(s) × ${namespaces.length} files match English`);
