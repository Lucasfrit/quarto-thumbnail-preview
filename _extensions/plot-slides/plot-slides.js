/*
 * RevealPlotSlides
 *
 * Two things a Quarto deck with Plotly figures needs and does not get:
 *
 *   1. Figures sized to the slide they are on. Reveal keeps every slide in
 *      the DOM but lays out only the current one, so a figure first drawn off
 *      screen measures a container with no usable width and keeps Plotly's
 *      700px default inside a full-width div. Nothing then tells it the
 *      container changed, so it stays narrow for the rest of the talk - and
 *      a figure that is not the size of its slide is one you cannot zoom into
 *      usefully, because the drag-to-zoom region is the wrong shape.
 *
 *   2. Figures that follow the deck's light/dark theme. Plotly keeps its
 *      colours in the figure's layout, not in CSS, so a stylesheet cannot
 *      reach them. Left alone, the browser's own "auto dark mode" inverts
 *      them instead, which is not a theme: it turns pale gridlines into
 *      near-white ones and flips a hover label's background without flipping
 *      its text.
 *
 * The theme half is driven by whatever sets `data-theme` on <html>. With the
 * theme-toggle extension present it subscribes to RevealThemeToggle.onChange;
 * without it, it watches the attribute directly, so a deck with its own
 * switch works too.
 *
 * A figure whose colours mean something - a map, a colour-keyed comparison -
 * opts out by setting `meta.themeRepaint = false` in its layout.
 */
