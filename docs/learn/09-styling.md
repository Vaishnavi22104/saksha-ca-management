# Chapter 9 — Styling, and drawing charts by hand

There is no Tailwind, no Bootstrap, no Material UI, no icon package and no chart
library in this project. One CSS file and some SVG. This chapter explains how
that works and why it was chosen.

---

## 9.1 How CSS reaches the page

`app/globals.css` is imported once, in the root layout, and applies everywhere.
Components use ordinary class names:

```tsx
<span className="badge b-green">Completed</span>
```

```css
.badge { display: inline-block; padding: 4px 11px; border-radius: 999px;
         font-size: 11.5px; font-weight: 600; }
.b-green { background: var(--ok-050); color: var(--ok); }
```

Remember from chapter 1 that JSX uses `className` rather than `class`, because
`class` is a reserved word in JavaScript.

---

## 9.2 Design tokens

The top of the file defines every colour once, as **CSS custom properties**
(variables):

```css
:root {
  /* Palette: lime, pale lime, violet, near-black, white. */
  --lime-500:#BAF91A; --lime-300:#D3FC6B; --lime-200:#E2FF99; --lime-050:#F4FFDC; --lime-700:#587A00;
  --violet-500:#876DFF; --violet-400:#A292FF; --violet-100:#EDEAFF; --violet-700:#4B32C9;

  --canvas:#F1EFFF; --surface:#FFFFFF; --surface-2:#F7F7F4;
  --ink:#101312; --ink-2:#4B534F; --ink-3:#818A85;
  --line:#E7E6EF; --line-strong:#D2D1DE;

  --accent: var(--violet-700); --accent-soft: var(--violet-100);
  --danger:#D93A2B; --danger-soft:#FDECEA;

  --shadow: 0 1px 2px rgba(16,19,18,.04), 0 2px 8px rgba(16,19,18,.06);
}
```

Nothing in the rest of the file writes a raw hex value. Everything says
`var(--lime-500)`. Change the palette in one place and the whole app follows —
which is exactly what happened when the theme changed four times during
development.

Two habits worth copying:

**Semantic names on top of literal ones.** `--lime-500` is a colour;
`--accent` is a *role*. Components reference the role. When violet stopped being
the accent, one line changed.

**Legacy aliases during a rename.** The file keeps
`--mint-400: var(--lime-500)` and similar, so every class written against the old
palette kept working while the new one was rolled out. That is how you change a
design system without a big-bang rewrite.

### Dark mode

```css
@media (prefers-color-scheme: dark) {
  :root {
    --canvas:#0A0C0B; --surface:#141816; --surface-2:#1B211E;
    --ink:#EDF1EE; --ink-2:#A6AFAA;
    --line:#242B27;
    --shadow: none;
    color-scheme: dark;
  }
}
```

Because every rule uses tokens, dark mode is *only* this block. No component
knows about it. `color-scheme: dark` additionally tells the browser to render
native controls — scrollbars, form widgets — in dark.

---

## 9.3 Layout

Two CSS systems do almost all the work.

**Flexbox** — arranging things in a row or a column:

```css
.topbar { display: flex; align-items: center; gap: 14px; }
```

**Grid** — two dimensions at once:

```css
.app { display: grid; grid-template-columns: 244px 1fr; min-height: 100vh; gap: 14px; }
```

`244px 1fr` means: a fixed 244-pixel sidebar, then `1fr` — "one fraction", i.e.
all the remaining space.

The dashboard uses named grid areas, which make a complex layout readable:

```css
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  grid-template-areas: "hero ai" "pair ai";
}
.dash-grid .hero-card { grid-area: hero; }
.dash-grid .ai-card   { grid-area: ai; }
.dash-grid .dash-pair { grid-area: pair; }
```

You can see the shape of the page in the CSS.

### Responsive design

```css
@media (max-width: 860px) {
  .wa { grid-template-columns: 1fr; }
  .wa:has(.wa-thread-pane) .wa-side { display: none; }
}
```

A **media query** applies rules only at certain screen sizes. The second line
uses `:has()` — a relatively new selector meaning "an element that contains".
Here: on a phone, if a conversation is open, hide the list. That is the
WhatsApp behaviour, in one line of CSS with no JavaScript.

---

## 9.4 Accessibility, cheaply

Small habits, used consistently:

**`.sr-only`** hides something visually but leaves it for screen readers:

```css
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
           overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

Used for form labels that the design does not show, and for chart data tables.

**ARIA roles on feedback.** `role="alert"` on errors (announced immediately),
`role="status"` on success (announced politely).

**`aria-label`** on icon-only buttons, so "Send message" is announced rather than
nothing.

**Respecting motion preferences.** Every animation is wrapped:

```css
@media (prefers-reduced-motion: reduce) {
  .up-bar i, .ai-dots i { animation: none; transition: none; }
}
```

Some people get motion sickness from animated interfaces. This is two lines.

---

## 9.5 Charts, drawn by hand

`components/charts.tsx` is about 200 lines and provides four charts. A chart
library would be 50–150 KB of JavaScript shipped to every visitor for the same
result.

All four are **Server Components** — they produce SVG on the server, so the
browser receives a finished picture with no JavaScript at all.

**SVG** is XML that describes shapes. A circle is `<circle cx cy r>`; an
arbitrary shape is `<path d="...">` where `d` is a sequence of drawing commands.

### `Donut`

The trick is that a donut is one circle with a thick, dashed outline, where the
dashes are computed to be exactly the right lengths:

```tsx
const R = 54;
const C = 2 * Math.PI * R;          // circumference
let offset = 0;

