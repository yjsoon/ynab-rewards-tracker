# Brand assets — "Night Terminal Spark"

The app's visual identity: a charcoal credit card on the brand crimson field,
its magnetic stripe rendered as a progress bar, with a gold four-point spark
sitting exactly where the fill ends — progress "sparks" where you currently
are. Chosen July 2026 after three design rounds; all sixteen candidate marks
and the pitch pages live in `../icon-concepts/`.

## Files in this directory

| File | What it is |
| --- | --- |
| `icon.svg` | **Master vector.** Full-bleed 512×512 app icon; every raster icon is generated from this. Same geometry as `../icon-concepts/v3-h3b.svg` (kept there for history). |
| `brand-card.svg` | The card alone (credit-card aspect, no tile background, hairline edge for dark grounds). For in-app heroes, docs, and anywhere the mark floats on a page. |
| `spark.svg` | The concave four-point spark alone, brand gold. |
| `favicon-adaptive.svg` | Copy of `apps/web/public/favicon.svg`: the icon with an embedded `prefers-color-scheme` media query (brighter spark, lighter card on dark browser chrome). Edit both together if you change it. |

## Palette

| Colour | Hex | Usage |
| --- | --- | --- |
| Brand crimson | `#D92D2D` | Icon field, ember gradient start; `--primary` in the web app (`hsl(0 72% 51%)` light / `60%` dark) |
| Ember | `#FF6A45` | Stripe gradient end |
| Card charcoal | `#1D1B20` | The card body |
| Spark gold | `#F5B942` | The spark and progress accents; `--spark` token (`hsl(40 90% 61%)` light / `hsl(42 93% 66%)` dark), Tailwind `text-spark` |
| Track/number white | `#FFFFFF` at 14% / 12% | Unfilled stripe track and card-number bar |

## Rules of thumb

- The **full-bleed square icon** (`icon.svg`) is for icon slots only: favicons,
  home screens, app stores. Don't paste it inside app UI — use `brand-card.svg`
  (or the `BrandCard` React component) there instead.
- The spark is always gold. The progress fill may be crimson, the ember
  gradient, or gold depending on context, but the spark doesn't change hue.
- Corners of the square icon are left square; platforms apply their own masks.
  The SVG favicon adds its own `rx` because browser tabs don't mask.

## In-app icon family (web)

`apps/web/components/icons/BrandIcons.tsx` renders the identity at UI sizes,
on lucide metrics (24-grid, 2px stroke) so the marks sit beside lucide-react
icons:

- `BrandMark` — line-style card+stripe+spark; nav brand link
- `BrandCard` — full-colour card; landing hero, not-found page
- `SparkIcon` — spark glyph (currentColor); "smart" nav items
- `EmptyCardsIcon` — dashed card, empty track, hollow spark at the start;
  empty states

## Regenerating raster icons

All PNGs are generated from `icon.svg` — never edit them by hand:

```bash
node scripts/generate-icons.mjs
```

Outputs: `apps/web/public/{favicon-16,favicon,apple-touch-icon,icon-192,icon-512}.png`
and `apps/mobile/assets/icon.png` (1024). Requires a Chromium/Chrome binary
(`$CHROMIUM_BIN` or a common install path); no other image tooling needed.

## Known caveats

- Manifest icons are declared `purpose: "any maskable"`; the card corners sit
  near the edge of the maskable safe zone. If a launcher's circular mask clips
  them, generate a dedicated maskable variant with the mark scaled ~10% down.
- iOS snapshots `apple-touch-icon` when a site is added to the Home Screen and
  never refreshes it — icon changes require users to re-add the shortcut.
- Web app icons have no per-appearance (light/dark) variant mechanism on any
  platform; only the browser-tab SVG favicon adapts. iOS's tinted Home Screen
  mode auto-generates a monochrome rendition — the mark's high contrast is
  deliberate so that rendition stays legible.
