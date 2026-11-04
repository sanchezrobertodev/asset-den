// Registers every src/locales/<language>/<namespace>.json and picks the UI language. main.tsx imports this first, so
// strings built when a module loads (kind names, the shortcuts table) are already in that language. Changing the
// language saves the pref and reloads the window.
import { addLocale, locale, locales, matchLocale, setLocale } from "./lib/i18n";
import { loadPrefs } from "./lib/prefs";

const files = import.meta.glob<Record<string, never>>("./locales/*/*.json", { eager: true, import: "default" });
for (const [path, dict] of Object.entries(files)) {
  const [, code, ns] = path.match(/\/locales\/([^/]+)\/([^/]+)\.json$/)!;
  addLocale(code, ns, dict);
}

/** Each language in its own name, for the language picker. */
const NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  "zh-CN": "简体中文",
};
export const languageName = (code: string) => NAMES[code] ?? code;

/** The language "System" picks: the first OS language there are strings for. */
export const systemLanguage = matchLocale(navigator.languages, locales());

const pref = loadPrefs().language;
const lang = locales().includes(pref) ? pref : systemLanguage;
// Numbers and dates follow the OS's regional variant of that language (en-GB dates for English, say).
setLocale(lang, navigator.languages.find((l) => l.split("-")[0] === lang.split("-")[0]) ?? lang);
document.documentElement.lang = locale();