(function () {
  "use strict";

  var opts = { resize: true, theme: true };

  var PALETTE = {
    light: {
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      fontColor: "#262626",
      grid: "#d9d9d9",
      line: "#262626",
      spike: "#666666",
      hoverBg: "rgba(255,255,255,0.95)",
      hoverBorder: "#8c8c8c",
      annBg: "rgba(255,255,255,0.92)",
      annBorder: "#bfbfbf"
    },
    dark: {
      paper_bgcolor: "#111418",
      plot_bgcolor: "#171b21",
      fontColor: "#e6e6e6",
      // A dark theme needs a *dimmer* grid than a light one, not a brighter
      // one: the eye reads contrast against the background, and inverting
      // #d9d9d9 gives a grid that shouts over the data.
      grid: "#333a44",
      line: "#5a6472",
      spike: "#8a94a6",
      hoverBg: "rgba(28,33,40,0.96)",
      hoverBorder: "#5a6472",
      annBg: "rgba(23,27,33,0.92)",
      annBorder: "#5a6472"
    }
  };

  // Plotly under Quarto is an AMD module, so `window.Plotly` is never set.
  // Worth fetching through require() once and keeping: with a reference we
  // can resize the one figure being shown, and without one the only lever is
  // a global resize event, which drives every responsive figure in the deck
  // at once - on a large deck that is most of a second of blocked main thread
  // per slide change.
  var plotly = null;
  var asking = false;

  function withPlotly(callback) {
    if (plotly) return callback(plotly);
    if (window.Plotly) { plotly = window.Plotly; return callback(plotly); }
    if (window.require && !asking) {
      asking = true;
      window.require(["plotly"], function (P) {
        plotly = P;
        asking = false;
        callback(P);
      });
    }
  }

  function figures(includeHidden) {
    return Array.prototype.filter.call(
      document.querySelectorAll(".plotly-graph-div"),
      function (div) {
        if (!div.layout) return false;
        // offsetParent is null inside a display:none subtree - a slide that
        // is not on screen - and touching one of those measures zero and
        // pins the wrong width.
        return includeHidden || div.offsetParent !== null;
      }
    );
  }

  /* ---- sizing ---------------------------------------------------------- */

  function resizeVisible() {
    var divs = figures(false);
    if (!divs.length) return;
    withPlotly(function (P) {
      divs.forEach(function (div) {
        try { P.Plots.resize(div); } catch (e) { /* still initialising */ }
      });
    });
    if (!plotly) {
      // No reference yet: fall back to the blunt instrument for this pass.
      // The next one will have it.
      window.dispatchEvent(new Event("resize"));
    }
  }

  /* ---- theme ----------------------------------------------------------- */

  function currentMode() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark" : "light";
  }

  function repaintFigure(P, div, palette) {
    var update = {
      paper_bgcolor: palette.paper_bgcolor,
      plot_bgcolor: palette.plot_bgcolor,
      "font.color": palette.fontColor,
      "hoverlabel.bgcolor": palette.hoverBg,
      "hoverlabel.bordercolor": palette.hoverBorder,
      "hoverlabel.font.color": palette.fontColor,
      "legend.bgcolor": palette.paper_bgcolor,
      "legend.bordercolor": palette.line,
      "legend.font.color": palette.fontColor,
      "modebar.bgcolor": "rgba(0,0,0,0)",
      "modebar.color": palette.spike,
      "modebar.activecolor": palette.fontColor
    };

    // Only axes that traces actually sit on. A subplot declared with
    // secondary_y always creates the overlay axis even when nothing ends up
    // on it, and relayout on an axis with no traces throws deep inside
    // Plotly - asynchronously, so a surrounding try/catch never sees it.
    var used = {};
    (div.data || []).forEach(function (trace) {
      used[(trace.xaxis || "x").replace("x", "xaxis")] = true;
      used[(trace.yaxis || "y").replace("y", "yaxis")] = true;
    });
    Object.keys(div.layout || {}).forEach(function (axis) {
      if (!/^[xy]axis\d*$/.test(axis) || !used[axis]) return;
      // An overlaid secondary axis carries no grid of its own; re-enabling
      // one here would draw a second grid on top of the first.
      if (div.layout[axis].showgrid !== false) {
        update[axis + ".gridcolor"] = palette.grid;
      }
      update[axis + ".linecolor"] = palette.line;
      update[axis + ".spikecolor"] = palette.spike;
      update[axis + ".tickcolor"] = palette.line;
      update[axis + ".title.font.color"] = palette.fontColor;
      update[axis + ".tickfont.color"] = palette.fontColor;
    });

    // Boxed annotations carry their own background, which a dark slide would
    // show as a white card. Every annotation's text follows the theme; only
    // the ones with a background of their own get that repainted, because a
    // subplot title is an annotation too.
    ((div.layout && div.layout.annotations) || []).forEach(function (ann, i) {
      update["annotations[" + i + "].font.color"] = palette.fontColor;
      if (!ann.bgcolor) return;
      update["annotations[" + i + "].bgcolor"] = palette.annBg;
      update["annotations[" + i + "].bordercolor"] = palette.annBorder;
    });

    // relayout rejects asynchronously, so a plain try/catch around the call
    // would not catch a failure; attach a handler instead.
    Promise.resolve(P.relayout(div, update)).catch(function () {});
  }

  function repaint(includeHidden) {
    if (!opts.theme) return;
    var mode = currentMode();
    var palette = PALETTE[mode];
    var divs = figures(includeHidden);
    if (!divs.length) return;
    withPlotly(function (P) {
      divs.forEach(function (div) {
        // A figure whose colours are a key, not furniture, says so.
        if (div.layout && div.layout.meta &&
            div.layout.meta.themeRepaint === false) return;
        if (div._psMode === mode) return;
        div._psMode = mode;
        try { repaintFigure(P, div, palette); } catch (e) { /* initialising */ }
      });
    });
  }

  function forgetPainted() {
    figures(true).forEach(function (div) { div._psMode = null; });
  }

  function watchTheme() {
    if (!opts.theme) return;
    // The toggle extension is the usual driver, and its onChange fires once
    // immediately - so this also does the first paint.
    if (window.RevealThemeToggle && window.RevealThemeToggle.onChange) {
      window.RevealThemeToggle.onChange(function () {
        forgetPainted();
        repaint(true);
      });
      return;
    }
    // No toggle extension: follow the attribute directly, so a deck with its
    // own switch still gets its figures repainted.
    if (window.MutationObserver) {
      new MutationObserver(function () {
        forgetPainted();
        repaint(true);
      }).observe(document.documentElement,
                 { attributes: true, attributeFilter: ["data-theme"] });
    }
    repaint(true);
  }

  /* ---- wiring ---------------------------------------------------------- */

  function run() {
    window.requestAnimationFrame(function () {
      if (opts.resize) resizeVisible();
      repaint(false);
      // Reveal's own transform settles a frame later; a second pass costs
      // nothing and catches the case where the first was still too early.
      window.setTimeout(function () {
        if (opts.resize) resizeVisible();
        repaint(false);
      }, 120);
    });
  }

  window.RevealPlotSlides = function () {
    return {
      id: "RevealPlotSlides",

      init: function (deck) {
        var cfg = (deck.getConfig() || {}).plotSlides || {};
        Object.keys(opts).forEach(function (key) {
          if (cfg[key] !== undefined) opts[key] = cfg[key];
        });

        ["ready", "slidechanged", "overviewshown", "overviewhidden", "resize"]
          .forEach(function (event) { deck.on(event, run); });

        watchTheme();
        run();
      }
    };
  };
})();
