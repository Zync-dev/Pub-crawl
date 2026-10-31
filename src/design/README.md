# Pub Crawl Design System

Visual identity for **Pub Crawl**, a private app for a group of friends on one night out (a six-stop crawl). Not a commercial product. Chosen direction: **A · Last Orders**, a traditional British pub sign: racing green, gold leaf, double rules, italic serif. Other explored directions (Pint Run, Neon Taproom, Beer Mat) live in `explorations/Directions.html` for reference only.

**Sources:** none provided. Built from scratch from the user's brief. No existing logo, codebase or Figma was given; the wordmark in `components/brand/Logo.jsx` is an original type lockup made for this project.

## Products
- **Crawl app** (mobile, 390pt wide): join with a crawl code, see the route, check in at the current pub, track whose round it is, crew list. UI kit in `ui_kits/app/`.

## Content fundamentals
- **Voice:** a mate with the plan. Short, warm, a bit of pub ceremony. Never corporate, never cute.
- **Person:** "you" for the reader, "we" for the group ("We're moving on"). Names over pronouns: "Guinness round on Mikkel."
- **Casing:** sentence case for buttons and body ("Check in", "Next pub"). UPPERCASE only for small tracked eyebrows/labels ("STOP 3 OF 6 · 21:15", "FINE ALES · GOOD COMPANY").
- **Pub vocabulary:** round, last orders, drink up, one more here, the crew. Use 24h times (21:15) and "·" as separator.
- **Length:** body lines under ~12 words; it's read after several pints.
- **Emoji:** not used. Iconography carries any symbolism.
- Examples: "Join the crawl", "Who's buying this round", "On to The White Hart?", "One more here", "Checked in at The Red Lion".

## Visual foundations
- **Color:** racing green `--green-800 #1F3B2D` (headers, primary buttons, inverse cards), gold leaf `--gold-500 #C9A24A` (rules, highlights, the CTA "gold" button, active states), oxblood `--oxblood-700 #6E1F24` (eyebrows, danger), cream `--cream-200 #F2E8D0` page / `--cream-100` cards. Neutrals are warm; no pure white or grey. Semantic: success = green-500, warning = amber-500, danger = oxblood-500.
- **Type:** DM Serif Display (italic for titles and the wordmark, roman for stop names and numerals) + Libre Franklin (body 15px, UI 600, eyebrows 600–700 at 11px with 0.35em tracking). Both from Google Fonts.
- **Rules & borders:** the signature motif is the **double gold rule** (`--rule-double` 4px, `--rule-double-thick` 6px) under headers, around framed cards, dialogs and the current stop. Elsewhere hairlines at 18% green.
- **Backgrounds:** flat colour only. Green header band over cream body. No gradients, no textures, no photography in the app.
- **Corner radii:** 4 (checkbox) / 8 (buttons, inputs) / 14 (cards, dialog, toast) / 22 (app icon) / pill (badges, switch). Avatars and stop numerals are circles.
- **Cards:** cream-100, 1px subtle border, very soft shadow (`--shadow-card`). Framed = double gold rule, no shadow. Inverse = green with cream text.
- **Shadows:** only two: `--shadow-card` (barely there) and `--shadow-raised` (dialogs, toasts). No inner shadows.
- **Hover:** primary lightens one step (green-800 → 700, gold-500 → 400); ghost/secondary get a 7% green tint.
- **Press:** 1px downward nudge (`translateY(1px)`), no scale.
- **Focus:** 3px gold ring at 35%.
- **Motion:** fades and a 10px rise, 140–220ms, `cubic-bezier(.2,.7,.2,1)`. No bounces, no loops.
- **Transparency/blur:** only the dialog scrim (green-950 at 62%). No blur.
- **Layout:** fixed green header band at top, fixed green tab bar at bottom with a double rule; content scrolls between. 16px side gutters, 10px gaps between list cards. Tap targets ≥44px.
- **Imagery:** none supplied. If added, warm, low-light pub interiors.

## Iconography
- **Lucide** (outline, 2px stroke) loaded from CDN `lucide-static@0.460.0` via the `Icon` component, rendered as a CSS mask so it takes `currentColor`. Substitution: no icon set was provided; Lucide's line weight suits Libre Franklin.
- Common icons: beer, stamp, route, map, map-pin, users, user, check, chevron-right, plus, x, settings, key-round.
- No icon font, no PNG icons, no emoji, no unicode glyphs as icons (the "·" and "—" separators are typographic only).
- Brand marks: `Logo` variants `lockup` (EST. 2026 / Pub Crawl / tagline), `wordmark`, `monogram` ("Pc" in a double-ruled tile, used as app icon).

## Index
- `styles.css` — imports only: `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `components.css` (component classes `pc-*`)
- `guidelines/` — specimen cards (colors, type, spacing, radii, shadows, rules, logo, iconography)
- `components/` — React primitives
- `ui_kits/app/` — crawl app click-through
- `explorations/Directions.html` — the four original directions
- `thumbnail.html`, `SKILL.md`

## Components
- **brand/** — Logo, Avatar, StopCard
- **core/** — Button, IconButton, Badge, Card, Icon
- **forms/** — Input, Checkbox, Switch
- **navigation/** — Tabs, TabBar
- **feedback/** — Dialog, Toast

Intentional additions: StopCard (a crawl stop row, the app's core unit) and Icon (wrapper for Lucide).