slices.map((s) => {
  const fraction = s.value / total;
  const dash = fraction * C;         // how much of the ring this slice covers
  const el = (
    <circle
      r={R} cx={70} cy={70} fill="none"
      stroke={`var(${s.colour})`} strokeWidth={16}
      strokeDasharray={`${dash} ${C - dash}`}
      strokeDashoffset={-offset}
      transform="rotate(-90 70 70)"
    />
  );
  offset += dash;
  return el;
});
```

`strokeDasharray="30 70"` means "draw 30 units, skip 70, repeat". By making the
gap the *rest of the circle*, each circle draws exactly one arc.
`strokeDashoffset` rotates that arc to start where the previous one ended. The
`rotate(-90)` moves the start from 3 o'clock to 12 o'clock.

### `BarRows`

Horizontal bars, width as a percentage:

```tsx
// 18% headroom: without it, a set of equal values all render at 100%
// and the chart says nothing.
const max = Math.max(1, ...rows.map((r) => r.value)) * 1.18;
// ...
<i style={{ width: `${Math.max(6, (r.value / max) * 100)}%`, background: `var(${r.colour})` }} />
```

Two details learned from a real bug. The **18% headroom** exists because when
three services each had exactly 3 tasks, every bar was full and the chart
conveyed nothing. The **6% floor** exists so a value of 1 next to a value of 50 is
still a visible sliver rather than an invisible line.

### `TrendArea`

A line chart. The real work is mapping data values to pixel coordinates:

```tsx
const W = 560, H = 190, PAD_L = 34, PAD_R = 12, PAD_T = 14, PAD_B = 26;
const max = Math.max(1, ...points.map((p) => p.value));
const top = Math.ceil(max * 1.2);
const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1);
const y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B);

const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
const area = `${line} L${x(points.length - 1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
```

`M` is move-to, `L` is line-to, `Z` closes the shape. The area is the same line
plus two corners, closed, so it can be filled with a gradient.

`y` inverts because SVG's y-axis grows **downward**: a bigger value must produce
a *smaller* y. That single `1 - v / top` is the thing beginners get wrong.

Only the endpoints and the peak are labelled — a chart with a label on every
point is noise.

### `Gauge`

A half-ring, using the same dash trick on a semicircular path:

```tsx
const R = 78;
const HALF = Math.PI * R;               // length of a half circle
const filled = (pct / 100) * HALF;
// path: M (100-R) 100  A R R 0 0 1 (100+R) 100
// strokeDasharray: `${filled} ${HALF}`
```

`A` is the arc command.

### Charts are accessible

Every chart carries `role="img"` with a written `aria-label`, and renders the same
numbers as a screen-reader-only table:

```tsx
<table className="sr-only">
  <caption>{hint}</caption>
  <tbody>{points.map((p) => <tr key={p.label}><th scope="row">{p.label}</th><td>{p.value}</td></tr>)}</tbody>
</table>
```

A picture is not information if you cannot see it. Six lines fixes that.

---

## 9.6 Animation

There is no animation library. Three CSS mechanisms cover everything.

**Transitions** — smooth a property change:

```css
.vt { transition: border-color .15s ease, transform .15s ease; }
.vt:hover { transform: scale(1.06); }
```

**Keyframes** — a named sequence:

```css
@keyframes ai-blink { 0%, 80%, 100% { opacity: .3; } 40% { opacity: 1; } }
.ai-dots i { animation: ai-blink 1.2s ease-in-out infinite; }
.ai-dots i:nth-child(2) { animation-delay: .18s; }
.ai-dots i:nth-child(3) { animation-delay: .36s; }
```

Three dots, one animation, staggered by delay. That is the "typing" indicator.

**Scroll-driven animation** on the landing page — elements that appear as they
enter the viewport, with no JavaScript:

```css
@supports (animation-timeline: view()) {
  .lp-card { animation: rise linear both; animation-timeline: view(); animation-range: entry 10% cover 30%; }
}
```

The `@supports` wrapper means browsers that do not understand it simply show the
content normally. That is **progressive enhancement**: the page works everywhere,
and looks better where the browser can manage it.

---

## 9.7 The honest trade-offs

**What hand-written CSS bought:** no build tooling beyond Next's own; no class
soup in the markup; a design that matches an identity exactly; a tiny bundle; and
the ability to read the styles for a component in one place.

**What it cost:** `app/globals.css` is ~90 KB in one file. There is no compiler
telling you a class is unused or misspelled — `className="badge-green"` when the
class is `b-green` fails silently. Organising it is your job, and it needs
discipline: the file is grouped by area with banner comments, and every new
section is appended with one.

At a larger team size, CSS Modules (one stylesheet per component, class names
scoped automatically) would be the natural next step without giving up plain CSS.

**Why no icon library.** Every icon in the app is an inline `<svg>` with a `path`.
About twenty of them. An icon package would be larger than every other dependency
combined, and inline SVG inherits `currentColor`, so icons follow the text colour
for free.
