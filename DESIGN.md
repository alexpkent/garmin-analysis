---
name: Garmin Data Analysis
description: Dark, data-dense personal training analytics UI with restrained accent emphasis and semantic sport colors.
colors:
  # ── Surfaces & structure ──────────────────────────────
  bg: "#212529"
  card-bg: "#1a1d21"
  card-border: "#343a40"
  border-mid: "#495057"
  surface-hover: "#2a2d31"
  # ── Text scale ────────────────────────────────────────
  text-bright: "#f8f9fa"
  text-light: "#dee2e6"
  muted: "#adb5bd"
  dim: "#6c757d"
  # ── Accent & interaction ──────────────────────────────
  accent: "#e8b84b"
  link: "#4dabf7"
  link-hover: "#74c0fc"
  # ── Semantic status ───────────────────────────────────
  status-good: "#66bb6a"
  status-info: "#4dabf7"
  status-warn: "#ff8c00"
  status-alert: "#e63419"
  status-muted: "#adb5bd"
  # ── Training status (Garmin-mapped) ──────────────────
  training-productive: "#1fa87a"
  training-maintaining: "#4dabf7"
  training-peaking: "#e8b84b"
  training-recovery: "#4caf50"
  training-unproductive: "#ff8c00"
  training-overreaching: "#e63419"
  training-detraining: "#6c757d"
  # ── Sport category ────────────────────────────────────
  run: "#ff6040"
  ride: "#40c8ff"
  football: "#4caf50"
  other: "#ffc940"
typography:
  display:
    fontFamily: "Roboto, Helvetica Neue, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Roboto, Helvetica Neue, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  micro: "2px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "10px"
  badge: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  card:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  card-header:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-bright}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card-bg}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-accent-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card-bg}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    rounded: "{rounded.sm}"
    size: "36px"
    padding: "6px"
  input-search:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-bright}"
    rounded: "{rounded.md}"
    padding: "5px 28px"
  nav-link-default:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  nav-link-active:
    backgroundColor: "rgba(232,184,75,0.09)"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  load-gauge-track:
    backgroundColor: "{colors.border-mid}"
    rounded: "{rounded.micro}"
    height: "10px"
  assess-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-light}"
    rounded: "0"
    padding: "10px 16px"
---

# Design System: Garmin Data Analysis

## 1. Overview

**Creative North Star: "The Training Intelligence Cockpit"**

This is a dark, practical analytics surface designed for one athlete who returns to it repeatedly to answer training questions quickly. The visual vocabulary is deliberately calm and dense: information hierarchy drives attention, not decoration. Every design decision serves the task — reading a trend, comparing two periods, locating a personal record — rather than creating an impression.

Color is deployed with strict economy. The warm amber accent is reserved for active controls and key data signals; saturated sport colors carry semantic meaning and are never decorative fills. Status indicators — good/warn/alert/info — use a distinct color set that does not overlap with sport colors or the primary accent, preventing false associations between training type and training quality.

Motion is purposeful rather than theatrical. Page content fades in on load, assessment items stagger in from the left, gauge markers animate into position, and the navigation icon lifts subtly on hover. All motion is strictly state-triggered or on-entry; none of it plays on idle content.

**Key Characteristics:**

- Three-step dark surface hierarchy (`#212529` → `#1a1d21` → `#2a2d31`)
- One warm accent; four semantic sport colors; a separate status semantic vocabulary
- Weight and size deltas for type hierarchy — clamp-scale headings are absent
- Flat surfaces at rest; shadows only on transient floating UI
- Purposeful micro-motion with full `prefers-reduced-motion` coverage

## 2. Colors: The Signal Economy Palette

This palette keeps resting surfaces near-black, deploys accent sparingly, and uses distinct hue families for sport identity vs. assessment status so neither signal bleeds into the other.

### Primary

- **Focused Amber** (`#e8b84b`): Active nav link, active toggle button fill, card section headings, key metric accents. Used at ≤10% surface coverage.

