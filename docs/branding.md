# Branding and theme

The dashboard borrows PetLibro's look: their greens, ink and paper, and square corners. It comes in a light mode and a dark mode, and follows the viewer's device setting by default.

Every color is a CSS variable (a *token*) defined in [`client/src/index.css`](../client/src/index.css). Components use tokens, never raw hex values or Tailwind's built-in palette. This page explains the system; `index.css` holds the exact values. If the two ever disagree, the CSS is right and this page needs updating.

## Typeface

- **Geist**, from Google Fonts (weights 300–700), loaded in [`client/index.html`](../client/index.html). It stands in for PetLibro's typeface, Söhne, which is a paid font from Klim Type Foundry.
- Fallbacks: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
- The font is set once, as `--app-font` in `index.css`. To change it, update that variable and the font link in `index.html`. Using Söhne itself would need a web license and self-hosted font files.
- Chart tooltips use `tabular-nums`, so numbers line up.

## Shape

- **Corners are square.** `--radius` is `0rem`, and every rounded utility (`rounded-sm` through `rounded-xl`) is calculated from it, so this one value controls the whole app.
- **`rounded-full` stays round.** It's used for badges and filter chips, avatars, icon circles, and progress bars (water level, hydration goal).
- **Cards are flat:** a border and no shadow. Things that float over the page (dialogs, menus, popovers) keep a shadow so they read as being on top.

## Brand colors

