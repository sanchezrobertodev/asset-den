// node --experimental-strip-types src/lib/i18n.test.ts
import assert from "node:assert/strict";
import { addLocale, parseTags, setLocale, t, tNodes, translateError, type TKey } from "./i18n.ts";

const k = (s: string) => s as TKey;

addLocale("en", "x", {
  hello: "Hello, {{name}}!",
  files_one: "{{count}} file",
  files_other: "{{count}} files",
  matches_zero: "No matches",
  matches_one: "{{count}} match",
  matches_other: "{{count}} matches",
  only: "Only in English",
  nested: { deep: "Deep" },
});
addLocale("en", "errors", {
  couldntRead: "Couldn't read {{name}}: {{error}}",
  restoreFailed: "Couldn't restore the backup: {{error}}. Your library wasn't changed.",
  notLibrary: "it isn't a Mimikit library, or it's damaged",
});
addLocale("pl", "x", { files_one: "{{count}} plik", files_few: "{{count}} pliki", files_many: "{{count}} plików", files_other: "{{count}} pliku" });
addLocale("fr", "x", { hello: "Bonjour, {{name}} !", files_one: "{{count}} fichier", files_other: "{{count}} fichiers" });
addLocale("fr", "errors", {
  couldntRead: "Impossible de lire {{name}} : {{error}}",
  restoreFailed: "Impossible de restaurer la sauvegarde : {{error}}. Votre bibliothèque n'a pas changé.",
  notLibrary: "ce n'est pas une bibliothèque Mimikit, ou elle est endommagée",
});

setLocale("en");
assert.equal(t(k("x.hello"), { name: "Ana" }), "Hello, Ana!");
assert.equal(t(k("x.files"), { count: 1 }), "1 file");
assert.equal(t(k("x.files"), { count: 107258 }), "107,258 files"); // numbers get digit grouping
assert.equal(t(k("x.matches"), { count: 0 }), "No matches");
assert.equal(t(k("x.files"), { count: 0 }), "0 files"); // no _zero: the language's own rule
assert.equal(t(k("x.nested.deep")), "Deep");
assert.equal(t(k("x.missing")), "x.missing");
assert.equal(t(k("x.hello"), {}), "Hello, {{name}}!"); // a missing value stays visible

setLocale("fr", "fr-CA");
assert.equal(t(k("x.hello"), { name: "Ana" }), "Bonjour, Ana !");
assert.equal(t(k("x.files"), { count: 0 }), "0 fichier"); // French counts 0 as singular
assert.equal(t(k("x.files"), { count: 2000 }), `${new Intl.NumberFormat("fr-CA").format(2000)} fichiers`); // the regional format
assert.equal(t(k("x.only")), "Only in English"); // falls back to English
assert.equal(t(k("x.matches"), { count: 3 }), "3 matches"); // English plural rules for the English fallback

setLocale("pl");
assert.deepEqual([1, 3, 5, 22, 1.5].map((count) => t(k("x.files"), { count })), ["1 plik", "3 pliki", "5 plików", "22 pliki", "1,5 pliku"]);

setLocale("de"); // no strings: English
assert.equal(t(k("x.hello"), { name: "Ana" }), "Hello, Ana!");

// Tags
assert.deepEqual(parseTags("Press <0>Space</0> to <1>preview <2/></1>."), [
  "Press ",
  { tag: 0, children: ["Space"] },
  " to ",
  { tag: 1, children: ["preview ", { tag: 2, children: null }] },
  ".",
]);
assert.deepEqual(parseTags("a <0>b"), ["a ", "<0>", "b"]); // unclosed: kept as text
assert.deepEqual(parseTags("a </0> b"), ["a ", "</0>", " b"]);
addLocale("en", "y", { tagged: "Open <0>{{name}}</0>" });
setLocale("en");
assert.deepEqual(tNodes(k("y.tagged"), { name: "<1>x</1>" }), ["Open ", { tag: 0, children: ["<1>x</1>"] }]); // values add no tags

// Backend errors
assert.equal(translateError("Couldn't read hero.png: denied"), "Couldn't read hero.png: denied"); // English: as is
setLocale("fr");
assert.equal(translateError("Couldn't read hero.png: Access is denied. (os error 5)"), "Impossible de lire hero.png : Access is denied. (os error 5)");
assert.equal(
  translateError("Couldn't restore the backup: it isn't a Mimikit library, or it's damaged. Your library wasn't changed."),
  "Impossible de restaurer la sauvegarde : ce n'est pas une bibliothèque Mimikit, ou elle est endommagée. Votre bibliothèque n'a pas changé.",
);
assert.equal(translateError("database is locked"), "database is locked");
setLocale("en");

console.log("i18n tests passed");
