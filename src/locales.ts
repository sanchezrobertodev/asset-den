// Registers every src/locales/<language>/<namespace>.json and picks the UI language. main.tsx imports this first, so
// strings built when a module loads (kind names, the shortcuts table) are already in that language.
import { addLocale, locale, setLocale } from "./lib/i18n";

const files = import.meta.glob<Record<string, never>>("./locales/*/*.json", { eager: true, import: "default" });
for (const [path, dict] of Object.entries(files)) {
  const [, code, ns] = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/)!;
  addLocale(code, ns, dict);
}

const lang = "en";
// Numbers and dates follow the OS's regional variant of that language (en-GB dates for English, say).
setLocale(lang, navigator.languages.find((l) => l.split("-")[0] === lang.split("-")[0]) ?? lang);
document.documentElement.lang = locale();
