# Changelog

This repository carries four independent extensions, each versioned on its
own in its `_extension.yml`. Entries below say which one they belong to.

| Extension | Version |
|---|---|
| `thumbnail-preview` | 0.6.0 |
| `theme-toggle` | 0.1.0 |
| `plot-slides` | 0.1.0 |
| `plot-explorer` | 0.1.0 |

## plot-explorer 0.1.0

- New extension. A dropdown, a slider and toggles for any Plotly figure, built
  in the browser from `trace.meta` (`set`, `step`, `group`) and
  `layout.meta.explorer`, so it needs no helper library and works for figures
  made in Python, R or plain JavaScript.
- The controls share one state - what is shown is the intersection of all of
  them - where Plotly's own dropdowns and sliders reset each other.
- Every dropdown entry draws when chosen; a group the selection lacks has its
  toggle disabled with the reason on hover; an entry missing a slider position
  snaps to the nearest one and says so, and the console warns about the gap.
  A box unticked by the reader is never re-ticked.
- Zoom for long signals: samples in `meta.zoom` (float32, float64, or int16 /
  uint16 with scale and offset), drawn as one min/max pair per pixel column for
  whatever is on screen and as every sample once few enough are visible. No
  peak is lost zoomed out, and the readout says which view is showing.
- Controls are scoped to the figure's own slide, so thumbnail clones never
  steal them; keys used on a control do not also turn the slide; the bar
  follows `theme-toggle`'s colours.
- `RevealPlotExplorer.refresh()` wires figures drawn after the deck loaded.
- `example/demo-explorer.qmd`, on synthetic data only.

## plot-slides 0.1.0

- New extension. Two slide shapes for decks built around figures:
  `.plot-slide`, where the figure is the slide, and `.calc-slide`, the dense
  equations-and-table slide that precedes it. Quarto's `.smaller` is matched
  too, so an existing deck keeps working.
- Plotly figures are resized to their slide on every slide change, and only
  the visible ones. Reveal lays out only the current slide, so a figure first
  drawn off screen keeps Plotly's 700px default - and a figure the wrong size
  for its slide cannot be zoomed into usefully.
- Plotly figures follow the theme. Their colours live in the figure layout,
  where no stylesheet reaches, so the plugin repaints backgrounds, text,
  gridlines, axes, hover labels, legend, modebar and boxed annotations. Driven
  by `RevealThemeToggle.onChange` when `theme-toggle` is present, and by the
  `data-theme` attribute otherwise.
- A figure whose colours carry meaning opts out with
  `layout.meta.themeRepaint = false`.
- Handles both ways a deck gets Plotly: `window.Plotly`, and the AMD module
  Quarto's own renderer defines, where `window.Plotly` is never set.

## theme-toggle 0.1.0

- New extension. Light and dark for a reveal deck, following
  `prefers-color-scheme` by default, with a corner button and `Shift+D`.
- A deliberate choice is remembered; double-clicking the button returns to
  following the system. PDF export is always light.
- Sets `data-theme` on `<html>` before first paint, so a deck's own
  `[data-theme="dark"]` rules match immediately rather than a frame late.
- `RevealThemeToggle.onChange(fn)` for colours CSS cannot reach. It fires once
  on registration, so a late subscriber still paints, and only on a real
  change - following the system while already in the system's mode is not
  one, and a needless repaint of a figure-heavy deck is most of a second of
  blocked main thread.
- Options: `default`, `shortcut`, `showButton`, `styleSlides`, `remember`,
  `storageKey`.

## thumbnail-preview 0.6.0

- Previews follow a dark deck. `.tp-frame` drew a hard-coded white card, so a
  clone of a dark slide was light text on white - no preview at all. The card
  now reads `--tp-frame-bg` / `--tp-frame-fg`, set under
  `[data-theme="dark"]` and defaulting to the old white, so the rail used on
  its own is unchanged.
- `_extension.yml` now carries the real version. It had stayed at 0.4.0
  through 0.4.1, 0.5.0 and 0.5.1, so `quarto add` reported the wrong version
  and `quarto update` compared against it.

## thumbnail-preview 0.5.1

- Canvas content appears in previews. `cloneNode` copies a `<canvas>` element
  but not its bitmap, so anything a deck draws on canvas - a WebGL plot, a
  chart library, a sketch - came out blank, which reads as a missing slide
  rather than as a limitation. Each cloned canvas is now filled by blitting
  its source, downscaled to about twice the frame's display width: the frame
  is a couple of hundred pixels wide and a full-size copy would cost megabytes
  of bitmap per preview for pixels nobody can see.