Where the palette comes from (petlibro.com and PetLibro's Brandfetch page):

| Color | Hex | How it's used here |
|---|---|---|
| Ink | `#121212` | Text, warmed slightly to `#121110` |
| Paper | `#ffffff` | Cards in light mode; the page itself is a warm off-white, `#f8f7f4` |
| Olive green | `#315800` | Primary color in light mode: buttons, active nav, focus ring |
| Bright green | `#0cac39` | Primary color in dark mode, where olive is too dark to read |
| Sand | `#cfb487` | A chart accent (`--chart-3`), darkened to `#936d24` in light mode |
| Signal red | `#e33200` | Basis for `--destructive`, darkened to `#cf300c` in light mode to reach 4.5:1 contrast |
| Navy | `#141432` | Basis for `--chart-5`, lightened so it reads in both modes |

## Interface colors

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `#f8f7f4` | `#11110f` | The page |
| `--card` | `#ffffff` | `#1a1918` | Cards |
| `--popover` | `#ffffff` | `#1e1e1c` | Menus and dropdowns |
| `--sidebar` | `#ffffff` | `#151513` | The sidebar |
| `--foreground` | `#121110` | `#ecebe8` | Body text |
| `--muted-foreground` | `#65635e` | `#a09e9a` | Secondary text, captions, chart axis labels |
| `--muted`, `--secondary` | `#f1f0ed` | `#222220` | Quiet fills: tab bars, progress-bar tracks, loading placeholders |
| `--accent` | `#edede9` | `#242421` | Hover and focus highlight in menus and buttons |
| `--border` | `#dfdedb` | `#2c2b29` | Borders and dividers |
| `--input` | `#d9d7d4` | `#333331` | Form field borders, plus a faint field fill in dark mode |
| `--primary`, `--ring` | `#315800` | `#0cac39` | Buttons, active nav, links, focus ring |
| `--primary-foreground` | `#ffffff` | `#121110` | Text on primary buttons |

Several tokens are written in OKLCH in the CSS; the hex values here are their sRGB equivalents.

### Status colors

| Token | Light | Dark | Means |
|---|---|---|---|
| `--success` | `#2f6e1f` | `#6ed274` | Good news: intake up, fountain online, account connected |
| `--warning` | `#9f6202` | `#e9b452` | Needs attention soon: water getting low, filter or cleaning coming due |
| `--destructive` | `#cf300c` | `#f96c4a` | Bad news or a destructive action: intake down, overdue maintenance, critically low water, offline, delete |

- Status colors mean status only. They're never used for chart series or decoration.
- They always come with an icon and words; color alone never carries the message.
- One set of cutoffs per measure. For example, the dashboard's water level bar turns amber below 40% and red below 20%, using the same constants as the low-water banners.

### Chart colors

**Chart furniture**

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--chart-grid` | `#e9e8e5` | `#292927` | Grid lines |
| `--chart-axis` | `#65635e` | `#a09e9a` | Axis lines and labels (same as muted text) |
| `--chart-cursor` | `#65635e` at 9% | `#ffffff` at 6% | Hover highlight behind a bar |

**Analysis page**

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--series-daily` | `#d0e7be` | `#23411c` | Daily intake bars, a pale tint so the average lines stand out |
| `--series-daily-edge` | `#89b373` | `#4c7643` | Dashed outline on today's bar, which is still in progress |
| `--series-avg7` | `#0c9b33` | `#9bce90` | 7-day average (dashed line) |
| `--series-avg30` | `#355e04` | `#0cac39` | 30-day average (solid line) |

**Trends page and dashboard icons**

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--chart-1` | `#428824` | `#0cac39` | Bars on the Trends page |
| `--chart-2` to `--chart-4` | `#315800`, `#936d24`, `#0cac39` | `#99c77f`, `#cfb487`, `#6ed274` | Icon accents on the dashboard's stat cards and Fountain Status rows |
| `--chart-5` | `#44467d` | `#9a9fd6` | Not used yet |

**Event markers** (Analysis page)

| Token | Light | Dark | Event types |
|---|---|---|---|
| `--event-neutral` | `#94928d` | `#686661` | Filter replaced, Fountain cleaned, Travel |
| `--event-food` | `#b45c03` | `#d67b34` | Food change |
| `--event-health` | `#a82795` | `#c041ab` | Medication, Vet visit |
| `--event-note` | `#2663c9` | `#4483eb` | Note |

- Seven event types share four colors, and the icon tells types apart within a color. With more than four colors, some pairs could no longer be told apart reliably.
- Marker colors stay away from green so they don't blend into the green chart lines. Yellow was tried for food and dropped: for people with red-green colorblindness it merges with the lines.
- Fountain maintenance is a neutral gray on purpose. It happens every couple of weeks, so over a long range it's background rather than news.
- The mapping lives in [`client/src/lib/event-categories.ts`](../client/src/lib/event-categories.ts).

## Rules of thumb

1. **Use tokens, not raw colors.** In Tailwind, that means classes like `bg-primary`, `text-muted-foreground` or `border-warning/40`. In Recharts and SVG props, pass the variable: `stroke="var(--series-avg7)"`. Never use Tailwind's built-in palette (`text-emerald-500`) or a hex value in a component.
2. **Text stays in text colors:** `foreground`, `muted-foreground`, or a status color alongside its icon. Chart colors are for bars, lines and markers; a colored swatch or icon next to a label shows which series it is.
3. **Status colors mean status** (see above).
4. **Each mode is designed, not inverted.** Every token has its own light and dark value, chosen and checked against that mode's background.
5. **Charts don't rely on color alone.** Line style (dashed or solid), marker icons, legends and tooltips all say what you're looking at.
6. **A color belongs to the thing, not its position.** An event type keeps its color whichever filters are on.

## Accessibility

How the current colors were checked, so new ones can be held to the same bar:

- **Text:** every text color clears WCAG AA (4.5:1) on both the card and the page, in both modes. The lowest is light-mode warning text on the page, at 4.6:1.
- **Chart lines, bars and markers:** at least 3:1 against the card.
- **Colorblind separation:** the two average lines differ from each other, and the four marker colors from one another, by at least 8 ΔE (OKLab, ×100) under simulated deuteranopia, protanopia and tritanopia, and by at least 15 for normal vision.
- **Deliberate exceptions:**
  - Daily bars are a pale tint, below 3:1, so the average lines read on top of them. Every bar has a hover tooltip with its value.
  - In dark mode, the 7-day line is lighter than the usual range so it shows up over the bars (6.3:1 against them).
  - For red-green colorblind viewers, the food marker is close to the green lines (ΔE about 4). Markers are vertical lines with icons while the chart's lines run horizontally, so the two stay distinguishable.
- The measured numbers sit in comments next to each group of tokens in `index.css`.

For a quick check in Chrome, DevTools → Rendering → **Emulate vision deficiencies** shows the page as colorblind viewers see it, and the DevTools color picker shows contrast ratios.

## Light and dark mode

- **Default: System.** The app follows the device's setting and switches live when it changes, for example when macOS goes dark at sunset.
- **Override:** pick System, Light or Dark in Settings → Appearance or the account menu. The choice is saved in that browser (`localStorage` key `theme`), not on the account.
- **How it switches:** the `.dark` class on `<html>` swaps in the dark token values. Tailwind's `dark:` variant keys off the same class, but you rarely need it, since tokens already change with the mode.
- **No white flash:** a small script in `client/index.html` applies the class before the page first paints. It follows the same rule as [`ThemeContext.tsx`](../client/src/contexts/ThemeContext.tsx), so change both together.
- **Browser UI:** `color-scheme` makes scrollbars and native form controls match the mode. The `theme-color` tags tint the browser toolbar on phones (`#f8f7f4` light, `#11110f` dark); they follow the device setting, not the in-app choice.
- **Clean switch:** CSS transitions are paused for a moment while the theme changes, so colors flip at once instead of fading.
- Toast notifications follow the current theme.

## Adding or changing a color

1. Define the token in both `:root` (light) and `.dark` in `index.css`. To use it as a Tailwind class, also register it in the `@theme inline` block (`--color-name: var(--name);`).
2. Pick each mode's value against that mode's background; don't just invert the light one.
3. Check contrast on both the card and the page: 4.5:1 for text, 3:1 for chart marks.
4. If it needs to be told apart from other chart colors, check colorblind separation too, and note the numbers in a comment next to the token.
5. Don't borrow a status color for data.
6. Look at it in both modes and at phone width before merging; Settings → Appearance switches instantly.
7. Update this page.
