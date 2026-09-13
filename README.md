# quarto-thumbnail-preview

[![Render demos](https://github.com/Lucasfrit/quarto-thumbnail-preview/actions/workflows/demo.yml/badge.svg)](https://github.com/Lucasfrit/quarto-thumbnail-preview/actions/workflows/demo.yml)

**[Live demos](https://lucasfrit.github.io/quarto-thumbnail-preview/)** - rendered by CI
from this repository on every push to `main`.

Four [Quarto](https://quarto.org) Reveal.js extensions for decks built around
figures, usable together or one at a time:

| Extension | What it does |
|---|---|
| **`thumbnail-preview`** | A sidebar of real DOM-cloned slide previews that takes real screen width, so the deck rescales beside it instead of sitting underneath |
| **`theme-toggle`** | Light and dark, following the system, with a corner button and `Shift+D` |
| **`plot-slides`** | Full-slide Plotly figures that stay sized to their slide and follow the theme, plus a calculation-slide layout to pair with them |
| **`plot-explorer`** | A dropdown, a slider and toggles for any Plotly figure, plus zoom that draws a long signal as a min/max envelope and sharpens to every sample - all built from tags on the traces |

None of them needs Python. `plot-slides` and `plot-explorer` are only useful
if your deck has Plotly figures, however you make them.

```
┌──────────────┬──────────────────────────────────┐
│  Slide 1     │                                  │
│ ┌──────────┐ │         ACTUAL SLIDE             │
│ │ preview  │ │                                  │
│ └──────────┘ │        scaled to fit             │
│  Slide 2     │       available space            │
│ ┌──────────┐ │                                  │
│ │ preview  │ │                                  │
│ └──────────┘ │                                  │
└──────────────┴──────────────────────────────────┘
```

The thumbnails are clones of the real slide DOM, not screenshots, so they pick
up your theme, code highlighting, columns and typeset equations.

## Install

```bash
quarto add Lucasfrit/quarto-thumbnail-preview
```

This installs all four into `_extensions/`. Then list the ones you want:

```yaml
---
format: revealjs
revealjs-plugins:
  - thumbnail-preview     # the rail
  - theme-toggle          # optional: light and dark
  - plot-slides           # optional: if the deck has Plotly figures
---
```

That is enough - each starts with sensible defaults, and an extension you
do not list is installed but never loaded.

## Try the examples

```bash
quarto preview example/demo.qmd          # rail and theme toggle - no Python
quarto preview example/demo-plots.qmd    # adds a Plotly figure - needs Python
quarto preview example/demo-explorer.qmd # dropdown, slider, toggles, zoom - needs Python
```

`demo-plots.qmd` and `demo-explorer.qmd` render their figures from Python with
`embed-resources: true`,
the way a real figure deck does, so it needs `jupyter`, `numpy` and `plotly`.
`demo.qmd` needs nothing but Quarto.

All three are also [online](https://lucasfrit.github.io/quarto-thumbnail-preview/),
so you can try every extension before installing anything.

## CI

`.github/workflows/demo.yml` runs on every push and pull request. It checks the
promises this README makes rather than only that something builds:

- `demo.qmd` renders with Python made unusable, so it stays Quarto-only
- `demo-plots.qmd` renders from Python with `plotly >= 5.18`
- `demo-explorer.qmd` renders from Python
- each rendered demo actually loads its plugins
- `quarto add` into an empty project installs all four, and a deck listing
  only one of them renders on its own

On `main` it then publishes the demos to GitHub Pages.

## Dark mode

The repository carries a second, independent extension: **`theme-toggle`**,
light and dark for the deck itself. Quarto has no light/dark switch for reveal
decks — the one in its documentation is a website feature — so a deck that
wants one has to carry it.

```yaml
---
format: revealjs
revealjs-plugins:
  - thumbnail-preview
  - theme-toggle
theme-toggle:
  default: system      # or "light" / "dark" to pin the starting mode
  shortcut: D          # Shift+D
---
```

It follows `prefers-color-scheme`, puts a ☀/☾ button in the bottom-right
corner, and remembers a deliberate choice so a deck reopened for a talk comes
back the way it was left. Double-click the button to go back to following the
system. PDF export is always light: printing wants ink on paper.

| Option | Default | What it does |
| --- | --- | --- |
| `default` | `system` | Starting mode before anyone chooses. A remembered choice wins over it. |
| `shortcut` | `D` | Pressed with Shift. Set to `false` for no shortcut. |
| `showButton` | `true` | Off when the deck puts its own control in the chrome. |
| `styleSlides` | `true` | Paint Reveal's own surfaces when dark. Off when the deck's CSS answers `[data-theme="dark"]` itself. |
| `remember` | `true` | Off for a kiosk that should come up the same way every morning. |
| `storageKey` | `quarto-deck-theme` | Where the choice is remembered. |

The two extensions know about each other in exactly one place: a thumbnail is
a clone of the real slide, so its card follows `data-theme` too. A dark deck
cloned onto a white card is light text on white, which is no preview at all.
Used without `theme-toggle`, the rail draws the light card it always did.

### Colours the plugin cannot reach

`theme-toggle` owns the *state* and the *chrome*. Anything whose colours do not
live in CSS is the deck's own business — a Plotly figure keeps its palette in
the figure's layout, and no stylesheet reaches it. Register a callback and
repaint:

```js
RevealThemeToggle.onChange(function (mode) {
  repaintMyFigures(mode);   // also called once, immediately
});
```

`onChange` fires immediately with the current mode, so a deck that registers
late still paints correctly instead of waiting for the first switch, and it
fires only on a real change — following the system while already in the
system's mode is not one, and a needless repaint of a figure-heavy deck costs
most of a second of blocked main thread.

Also available: `RevealThemeToggle.mode()`, `.isOverridden()`, `.set(mode)`,
`.toggle()` and `.follow()`.

## Plot slides

A third extension, **`plot-slides`**, for decks built around figures and the
calculations behind them.

```yaml
revealjs-plugins:
  - thumbnail-preview
  - theme-toggle
  - plot-slides
```

It gives you two slide shapes and fixes the two things Plotly needs inside a
reveal deck.

**`.plot-slide`** — the figure *is* the slide. Title on one line, figure
fills the rest.

```markdown
## Damped free decay {.plot-slide}
```

**`.calc-slide`** — the derivation that produced it: equations and a table of
values, densely set, because here they are the content rather than an aside.
(Quarto's own `.smaller` is matched too, so a deck already using that keeps
working.) Used as a pair — the calculation, then the picture — so a reader can
check a number without the figure slide carrying a wall of text.

**Sizing, which is what makes zoom usable.** Reveal keeps every slide in the
DOM but lays out only the current one, so a figure first drawn off screen
measures a container with no usable width and keeps Plotly's 700px default
inside a full-width div — and nothing then tells it the container changed. A
figure that is not the size of its slide is one you cannot zoom into usefully,
because the drag-to-zoom region is the wrong shape. The plugin resizes the
visible figures on every slide change, and only the visible ones: on a large
deck, resizing all of them each time is most of a second of blocked main
thread per slide.

**Theme.** Plotly keeps its colours in the figure's layout, where no
stylesheet reaches them, so CSS alone cannot make a figure dark. The plugin
repaints backgrounds, fonts, gridlines, axes, hover labels, the legend, the
modebar and boxed annotations. It drives this off `RevealThemeToggle.onChange`
when `theme-toggle` is present, and otherwise watches the `data-theme`
attribute directly, so a deck with its own switch works too.

A figure whose colours carry meaning opts out:

```python
fig.update_layout(meta={"themeRepaint": False})
```

| Option | Default | What it does |
| --- | --- | --- |
| `resize` | `true` | Keep figures sized to their slide. |
| `theme` | `true` | Repaint figures when the theme changes. |

## Plot explorer

A fourth extension, **`plot-explorer`**, puts controls on any Plotly figure: a
dropdown, a slider, toggles, and zoom for long signals. **[See it
live](https://lucasfrit.github.io/quarto-thumbnail-preview/demo-explorer.html)**
- all data in that demo is synthetic.

```yaml
revealjs-plugins:
  - plot-explorer
```

There is no helper library. The controls are built in the browser from tags
on the figure, so it works however the figure was made - Python, R or plain
JavaScript.

### Dropdown, slider, toggles

Tag each trace with what it belongs to, and say which controls the figure wants:

```python
fig.add_scatter(x=f, y=magnitude, meta={
    "set": "SIM_20260913_rigA_fn42Hz_R1",   # which dropdown entry
    "step": 0.02,                           # which slider position
    "group": "measured",                    # which toggle
})

fig.update_layout(meta={"explorer": {
    "dropdown": "recording",                # label, or true
    "slider": "damping",                    # label, or true
    "sliderFormat": "ζ = {value}",          # optional
    "toggles": True,                        # or a label
    "default": {"set": "SIM_20260913_rigA_fn42Hz_R1", "step": 0.02,
                "groups": ["measured", "model"]},
}})
```

A trace with no `set` shows for every entry, with no `step` at every slider
position, and with no `group` always. Numeric `step` values are sorted; others
keep their order. One `group` drives every trace carrying it, across subplots,
so a single box shows magnitude and phase together.

Everything is pre-computed - a published deck cannot re-run your analysis - so
the figure holds every combination and the controls only choose what is shown.

**Why not Plotly's own dropdowns and sliders?** A Plotly control carries a fixed
argument list, so every step has to spell out the other controls' choices; with
two present, whichever was used last silently resets the other. Here what is
shown is always the intersection of all controls. And an HTML checkbox can be
*disabled*, which a legend entry cannot.

### The rules it follows

- **Every dropdown entry draws when chosen.** If none of the ticked groups
  exists in that entry, the ones that do are ticked. Unticking a box yourself
  is never undone.
- **A missing curve is greyed out**, with the reason on hover, rather than
  offered and drawing nothing.
- **A missing slider position snaps** to the nearest one the entry has, and
  the readout says so. The console warns you once about the gap.
- **Name dropdown entries in full** - a file name, not "run 2". The plugin shows
  whatever you tag; the convention is what makes a figure traceable.

### Zoom for long signals

A 240 000-sample signal drawn on an 800-pixel plot shows nothing more than 800
columns can. Give the trace empty `x`/`y` and its samples in `meta.zoom`:

```python
import base64, numpy as np

def zoom_samples(x0, dx, y, resolution):
    y = np.asarray(y, dtype=float)
    offset = float((y.max() + y.min()) / 2)
    stored = np.round((y - offset) / resolution).astype("<i2")
    return {"x0": x0, "dx": dx, "dtype": "int16", "scale": resolution,
            "offset": offset, "y": base64.b64encode(stored.tobytes()).decode()}

fig.add_scatter(x=[], y=[], meta={"zoom": zoom_samples(0.0, 1 / fs, signal, 0.01)})
```

The plugin keeps the samples in the browser and draws **one min/max pair per
pixel column** for whatever is on screen, rebuilt on every zoom:

- no peak is lost when zoomed out - a 2 ms spike still shows at full height;
- nothing is invented - it is the envelope of the real samples, not smoothing;
- zoomed in far enough, it draws **every sample**, and the readout says which
  you are looking at.

`dtype` is `float32` (default), `float64`, `int16` or `uint16`; with an integer
type each stored value times `scale` plus `offset` is the sample. `int16` halves
the size of float32, which is what makes a long recording affordable in a deck.
A plain JSON array works too. Samples are uniformly spaced (`x0`, `dx`).
Zoomable traces can carry `set`/`group` tags like any other, so a dropdown can
switch between recordings. Double-click restores the full record.

| Option | Default | What it does |
| --- | --- | --- |
| `rawThreshold` | `0` | Visible samples below which every sample is drawn; `0` means the plot's width in pixels |

Figures drawn after the deck loads are wired on the next slide change; call
`RevealPlotExplorer.refresh()` to wire them immediately.

## Configuration

Options go at the **top level** of the document YAML, under the **kebab-case**
key `thumbnail-preview`:

```yaml
revealjs-plugins:
  - thumbnail-preview
thumbnail-preview:
  mode: pinned            # pinned | overlay
  drawerWidth: 280        # width of the rail, px
  previewWidth: 220       # width of one thumbnail, px
  shortcut: p             # key that shows/hides the sidebar
  allowModeToggle: true   # show the pin/unpin button in the header
  allowResize: true       # let the rail be dragged wider or narrower
  minDrawerWidth: 140     # smallest rail width a drag may reach, px
  accentColor: "#4c8dff"  # ring around the current slide
```

The location matters. Quarto only forwards plugin options that the plugin
declares under `contributes.revealjs-plugins[].config` in `_extension.yml`, and
it looks the user's overrides up under the *kebab-cased* name of that key. A
`thumbnailPreview:` block nested inside `format: revealjs:` is silently dropped
before it ever reaches `Reveal.initialize()`, and the plugin then falls back to
its own defaults.

Sub-keys stay camelCase — only the top-level key is kebab-cased.

## Resizing the previews

Drag the rail's right edge. The thumbnails grow and shrink with it, keeping the
gutter (`drawerWidth - previewWidth`) that the YAML asked for, and the deck
re-lays out live beside them.

- **Double-click** the edge to return to the configured width.
- The handle is focusable: **←/→** resize in 16px steps, **shift** for 48px,
  **Home** resets. Those keys are Reveal's own navigation keys, so the handler
  stops the event before it reaches Reveal — arrows only resize while the
  handle has focus.
- The chosen width is remembered per document in `localStorage`, so it survives
  a reload. Double-click, or clear site data, to get the YAML width back.
- A drag cannot make the rail narrower than `minDrawerWidth`, or wide enough to
  push the deck under Reveal's scroll-view threshold (see the note below).

Set `allowResize: false` to remove the handle entirely.

## Current-slide indicator

The current slide gets a heavy ring in `accentColor`, and its number and title
are emphasised in the caption. The ring is reserved at full width on every
entry and only changes colour, so moving between slides never reflows the rail.

## Modes

### Pinned (default)

```
┌──────────────┬──────────────────────────────────┐
│  Slide 1     │                                  │
│ ┌──────────┐ │         ACTUAL SLIDE             │
│ │ preview  │ │                                  │
│ └──────────┘ │        scaled to fit             │
│  Slide 2     │       available space            │
│ ┌──────────┐ │                                  │
│ │ preview  │ │                                  │
│ └──────────┘ │                                  │
└──────────────┴──────────────────────────────────┘
```

The rail owns a permanent strip on the left and the deck starts where the rail
ends — nothing overlaps.

Reveal computes its scale from the `.reveal` wrapper's `offsetWidth`
(`getComputedSlideSize` → `dom.wrapper.offsetWidth`), *not* from the viewport
element. So pinned mode insets `.reveal` by the rail width and calls
`Reveal.layout()`; the deck is genuinely narrower and rescales itself. Insetting
`.reveal` rather than `<body>` also carries Quarto's own deck chrome (progress
bar, slide number, menu button) along with the slide.

### Overlay

```yaml
thumbnail-preview:
  mode: overlay
```

The drawer floats over the presentation and closes after navigating. Press the
shortcut key or click the left-edge button to open it.

With `allowModeToggle: true` (the default) the header button switches between
the two modes at runtime, and the shortcut key shows/hides the sidebar.

Hiding the sidebar unpins it so the deck reclaims the full width. Bringing it
back — the left-edge button, or the shortcut key — restores the mode the deck
was *configured* for, so a `mode: pinned` deck always reopens pinned. Overlay is
used only as a fallback when the window is too narrow to pin (see below).

## Implementation notes

- **Previews are built lazily.** A preview is a copy of a whole slide, so it
  carries its own `.reveal` and `<section>`, and every Reveal rule that keys on
  those matches inside it. Reveal rewrites classes on the deck root on every
  navigation, so each live preview is style the browser recalculates on every
  slide change — a 38-slide deck cost 1.2 s of blocked main thread per change
  with all of them built. An `IntersectionObserver` on the rail mounts a
  preview when it comes within 60% of the rail's height of the viewport and
  unmounts it when it leaves, which keeps about a dozen alive and the same deck
  at 0.25 s. Frames stay in place either way, so nothing moves and the scroll
  position is stable.
- **Canvas content is blitted, not cloned.** `cloneNode` copies a `<canvas>`
  element and not its bitmap, so a WebGL plot or any other canvas drawing is
  blank in a clone. Each cloned canvas is filled from its source at about
  twice the frame's display width, the result is only committed if it has
  content (a source caught mid-redraw reads as empty), and an attribute change
  on the root element re-takes the mounted snapshots so they follow a theme
  switch. A tainted canvas is left blank rather than taking the rail down.
- **A closed rail is `display: none`,** not translated off screen. Style
  invalidation is not skipped by `visibility`, `content-visibility` or
  `contain`; only `display: none` stops it. The class is applied after the
  slide-out transition so the animation still runs.
- Each thumbnail wraps its clone in its own inert `<div class="reveal">`.
  Quarto scopes all deck typography to `.reveal ...`, so without that wrapper
  the previews render unstyled; and because Reveal only ever queries inside its
  own wrapper element, these clones are not counted as slides. (Appending the
  drawer *inside* the live `.reveal` does add them to the deck — it doubles
  `Reveal.getTotalSlides()`.)
- Relayout after a mode change is synchronous, after a forced style flush.
  `requestAnimationFrame` is starved in background tabs, and a deferred
  `layout()` would leave the deck at the scale it had before the change.
- Thumbnail scale is measured from the rendered frame rather than assumed, so
  the narrow-screen clamp on the rail width stays consistent.
- The plugin disables itself for `?print-pdf`, and stands down for Reveal's
  scroll view and print view, which replace the layout model.
- Pinning is skipped when it would leave the deck narrower than Reveal's
  `scrollActivationWidth` (435px by default). Reveal auto-switches to scroll
  view below that threshold, and triggering it from inside plugin init leaves
  the deck stuck half-initialized — it never fires `ready`. Below roughly a
  700px window the sidebar falls back to the overlay drawer.
