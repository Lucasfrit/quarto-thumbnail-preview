# Changelog

## 0.4.1

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

## 0.4.0

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

## 0.3.0

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

## 0.1.1

- Initial prototype: overlay drawer of DOM-cloned slide previews.

---

### Known limitations

- Previews are cloned once, when Reveal fires `ready`. Content that renders
  after that point (a slow async plot, for example) will not appear in the
  thumbnail until the page is reloaded. MathJax is fine, because Quarto delays
  `ready` until it has typeset.
- Pinned mode needs roughly a 780px window at the default rail width. Below
  that the sidebar falls back to the overlay drawer.