### Secondary

- **Action Blue** (`#4dabf7`): Interactive links, navigation text affordances, chart axis labels for the primary load metric (CTL), and informational assessment icons. Also the "info" semantic status color — its dual role works because both contexts convey "notable but not urgent."

### Tertiary: Sport Identity Colors

These four are semantic identifiers for activity type. They appear on category badges, filter chips, chart datasets, Training Log bubbles, and heatmap overlays. Do not reuse them as status indicators.

- **Run Coral** (`#ff6040`): Running/anaerobic.
- **Ride Cyan** (`#40c8ff`): Cycling.
- **Football Green** (`#4caf50`): Football and load zone (low aerobic gauge marker). Distinct from `status-good` by saturation.
- **Other Gold** (`#ffc940`): Other activities and high-aerobic gauge marker.

### Status Semantic Colors

A parallel vocabulary for assessment and fitness quality signals. Kept intentionally separate from sport colors.

- **Status Good** (`#66bb6a`): Positive assessment labels ("Consistent Training," "Good Variety"). Lighter, less saturated than football green — perceptibly different at a glance.
- **Status Info** (`#4dabf7`): Informational/neutral assessments and chart axes. Shares token with `$link`; both convey "interactive/notable."
- **Status Warn** (`#ff8c00`): Moderate warnings.
- **Status Alert** (`#e63419`): High-priority alerts and the navigation badge.
- **Status Muted** (`#adb5bd`): Unknown or indeterminate state labels.

### Training Status Colors (Garmin-mapped)

Seven values mapping directly to Garmin's training status API. Used only on the training-status chip/badge.

`productive #1fa87a` · `maintaining #4dabf7` · `peaking #e8b84b` · `recovery #4caf50` · `unproductive #ff8c00` · `overreaching #e63419` · `detraining #6c757d`

### Neutral

- **System Background** (`#212529`): App shell, nav rail, dense background.
- **Card Surface** (`#1a1d21`): Primary content containers.
- **Border Base** (`#343a40`): Default card edges; nav rail border.
- **Border Mid** (`#495057`): Stronger structural delineation; load-gauge track background.
- **Surface Hover** (`#2a2d31`): Row separator, hover layer, inset within cards.
- **Text Bright** (`#f8f9fa`): High-emphasis values.
- **Text Light** (`#dee2e6`): Standard body and supporting content.
- **Muted** (`#adb5bd`): Secondary labels, chart tick labels, stat captions.
- **Dim** (`#6c757d`): Tertiary metadata; detraining status only. Not for small body text — contrast on dark card surface is ~3.5:1, below 4.5:1 threshold. Stick to `$muted` for any functional text under 18px.

**The Signal Budget Rule.** Warm amber and saturated category hues must remain sparse. Most pixels are neutral. Rarity is what makes accent and status colors meaningful.

