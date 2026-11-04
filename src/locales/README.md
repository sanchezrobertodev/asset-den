# Translations

Each folder is a language (`en`, `es`, …) with one JSON file per part of the app, in the
[i18next v4 JSON format](https://www.i18next.com/misc/json-format). English (`en`) is the source: every other
language has the same files and keys. `make check` runs `src/lib/locales.test.ts`, which says what is missing.

- **Placeholders** such as `{{count}}` or `{{name}}` are filled in by the app. Keep them as they are, anywhere in the
  sentence. Numbers are formatted for the language.
- **Tags** such as `<0>Space</0>` or `<0/>` mark text the app styles (a key cap, a bold number). Keep the numbers and
  wrap the matching words; `<0/>` is replaced by something from the app.
- **Plurals:** `key_one`, `key_other` (and `key_many`, `key_few`, `key_zero` where the language uses them) are the
  forms of one sentence for different counts, chosen by
  [CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html). `_other`
  is required; a missing form falls back to it. A singular form may drop `{{count}}` ("The other image takes…").
- **Search syntax stays English:** `type:`, `in:`, `#`, `size:`, `dur:`, `rating:`, `note:`, `color:` and their
  values are typed by the user and read by the app. They are passed in as placeholders, so they never appear in these
  files.
- `errors.json` holds messages from the app's backend. The English text must stay exactly as the backend writes it:
  the app recognises a message by it.
- `fmt.json` → `time.relativeStyle` is the [`Intl.RelativeTimeFormat`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat/RelativeTimeFormat#style)
  style for "3h ago" in that language: `narrow`, `short` or `long`. Leave it untranslated.

## Glossary

Gamedev terms that are usually left in English stay in English: sprite, sprite sheet, tileset, atlas, mesh, shader,
glTF, FBX, OBJ, PSD. Product names stay as they are: Mimikit, Ko-fi, GitHub.

| English | Español (Latinoamérica) |
|---|---|
| asset | recurso |
| library | biblioteca |
| folder | carpeta |
| collection / smart collection | colección / colección inteligente |
| favorite (noun / verb) | favorito / marcar como favorito |
| tag | etiqueta |
| rating, stars | calificación, estrellas |
| note | nota |
| duplicate | duplicado |
| Insights (view) | Estadísticas |
| side panel, quick view | panel lateral, vista rápida |
| full screen | pantalla completa |
| thumbnail | miniatura |
| frame (animation) | fotograma |
| waveform | forma de onda |
| import, scan | importar, escanear |
| image analysis, analyse | análisis de imágenes, analizar |
| Find similar | Buscar similares |
| backup, restore | copia de seguridad, restaurar |
| Trash | Papelera |
| Settings | Configuración |
| theme, accent colour | tema, color de acento |
| keyboard shortcut | atajo de teclado |
| update | actualización |
| Space, Shift, Scroll (keys) | Espacio, Mayús, Rueda |
