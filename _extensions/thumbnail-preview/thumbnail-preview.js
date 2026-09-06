/*
 * RevealThumbnailPreview
 *
 * A sidebar of real DOM-cloned slide previews for Quarto + Reveal.js.
 *
 * Options come from the `thumbnail-preview` key in the document YAML, merged
 * over the defaults declared in _extension.yml. Quarto only forwards plugin
 * options it was told about there, so a key that is not declared in
 * _extension.yml never reaches deck.getConfig().
 */
window.RevealThumbnailPreview = function () {
  return {
    id: "RevealThumbnailPreview",

    init: function (deck) {
      // PDF export lays every slide out on its own page; a fixed sidebar and a
      // narrowed deck would corrupt that, so stay out of it entirely.
      if (/print-pdf/gi.test(window.location.search)) return;

      const cfg = deck.getConfig();
      const opts = cfg.thumbnailPreview || {};

      const shortcut = String(opts.shortcut || "p").toLowerCase();
      const configDrawerWidth = Number(opts.drawerWidth) || 280;

      // The rail's own chrome: .tp-list padding (12 + 14) plus .tp-entry
      // padding (8 + 8). Keep in sync with the 42px in --tp-preview-width in
      // the stylesheet, so a derived thumbnail fills the rail exactly.
      const RAIL_CHROME = 42;
      const configPreviewWidth =
        Number(opts.previewWidth) || Math.max(120, configDrawerWidth - RAIL_CHROME);
      const initialMode = String(opts.mode || "pinned").toLowerCase() === "overlay" ? "overlay" : "pinned";
      const allowModeToggle = opts.allowModeToggle !== false;
      const allowResize = opts.allowResize !== false;
      const minDrawerWidth = Number(opts.minDrawerWidth) || 140;
      const accentColor = opts.accentColor ? String(opts.accentColor) : null;

      // Dragging resizes the rail; the thumbnail keeps the gutter the YAML
      // asked for, so the previews grow and shrink with it.
      const gutter = Math.max(RAIL_CHROME, configDrawerWidth - configPreviewWidth);

      // What the user asked for, vs what currently fits. Keeping them apart
      // means shrinking the window clamps the rail without forgetting the
      // chosen width -- widen the window again and it comes back.
      let preferredDrawerWidth = configDrawerWidth;
      let drawerWidth = configDrawerWidth;
      let previewWidth = configPreviewWidth;

      const slideWidth = Number(cfg.width) || 1050;
      const slideHeight = Number(cfg.height) || 700;

      // Reveal auto-switches to scroll view once the deck gets narrower than
      // scrollActivationWidth, which pinning can easily cause on a small
      // window. Its own defaults, so the fit test below matches its trigger.
      const slideMargin = typeof cfg.margin === "number" ? cfg.margin : 0.04;
      const scrollActivationWidth =
        typeof cfg.scrollActivationWidth === "number" ? cfg.scrollActivationWidth : 435;

      const root = document.documentElement;
      root.style.setProperty("--tp-slide-aspect", String(slideWidth / slideHeight));
      if (accentColor) root.style.setProperty("--tp-accent", accentColor);

      const writeWidths = () => {
        root.style.setProperty("--tp-drawer-width-config", `${drawerWidth}px`);
        root.style.setProperty("--tp-preview-width-config", `${previewWidth}px`);
      };
      writeWidths();

      const storageKey = `tp-drawer-width:${window.location.pathname}`;

      const drawer = document.createElement("aside");
      drawer.className = "tp-drawer";
      drawer.setAttribute("aria-label", "Slide previews");
      drawer.innerHTML = `
        <div class="tp-header">
          <strong>Slides</strong>
          <div class="tp-header-actions">
            <button class="tp-pin" type="button" aria-label="Pin slide previews" title="Pin/unpin sidebar">&#8676;</button>
            <button class="tp-close" type="button" aria-label="Close slide previews">&times;</button>
          </div>
        </div>
        <div class="tp-list"></div>
      `;

      const toggle = document.createElement("button");
      toggle.className = "tp-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-label", "Open slide previews");
      toggle.setAttribute("title", `Slide previews (${shortcut.toUpperCase()})`);
      toggle.textContent = "☰";

      const revealRoot = document.querySelector(".reveal");

      // Deliberately siblings of .reveal, not children: pinned mode insets
      // .reveal, and the rail must stay in the strip that vacates.
      document.body.appendChild(drawer);
      document.body.appendChild(toggle);

      const list = drawer.querySelector(".tp-list");
      const closeButton = drawer.querySelector(".tp-close");
      const pinButton = drawer.querySelector(".tp-pin");

      const handle = document.createElement("div");
      handle.className = "tp-resize";
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", "Resize slide previews");
      handle.setAttribute("title", "Drag to resize previews (double-click to reset)");
      handle.tabIndex = 0;
      handle.setAttribute("aria-valuemin", String(minDrawerWidth));
      handle.setAttribute("aria-valuenow", String(configDrawerWidth));
      if (allowResize) drawer.appendChild(handle);

      let entries = [];
      let mode = initialMode;
      let overlayOpen = false;
      let deckReady = false;

      if (!allowModeToggle) pinButton.hidden = true;

      const stripIds = (node) => {
        if (node.nodeType !== 1) return;
        node.removeAttribute("id");
        node.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
      };

      const currentLinearIndex = () => deck.getSlides().indexOf(deck.getCurrentSlide());

      const scrollActiveIntoView = () => {
        const active = list.querySelector(".tp-entry.is-active");
        if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };

      const updateActive = () => {
        const activeIndex = currentLinearIndex();
        entries.forEach((entry, i) => {
          entry.classList.toggle("is-active", i === activeIndex);
          entry.setAttribute("aria-current", i === activeIndex ? "true" : "false");
        });
        if (drawer.classList.contains("is-open")) scrollActiveIntoView();
      };

      // The frame width is CSS-driven (it clamps on narrow screens), so the
      // clone scale is measured rather than assumed.
      const rescalePreviews = () => {
        const frame = list.querySelector(".tp-frame");
        if (!frame) return;
        const width = frame.clientWidth;
        if (width > 0) drawer.style.setProperty("--tp-scale", String(width / slideWidth));
      };

      // Reading offsetWidth flushes the pending style change from the class
      // toggles above, so Reveal measures the new .reveal box rather than the
      // one it had before the mode changed.
      //
      // Never before "ready": Reveal's own layout() can activate scroll view,
      // and re-entering that from inside plugin init leaves the deck stuck
      // half-initialized. The startup layout Reveal runs anyway already sees
      // the pinned classes, which are applied synchronously.
      const relayout = () => {
        if (!deckReady) return;
        if (revealRoot) void revealRoot.offsetWidth;
        deck.layout();
        rescalePreviews();
      };

      // Measured, not assumed: CSS clamps the rail on narrow screens.
      const railWidth = () => drawer.getBoundingClientRect().width || drawerWidth;

      // Pinning must leave the deck wider than Reveal's scroll-view trigger,
      // or the deck flips into scroll view the moment it is narrowed.
      const pinFits = () =>
        (window.innerWidth - railWidth()) * (1 - slideMargin) > scrollActivationWidth;

      // The rail may not grow so wide that the deck beside it would drop below
      // Reveal's scroll-view trigger -- the same limit pinFits() enforces.
      const maxDrawerWidth = () => {
        const byWindow = window.innerWidth * 0.6;
        if (mode !== "pinned") return byWindow;
        const byDeck = window.innerWidth - scrollActivationWidth / (1 - slideMargin) - 8;
        return Math.min(byWindow, byDeck);
      };

      const applyDrawerWidth = () => {
        const max = maxDrawerWidth();
        const width = Math.round(Math.max(minDrawerWidth, Math.min(preferredDrawerWidth, max)));
        handle.setAttribute("aria-valuemax", String(Math.round(max)));
        if (width === drawerWidth) return;
        drawerWidth = width;
        previewWidth = Math.max(80, width - gutter);
        writeWidths();
        handle.setAttribute("aria-valuenow", String(width));
        relayout();
      };

      const setDrawerWidth = (px) => {
        preferredDrawerWidth = px;
        applyDrawerWidth();
      };

      const storeDrawerWidth = () => {
        try {
          window.localStorage.setItem(storageKey, String(preferredDrawerWidth));
        } catch (err) {
          /* private mode / storage disabled -- resizing still works, it just
             will not survive a reload. */
        }
      };

      const restoreDrawerWidth = () => {
        let stored;
        try {
          stored = parseFloat(window.localStorage.getItem(storageKey));
        } catch (err) {
          return;
        }
        if (Number.isFinite(stored)) setDrawerWidth(stored);
      };

      const applyLayout = () => {
        const pinned = mode === "pinned" && pinFits();
        const open = pinned || overlayOpen;

        document.body.classList.toggle("tp-pinned-page", pinned);
        if (revealRoot) revealRoot.classList.toggle("tp-pinned-deck", pinned);
        drawer.classList.toggle("is-pinned", pinned);
        drawer.classList.toggle("is-open", open);
        drawer.setAttribute("aria-hidden", open ? "false" : "true");
        toggle.classList.toggle("is-hidden", open);
        closeButton.hidden = pinned;

        pinButton.textContent = pinned ? "⇥" : "⇤";
        pinButton.setAttribute("aria-label", pinned ? "Unpin slide previews" : "Pin slide previews");
        pinButton.setAttribute("title", pinned ? "Switch to overlay mode" : "Pin sidebar and resize slides");

        relayout();
        // A follow-up pass catches anything that settles a frame later (web
        // fonts, the drawer transition). Never the only pass: requestAnimation-
        // Frame is starved in background tabs, and the deck would then keep the
        // scale it had before the mode changed.
        window.requestAnimationFrame(relayout);
        if (open) scrollActiveIntoView();
      };

      const setOverlayOpen = (open) => {
        if (mode === "pinned") return;
        overlayOpen = open;
        applyLayout();
      };

      const sidebarVisible = () => (mode === "pinned" && pinFits()) || overlayOpen;

      // Bringing the sidebar back restores the mode the deck was configured
      // for, so a pinned deck reopens pinned rather than dropping into an
      // overlay the user never asked for. Overlay is only the fallback when
      // there is not enough width left to pin.
      const showSidebar = () => {
        if (initialMode === "pinned" && pinFits()) {
          mode = "pinned";
          overlayOpen = false;
        } else {
          mode = "overlay";
          overlayOpen = true;
        }
        applyLayout();
      };

      // Hiding a pinned rail has to unpin it too, or the deck would keep the
      // narrowed width with nothing beside it.
      const hideSidebar = () => {
        if (mode === "pinned") mode = "overlay";
        overlayOpen = false;
        applyLayout();
      };

      const toggleSidebar = () => {
        if (mode === "pinned" && !allowModeToggle) return;
        if (sidebarVisible()) hideSidebar();
        else showSidebar();
      };

      const setMode = (nextMode) => {
        mode = nextMode === "pinned" ? "pinned" : "overlay";
        // Leaving pinned mode should not dump the user straight into a
        // drawer that covers the slide they were just reading.
        if (mode === "overlay") overlayOpen = false;
        applyLayout();
      };

      // textContent on a typeset heading is not the heading's text. Every
      // maths renderer leaves several representations of one formula in the
      // DOM and textContent concatenates all of them:
      //
      //   MathJax 2 (what Quarto's reveal format ships) renders the visual
      //   spans, a hidden MathML mirror for screen readers, and the original
      //   TeX in a <script type="math/tex">. A heading reading "what df it
      //   buys" comes out as "what dfdf\Delta f it buys".
      //   MathJax 3 uses <mjx-container>, which carries the spoken text in
      //   aria-label. KaTeX keeps its MathML mirror in .katex-mathml.
      //
      // So take the text from a copy with the duplicates removed.
      const headingText = (heading) => {
        const copy = heading.cloneNode(true);
        copy.querySelectorAll("mjx-container").forEach((node) => {
          node.replaceWith(document.createTextNode(node.getAttribute("aria-label") || ""));
        });
        copy.querySelectorAll(
          "script[type^='math/tex'], .MathJax_Preview, .MJX_Assistive_MathML, .katex-mathml"
        ).forEach((node) => node.remove());
        return copy.textContent.replace(/\s+/g, " ").trim();
      };

      const buildPreviews = () => {
        const scrollTop = list.scrollTop;
        list.replaceChildren();
        entries = [];

        deck.getSlides().forEach((slide, linearIndex) => {
          const indices = deck.getIndices(slide);
          const heading = slide.querySelector("h1, h2, h3, [data-slide-title]");
          const title = (heading && headingText(heading)) || `Slide ${linearIndex + 1}`;

          // A real <button> may not contain headings, lists or links, and a
          // slide clone contains all three. role=button keeps the semantics
          // without the invalid content model.
          const entry = document.createElement("div");
          entry.className = "tp-entry";
          entry.setAttribute("role", "button");
          entry.tabIndex = 0;
          entry.setAttribute("aria-label", `Go to ${title}`);

          const frame = document.createElement("div");
          frame.className = "tp-frame";

          const clone = slide.cloneNode(true);
          stripIds(clone);
          // Keep the slide's own classes (Quarto styles hang off things like
          // .quarto-title-block); drop only Reveal's navigation state.
          clone.classList.remove("present", "past", "future", "stack");
          clone.classList.add("tp-slide-clone");
          clone.removeAttribute("data-state");
          if (cfg.center || slide.classList.contains("center")) {
            clone.classList.add("tp-center");
          }
          clone.style.width = `${slideWidth}px`;
          clone.style.height = `${slideHeight}px`;

          // A preview should show the finished slide, not replay its build.
          clone.querySelectorAll(".fragment").forEach((fragment) => {
            fragment.classList.add("visible");
            fragment.style.visibility = "visible";
            fragment.style.opacity = "1";
          });

          // The clone needs a `.reveal` ancestor or it loses every themed
          // rule (Quarto scopes all deck typography to `.reveal ...`). Reveal
          // itself only ever queries inside its own wrapper, so this second,
          // inert `.reveal` is styling context without joining the deck.
          const previewSlides = document.createElement("div");
          previewSlides.className = "slides tp-preview-slides";
          previewSlides.appendChild(clone);

          const previewDeck = document.createElement("div");
          previewDeck.className = "reveal tp-preview-reveal";
          previewDeck.setAttribute("aria-hidden", "true");
          // The clone is decoration: it must not be focusable or clickable.
          // inert covers browsers that support it; stripping href covers the
          // rest, since a live link inside the entry would hijack the click.
          previewDeck.inert = true;
          previewDeck.setAttribute("inert", "");
          clone.querySelectorAll("a[href]").forEach((link) => link.removeAttribute("href"));
          previewDeck.appendChild(previewSlides);
          frame.appendChild(previewDeck);

          const caption = document.createElement("div");
          caption.className = "tp-caption";
          caption.innerHTML = '<span class="tp-number"></span><span class="tp-title"></span>';
          caption.querySelector(".tp-number").textContent = String(linearIndex + 1);
          caption.querySelector(".tp-title").textContent = title;

          entry.appendChild(frame);
          entry.appendChild(caption);

          const go = () => {
            deck.slide(indices.h, indices.v || 0);
            // Pinned mode stays visible; overlay mode behaves like a drawer.
            if (mode === "overlay") setOverlayOpen(false);
          };
          entry.addEventListener("click", go);
          // Space and Enter are Reveal navigation keys, so they must not
          // reach the deck once the entry has handled them.
          entry.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            go();
          });

          list.appendChild(entry);
          entries.push(entry);
        });

        list.scrollTop = scrollTop;
        rescalePreviews();
        updateActive();
      };

      toggle.addEventListener("click", showSidebar);
      closeButton.addEventListener("click", hideSidebar);
      pinButton.addEventListener("click", () => setMode(mode === "pinned" ? "overlay" : "pinned"));

      if (allowResize) {
        let dragPointer = null;

        // The rail is flush to the left edge, so the pointer's x is the width.
        handle.addEventListener("pointerdown", (event) => {
          dragPointer = event.pointerId;
          handle.setPointerCapture(dragPointer);
          document.body.classList.add("tp-resizing");
          event.preventDefault();
        });

        handle.addEventListener("pointermove", (event) => {
          if (dragPointer === null) return;
          setDrawerWidth(event.clientX);
        });

        const endDrag = (event) => {
          if (dragPointer === null) return;
          if (handle.hasPointerCapture(dragPointer)) handle.releasePointerCapture(dragPointer);
          dragPointer = null;
          document.body.classList.remove("tp-resizing");
          storeDrawerWidth();
          event.preventDefault();
        };
        handle.addEventListener("pointerup", endDrag);
        handle.addEventListener("pointercancel", endDrag);

        handle.addEventListener("dblclick", (event) => {
          setDrawerWidth(configDrawerWidth);
          storeDrawerWidth();
          event.preventDefault();
        });

        // Arrow keys are Reveal's navigation keys, so these must not reach the
        // document listener Reveal installs.
        handle.addEventListener("keydown", (event) => {
          const step = event.shiftKey ? 48 : 16;
          if (event.key === "ArrowLeft") setDrawerWidth(drawerWidth - step);
          else if (event.key === "ArrowRight") setDrawerWidth(drawerWidth + step);
          else if (event.key === "Home") setDrawerWidth(configDrawerWidth);
          else return;
          event.preventDefault();
          event.stopPropagation();
          storeDrawerWidth();
        });
      }

      document.addEventListener("keydown", (event) => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        if (event.key.toLowerCase() === shortcut) {
          event.preventDefault();
          event.stopPropagation();
          toggleSidebar();
        } else if (event.key === "Escape" && mode === "overlay" && overlayOpen) {
          event.preventDefault();
          event.stopPropagation();
          setOverlayOpen(false);
        }
      }, true);

      deck.on("slidechanged", updateActive);

      // Re-run applyLayout rather than deck.layout: whether the rail still
      // fits is itself a function of the window width.
      window.addEventListener("resize", () => {
        if (allowResize) applyDrawerWidth();
        applyLayout();
      });

      // Fonts and MathJax can land after the first layout and change how tall
      // a slide is; re-measure so thumbnails and scale stay honest.
      if (document.fonts?.ready) document.fonts.ready.then(relayout);

      // MathJax, Mermaid and plotting libraries typeset *after* Reveal fires
      // "ready", so the first clones can hold raw TeX or an empty container.
      // Watch the deck for content changes and rebuild.
      //
      // childList/characterData only: Reveal rewrites section class and style
      // attributes on every navigation, and observing attributes would rebuild
      // the whole rail on each slide change for nothing. The drawer lives
      // outside .slides, so a rebuild cannot retrigger this.
      const watchForLateContent = () => {
        const slidesEl = revealRoot && revealRoot.querySelector(".slides");
        if (!slidesEl || !window.MutationObserver) return;

        let timer = null;
        const observer = new MutationObserver(() => {
          if (!deckReady) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(buildPreviews, 250);
        });
        observer.observe(slidesEl, {
          childList: true,
          subtree: true,
          characterData: true
        });
      };

      const onReady = () => {
        deckReady = true;
        buildPreviews();
        relayout();
        watchForLateContent();
      };

      if (allowResize) restoreDrawerWidth();
      applyLayout();
      if (deck.isReady && deck.isReady()) onReady();
      else deck.on("ready", onReady);
    }
  };
};