**The No-Overlap Rule.** Sport colors and status-semantic colors are separate families. Never reuse `$football-color` (#4caf50) as a "success" status indicator — that's `$status-good` (#66bb6a).

## 3. Typography

**Display / Body / Label Font:** Roboto (fallback: Helvetica Neue, sans-serif)

**Character:** Single-family, purely utilitarian. No display–body pairing contrast; legibility under density is the only goal. Weight variation carries all hierarchy.

### Hierarchy

- **Display** (700, `1.25rem`, lh `1.1`): Prominent KPI values, hero stat numbers.
- **Headline** (700, `1.05rem`, lh `1.2`): Card-level emphasized values.
- **Title** (700, `0.95rem`, lh `1.2`): Card headers, section labels, navbar title.
- **Body** (400, `0.85rem`, lh `1.45`): Explanatory text and assessment descriptions.
- **Label** (600, `0.68rem`, lh `1.2`, `0.06em` tracking, uppercase): Stat captions, metadata rows, compact filter controls.

**The Scan-First Rule.** Hierarchy is delivered through weight and compact size steps only. Fluid typography (`clamp()`) is not used; the user views this at consistent desk/couch DPI and a stable layout is an asset.

## 4. Elevation & Motion

### Elevation

Depth is tonal (three surface steps) with structural borders. Shadows are reserved for floating UI only.

#### Shadow Vocabulary

- **Overlay Lift** (`0 8px 32px rgba(0,0,0,0.6)`): Day detail popup, modal surfaces.
- **Popup Lift** (`0 4px 24px rgba(0,0,0,0.6)`): Leaflet map popups, floating contextual containers.
- **Marker Pin** (`1px 0 3px rgba(0,0,0,0.55), -1px 0 0 rgba(0,0,0,0.25)`): Load gauge marker bar — gives the thin 3px bar enough depth to read against the track.

**The Flat-by-Default Rule.** Resting content surfaces rely on tone and borders, not shadows. Shadows appear only on transient floating UI.

### Motion Vocabulary

All animations are purely state-triggered or on-entry. No idle animation. All respect `prefers-reduced-motion: reduce` (typically `animation: none; transition: none`).

#### Easing

- **Standard entrance**: `cubic-bezier(0.2, 0, 0, 1)` — ease-out-expo. Used for all content/component entries.
- **Spring pop**: `cubic-bezier(0.34, 1.2, 0.64, 1)` — gentle overshoot. Nav icon hover lift, badge pop-in.

#### Named animations

- **`content-enter`** (`opacity 0→1 + translateY 8px→0, 300ms`): Page content wrapper on load. Every route's loaded content block uses this.
- **`row-slide-in`** (`opacity 0→1 + translateX -10px→0, 300ms, stagger 40ms/item`): Assessment insight rows entering the card.
- **`band-enter`** (`scaleX 0.4→1 + opacity, 500ms, 100ms delay`): Load zone gauge target band from left edge.
- **`marker-enter`** (`scaleY 0.2→1 + opacity, 450ms, 400ms delay`): Load zone gauge actual-value marker appearing after band.
- **`icon-bloom-good`**: Assessment icon entry for good/info level — scale 0.4→1 with overshoot.
- **`icon-pulse-alert`**: Assessment icon entry for alert level — scale pulse.
- **`icon-wobble-warn`**: Assessment icon entry for warn level — rotation wobble.
- **`loading-color-cycle`** (`4s, linear, infinite`): Loading ring arc cycles through all four sport colors.

**The Motion-Earns-Its-Place Rule.** Do not add CSS animations to surfaces that are already loaded or stable. Motion marks transition moments: page arrival, data becoming available, user-triggered state change.

## 5. Components

### Buttons

Compact, shape-stable across context. Radius never exceeds `8px`.

- **Accent/Active Toggle:** Amber fill (`$accent`) + dark text (`$card-bg`), `4px` radius, `4px 10px` padding. Used for period granularity active state.
- **Ghost/Filter:** Transparent base, `$muted` text, `1px $border-mid` border, `6px` radius. Hover lifts border to `$dim` and brightens text.
- **Icon Button:** Transparent, link-blue icon (`$link`), `4px` radius, `36×36px` minimum target. Hover adds `rgba($link, 0.12)` fill. Focus visible: `2px solid $link` outline.

### Load Zone Bullet Chart (Signature Component)

A classic bullet graph: dark track, zone-tinted target band, solid actual-value marker. Used for Low Aerobic, High Aerobic, and Anaerobic load zones.

- **Track:** Full-width `10px` bar, `$border-mid` fill, `2px` radius, `overflow: hidden`.
- **Target band:** Positioned absolute within track. Colors: low-aerobic `rgba(76,175,80,0.30)`, high-aerobic `rgba(232,184,75,0.30)`, anaerobic `rgba(255,96,64,0.24)`. Animates in with `band-enter`.
- **Marker:** `3px` wide absolute bar, sport-matched fill (green/amber/coral). `marker-enter` animation with pin shadow. Transitions `left` on data update (`0.3s ease-out`).

### Navigation

- **Desktop:** Fixed left rail, `200px` wide, `$bg` background, `1px $card-border` right border.
- **Default link:** Muted text (`$muted`), no background, `4px` rounded, `2px 8px` margin.
- **Hover:** White text, `rgba(255,255,255,0.07)` fill. Icon lifts `scale(1.15) translateY(-2px)` with spring easing.
- **Active:** Amber text (`$accent`), `rgba(232,184,75,0.09)` fill, amber drop-shadow glow on icon.
- **Alert badge:** Red pill (`#e63419`), `8px` radius, pops in with `badge-pop` spring animation.
- **Mobile:** Fixed bottom tab bar, `56px` height, icon + label layout.

### Training Assessment Row

- **Layout:** Icon + `gap: 12px` + body column. `10px 16px` padding. Bottom border `$surface-hover` (last child: none).
- **Icon:** `0.88rem`, colored by insight level, animated on entry by level (see Motion).
- **Label:** `0.75rem`, 700, uppercase, `0.06em` tracking, colored to match icon.
- **Text:** `0.85rem`, 400, `$text-light`, `lh 1.45`.
- **Stagger:** `40ms` per row (rows 1–12 covered), `row-slide-in` entrance.

### Cards / Containers

- **Base:** `#1a1d21` background, `1px #343a40` border, `8px` radius.
- **Header band:** `#212529` background (slightly darker), `10px 14px` padding, stronger title contrast.
- **Body padding:** `12px 16px`.

### Chips / Badges

- **Activity-type chips:** Pill `10px` radius, low-opacity semantic fill, matching border and text.
- **Nav alert badge:** Red `#e63419` pill, `8px` radius, `0.6rem` bold white text.

### Inputs / Fields

- **Search:** Dark card surface, `1px $border-mid` border, `6px` radius, icon-leading affordance (`28px` left padding). Focus: `$accent`-colored border.
- **Placeholder:** `$dim` text.

### Loading State

- **Ring:** `56px` circle, `3px` border, `$surface-hover` track. Arc color cycles through all four sport colors (`loading-color-cycle`, `4s`).
- **Message:** Route-specific text (e.g. "Pulling in your sessions…"), `0.85rem` 600 uppercase `$muted`, crossfades every `2.8s` with a `260ms` fade-out/in.
- **Reduced motion:** Static ring, amber arc, no message cycling.

## 6. Do's and Don'ts

### Do

- **Do** keep the UI dark-neutral first and reserve saturated hues for meaningful state/category signals.
- **Do** use `$status-good` (#66bb6a) for positive assessment states, not `$football-color` (#4caf50) — they are different semantic roles.
- **Do** use `$muted` (#adb5bd) for any small functional text on dark card surfaces; `$dim` fails 4.5:1 contrast for text under 18px.
- **Do** maintain consistent `4px`/`6px`/`8px` radius and `$card-border`/`$border-mid` border scales across all surfaces.
- **Do** add `prefers-reduced-motion: reduce` alternatives for every animation — typically `animation: none; transition: none`.
- **Do** animate only at transition moments: page arrival, data-load completion, user-triggered state change.
- **Do** keep navigation and filtering affordances visually stable between pages.

### Don't

- **Don't** use template card-grid ecommerce styling patterns for analytics content (PRODUCT.md anti-reference).
- **Don't** introduce promotional banner or sale visual language (PRODUCT.md anti-reference).
- **Don't** add decorative gradients or theatrical idle animation as a default treatment (PRODUCT.md anti-reference).
- **Don't** overuse `$accent` (#e8b84b) as a broad fill — its rarity is what makes active states legible.
- **Don't** reuse sport colors (run/ride/football/other) as semantic status indicators — use the status semantic family instead.
- **Don't** use `$dim` (#6c757d) for small body text or stat captions — use `$muted` (#adb5bd).
- **Don't** animate layout properties (width, height, padding, top/left changes that trigger reflow) — animate transform and opacity only.