- The blit is committed only if the result has content. A source caught
  mid-redraw reads as empty, and adopting it would replace a good snapshot
  with nothing; the stale image is kept and the next pass replaces it.
- Snapshots follow a theme switch. An attribute change on the root element
  (`class` or `data-theme`) re-takes the snapshots that are mounted, twice, a
  second apart, since a deck repainting its own canvases in response to the
  same change may not have finished when the first pass runs.

## thumbnail-preview 0.5.0

- Previews are built when they come near the rail's viewport and thrown away
  when they leave it. A preview is a copy of a whole slide, so it carries its
  own `.reveal` and `<section>`, and every Reveal rule keying on those matches
  inside it; Reveal rewrites classes on the deck root on every navigation, and
  the browser then recalculates style for each live preview. On a 38-slide
  deck that was 1.2 s of blocked main thread per slide change with the rail
  pinned. Only about a dozen previews now exist at a time and the same deck
  costs 0.25 s. The lead is 60% of the rail's height either side of what is on
  screen — about five entries, more than a drag or a keypress can outrun.
- A closed rail is taken out of the layout (`display: none`) once its slide-out
  has finished, rather than left translated off screen. Style invalidation is
  not skipped by `visibility`, `content-visibility` or `contain`; only
  `display: none` stops it, so a hidden rail now costs nothing at all.

## thumbnail-preview 0.4.1

- Thumbnail captions no longer repeat a heading's maths. Every maths renderer
  leaves several representations of one formula in the DOM, and `textContent`
  concatenated all of them: MathJax 2, which Quarto's reveal format ships,
  emits the visual spans, a hidden MathML mirror and the original TeX in a
  `<script type="math/tex">`, so `## Block length and $\Delta f$` came out as
  "Block length and Δ𝑓Δf\Delta f". Titles are now read from a copy with the
  duplicates removed, handling MathJax 2, MathJax 3 (`<mjx-container>`, whose
  `aria-label` is used) and KaTeX.
- `example.qmd` has a slide whose heading contains maths, so the demo deck
  exercises this.

## thumbnail-preview 0.4.0

- Resizable rail: drag its right edge, double-click to reset, or use the arrow
  keys while the handle is focused. The chosen width persists per document in
  `localStorage`, and a window too narrow to honour it clamps the rail without
  discarding the preference.
- The current slide is marked with a heavy accent ring, plus an emphasised
  number and title in the caption.
- Thumbnail entries are `role="button"` elements rather than real `<button>`s,
  which may not contain the headings, lists and links a slide clone does. The
  cloned deck is `inert` so nothing inside it is focusable or clickable.
- New options: `allowResize`, `minDrawerWidth`, `accentColor`.

## thumbnail-preview 0.3.0

- Options are read from a top-level, kebab-cased `thumbnail-preview` document
  key, declared in `_extension.yml`. Quarto drops plugin options it was not
  told about, so the previous `format: revealjs: thumbnailPreview:` block never
  reached `Reveal.initialize()` and pinned mode silently never engaged.
- Pinned mode insets the `.reveal` wrapper -- which is what Reveal actually
  measures -- rather than shifting `<body>`. The deck rescales beside the rail,
  and Quarto's progress bar, slide number and menu button travel with it.
- The drawer moved out of `.reveal`. Its clones were being counted as real
  slides, which doubled `Reveal.getTotalSlides()`.
- Each thumbnail wraps its clone in a second, inert `.reveal` element so
  Quarto's themed typography still applies to the preview.
- Relayout is synchronous after a forced style flush, rather than relying on
  nested `requestAnimationFrame` callbacks, which are starved in background
  tabs and left the deck at its pre-change scale.
- Pinning stands down when it would push the deck under Reveal's
  `scrollActivationWidth`. Crossing that threshold from inside plugin init
  activated scroll view mid-initialization and the deck never fired `ready`.
- Disabled for `?print-pdf`, and stands down for Reveal's scroll and print
  views.

## thumbnail-preview 0.1.1

- Initial prototype: overlay drawer of DOM-cloned slide previews.

---

### Known limitations

- Previews are cloned once, when Reveal fires `ready`. Content that renders
  after that point (a slow async plot, for example) will not appear in the
  thumbnail until the page is reloaded. MathJax is fine, because Quarto delays
  `ready` until it has typeset.
- Pinned mode needs roughly a 780px window at the default rail width. Below
  that the sidebar falls back to the overlay drawer.
