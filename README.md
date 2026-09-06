# quarto-thumbnail-preview

A Reveal.js plugin for [Quarto](https://quarto.org) that puts a sidebar of real
DOM-cloned slide previews beside your deck. In **pinned** mode the sidebar takes
real screen width and the deck rescales into what is left, so the slide starts
where the rail ends instead of sitting underneath it.

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

Then in your document:

```yaml
---
format: revealjs
revealjs-plugins:
  - thumbnail-preview
---
```

That is enough — it starts pinned with sensible defaults.

To try the bundled example:

```bash
cd example && quarto preview demo.qmd
```

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
