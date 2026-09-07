# Bundled typesetting fonts

All families are licensed under the SIL Open Font License 1.1 (see the OFL-*.txt
files next to them) and cover Turkish glyphs (ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü).

| Family        | Files                       | Use                         |
| ------------- | --------------------------- | --------------------------- |
| Shantell Sans | ShantellSans_*.ttf          | Dialogue, thoughts          |
| Bangers       | Bangers_400Regular.ttf      | Sound effects, shouting     |
| Nunito        | Nunito_*.ttf                | Captions, labels, narration |

Source: Google Fonts (copied from the `@expo-google-fonts/*` packages).
The same files are read by the server renderer (`src/server/render/fonts.ts`)
and served to the browser editor from `/fonts/...`.
