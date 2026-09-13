/*
 * RevealPlotExplorer
 *
 * A dropdown, a slider, toggles and zoom for any Plotly figure in a reveal
 * deck - built from tags on the traces, so it works however the figure was
 * made (Python, R, plain JavaScript) and needs no helper library.
 *
 * AUTHORING
 *   Tag each trace with what it belongs to:
 *
 *       trace.meta = { set: "SIM_rigA_R1", step: 0.02, group: "model" }
 *
 *   and say which controls the figure wants in its layout:
 *
 *       layout.meta = { explorer: {
 *         dropdown: "recording",          // label; values from trace.meta.set
 *         slider:   "damping ratio ζ",    // label; values from trace.meta.step
 *         toggles:  true,                 // one box per trace.meta.group
 *         default:  { set: "...", step: 0.02, groups: ["measured"] }
 *       } }
 *
 *   A trace with no `set` is shown for every set, no `step` for every step,
 *   and no `group` always. A long signal becomes zoomable with
 *
 *       trace.meta = { zoom: { x0: 0, dx: 0.0005, y: <base64 float32 LE> } }
 *
 *   or, at half the size, { dtype: "int16", scale: 0.01, offset: 0, y: ... }
 *   where each stored integer times scale, plus offset, is the value.
 *
 *   and empty x/y: the samples stay in the browser, and the plugin draws one
 *   min/max pair per pixel column for whatever is on screen, rebuilt on every
 *   zoom, and every sample once few enough are visible.
 *
 * WHY HTML CONTROLS AND NOT PLOTLY'S OWN
 *   A Plotly dropdown or slider carries a fixed argument list, so each step
 *   has to spell out every other control's choice; with two present, whichever
 *   was used last wins and the other silently resets. Owning the state here
 *   makes them compose: what is visible is always the intersection of all of
 *   them. And an HTML checkbox can be *disabled*, which a legend entry cannot -
 *   a control offering a curve that does not exist is worse than a greyed one.
 *
 * THE RULES IT ENFORCES
 *   - Every dropdown entry draws the moment it is chosen: if none of the
 *     ticked groups exists in that entry, its groups are ticked instead.
 *     Unticking a box yourself is never undone.
 *   - A toggle whose group is absent from the current selection is disabled,
 *     and says why on hover.
 *   - An entry missing the slider's current position snaps to the nearest one
 *     it has, and the readout says so - it never shows an empty figure.
 *   - Lookups stay inside the figure's own slide: the thumbnail rail clones
 *     every slide, so a document-wide lookup could land on a clone.
 */
(function () {
  "use strict";

  var opts = { rawThreshold: 0 };
  var wired = typeof WeakSet === "function" ? new WeakSet() : null;

  // ---- Plotly, however the deck loaded it ------------------------------
  var plotly = null;
  function withPlotly(callback) {
    if (plotly) return callback(plotly);
    if (window.Plotly) { plotly = window.Plotly; return callback(plotly); }
    if (window.require) {
      window.require(["plotly"], function (P) { plotly = P; callback(P); });
    }
  }

  function warn(message, detail) {
    if (window.console) window.console.warn("plot-explorer: " + message, detail || "");
  }

  // Plotly.update rejects asynchronously, so a try/catch alone lets a rejected
  // layout surface as an uncaught error. Both paths are handled.
  function safely(promise) {
    try {
      Promise.resolve(promise).catch(function (e) { warn("update rejected", e); });
    } catch (e) {
      warn("update failed", e);
    }
  }

  // ---- data helpers ----------------------------------------------------
  // Samples arrive as a plain array, or base64 of little-endian binary:
  // float32 by default, or int16/uint16 with scale and offset - half the size
  // of float32, which is what makes a long recording affordable in a deck.
  // Decoded once, into physical units.
  var DTYPES = { float32: Float32Array, float64: Float64Array,
                 int16: Int16Array, uint16: Uint16Array };

  function decodeSamples(zoom) {
    var value = zoom.y;
    if (value == null) return null;
    if (Array.isArray(value)) return Float64Array.from(value);
    if (typeof value !== "string") return null;
    var Type = DTYPES[zoom.dtype || "float32"];
    if (!Type) { warn("unknown meta.zoom.dtype", zoom.dtype); return null; }
    var binary = window.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var raw = new Type(bytes.buffer);
    var scale = zoom.scale === undefined ? 1 : Number(zoom.scale);
    var offset = zoom.offset === undefined ? 0 : Number(zoom.offset);
    if (scale === 1 && offset === 0 && Type === Float32Array) return raw;
    var out = new Float32Array(raw.length);
    for (var k = 0; k < raw.length; k++) out[k] = raw[k] * scale + offset;
    return out;
  }

  function metaOf(trace) {
    return (trace && trace.meta && typeof trace.meta === "object") ? trace.meta : {};
  }

  function distinct(values) {
    var seen = [];
    values.forEach(function (v) {
      if (v !== undefined && v !== null && seen.indexOf(v) < 0) seen.push(v);
    });
    return seen;
  }

  function sortSteps(steps) {
    var numeric = steps.every(function (s) { return typeof s === "number"; });
    return numeric ? steps.slice().sort(function (a, b) { return a - b; }) : steps;
  }

  function format(template, value) {
    if (!template || template.indexOf("{value}") < 0) return String(value);
    return template.replace("{value}", String(value));
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ---- one figure ------------------------------------------------------
  function wire(P, div) {
    if (wired) {
      if (wired.has(div)) return;
      wired.add(div);
    } else if (div.__plotExplorer) {
      return;
    }
    div.__plotExplorer = true;

    var layoutMeta = (div.layout && div.layout.meta && typeof div.layout.meta === "object")
      ? div.layout.meta : {};
    var cfg = layoutMeta.explorer || null;
    var traces = div.data || [];
    var zoomIdx = [];
    traces.forEach(function (t, i) { if (metaOf(t).zoom) zoomIdx.push(i); });
    if (!cfg && !zoomIdx.length) return;
    cfg = cfg || {};

    var sets = cfg.dropdown ? distinct(traces.map(function (t) { return metaOf(t).set; })) : [];
    var steps = cfg.slider ? sortSteps(distinct(traces.map(function (t) { return metaOf(t).step; }))) : [];
    var groups = cfg.toggles ? distinct(traces.map(function (t) { return metaOf(t).group; })) : [];
    var def = cfg["default"] || {};

    var state = {
      set: sets.length ? (sets.indexOf(def.set) >= 0 ? def.set : sets[0]) : undefined,
      step: steps.length ? (steps.indexOf(def.step) >= 0 ? def.step : steps[0]) : undefined,
      groups: {}
    };
    groups.forEach(function (g) {
      state.groups[g] = Array.isArray(def.groups) ? def.groups.indexOf(g) >= 0 : true;
    });

    // Tell the author, once, about entries that lack a slider position - the
    // figure will still draw (it snaps), but that is a gap in the data.
    if (sets.length && steps.length) {
      sets.forEach(function (s) {
        var has = distinct(traces.filter(function (t) { return metaOf(t).set === s; })
          .map(function (t) { return metaOf(t).step; }));
        var missing = steps.filter(function (st) { return has.indexOf(st) < 0; });
        if (missing.length) warn("entry \"" + s + "\" has no traces at slider position(s)", missing);
      });
    }

    // ---- the control bar, in the figure's own slide ----
    var bar = el("div", "pe-bar");
    bar.setAttribute("data-pe-bar", "");
    var select = null;
    var slider = null;
    var sliderValue = null;
    var boxes = {};

    if (sets.length) {
      var dl = el("label", "pe-control pe-dropdown");
      dl.appendChild(el("span", "pe-label", cfg.dropdown === true ? "entry" : cfg.dropdown));
      select = el("select");
      sets.forEach(function (s, i) {
        var option = el("option", null, String(s));
        option.value = String(i);
        select.appendChild(option);
      });
      select.value = String(sets.indexOf(state.set));
      dl.appendChild(select);
      bar.appendChild(dl);
    }

    if (steps.length) {
      var sl = el("label", "pe-control pe-slider");
      sl.appendChild(el("span", "pe-label", cfg.slider === true ? "step" : cfg.slider));
      slider = el("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = String(steps.length - 1);
      slider.step = "1";
      slider.value = String(steps.indexOf(state.step));
      sliderValue = el("span", "pe-value");
      sl.appendChild(slider);
      sl.appendChild(sliderValue);
      bar.appendChild(sl);
    }

    if (groups.length) {
      var tg = el("span", "pe-control pe-toggles");
      if (typeof cfg.toggles === "string") tg.appendChild(el("span", "pe-label", cfg.toggles));
      groups.forEach(function (g) {
        var label = el("label", "pe-toggle");
        var box = el("input");
        box.type = "checkbox";
        box.checked = Boolean(state.groups[g]);
        var swatch = el("span", "pe-swatch");
        label.appendChild(box);
        label.appendChild(swatch);
        label.appendChild(el("span", "pe-name", String(g)));
        tg.appendChild(label);
        boxes[g] = { box: box, label: label, swatch: swatch };
      });
      bar.appendChild(tg);
    }

    var readout = el("span", "pe-readout");
    bar.appendChild(readout);

    // Keys used on a focused control must not also turn the slide: Reveal
    // listens on the document, so stop them at the bar.
    bar.addEventListener("keydown", function (event) {
      if (/^(Arrow|Page|Home$|End$| $)/.test(event.key)) event.stopPropagation();
    });

    div.parentNode.insertBefore(bar, div);

    // ---- visibility ----
    function matches(t, useGroups) {
      var m = metaOf(t);
      if (sets.length && m.set !== undefined && m.set !== state.set) return false;
      if (steps.length && m.step !== undefined && m.step !== state.step) return false;
      if (useGroups && groups.length && m.group !== undefined && !state.groups[m.group]) return false;
      return true;
    }

    function availableGroups() {
      return distinct(traces.filter(function (t) { return matches(t, false); })
        .map(function (t) { return metaOf(t).group; }));
    }

    function stepsForSet() {
      if (!sets.length) return steps;
      return steps.filter(function (st) {
        return traces.some(function (t) {
          var m = metaOf(t);
          return (m.set === undefined || m.set === state.set) && m.step === st;
        });
      });
    }

    var note = "";

    // `reason` is what changed. Picking a new entry or slider position is a
    // new selection, and a selection must draw something; unticking a box is
    // a deliberate choice to hide a curve, and must not be undone.
    function apply(reason) {
      note = "";
      // An entry without the slider's position snaps to the nearest it has.
      if (steps.length) {
        var have = stepsForSet();
        if (have.length && have.indexOf(state.step) < 0) {
          var want = steps.indexOf(state.step);
          var best = have[0];
          have.forEach(function (st) {
            if (Math.abs(steps.indexOf(st) - want) < Math.abs(steps.indexOf(best) - want)) best = st;
          });
          note = "no data at " + format(cfg.sliderFormat, state.step) + " here; showing " +
            format(cfg.sliderFormat, best);
          state.step = best;
          slider.value = String(steps.indexOf(best));
        }
      }

      // Rule: a selection draws something. If none of the ticked groups
      // exists in it, tick the ones that do.
      var avail = availableGroups();
      if (reason !== "toggle" && groups.length && avail.length &&
          !avail.some(function (g) { return state.groups[g]; })) {
        avail.forEach(function (g) { state.groups[g] = true; });
      }

      var visible = traces.map(function (t) { return matches(t, true); });
      var update = { };
      // Plotly latches a concrete range once it has drawn; re-assert
      // autorange on every y axis in use so switching entries rescales.
      // Zoomed x axes are left alone - the reader chose that window.
      var fl = div._fullLayout || {};
      Object.keys(fl).forEach(function (k) {
        if (/^yaxis\d*$/.test(k)) update[k + ".autorange"] = true;
      });
      withPlotly(function (Pl) {
        safely(Pl.update(div, { visible: visible }, update));
        redrawZoom(true);
      });

      if (sliderValue) sliderValue.textContent = format(cfg.sliderFormat, state.step);
      groups.forEach(function (g) {
        var usable = avail.indexOf(g) >= 0;
        var b = boxes[g];
        b.box.disabled = !usable;
        b.box.checked = Boolean(state.groups[g] && usable);
        b.label.classList.toggle("pe-unavailable", !usable);
        b.label.title = usable ? "" :
          "no " + g + " in " + (sets.length ? String(state.set) : "this selection");
      });
      paintReadout();
    }

    // Swatches take the first trace's resolved colour, once Plotly has one.
    function paintSwatches() {
      var full = div._fullData || [];
      groups.forEach(function (g) {
        for (var i = 0; i < full.length; i++) {
          if (metaOf(traces[full[i].index]).group !== g) continue;
          var c = (full[i].line && full[i].line.color) ||
                  (full[i].marker && full[i].marker.color);
          if (typeof c === "string") { boxes[g].swatch.style.background = c; return; }
        }
      });
    }

    // ---- zoom: min/max per pixel column, every sample when few ----
    var samples = {};
    zoomIdx.forEach(function (i) {
      var z = metaOf(traces[i]).zoom;
      var y = decodeSamples(z);
      if (!y) { warn("trace " + i + " has meta.zoom without samples"); return; }
      samples[i] = { x0: Number(z.x0) || 0, dx: Number(z.dx) || 1, y: y };
    });
    var zoomDrawn = zoomIdx.filter(function (i) { return samples[i]; });
    var zoomInfo = "";

    function axisOf(i) {
      var fd = (div._fullData || [])[i];
      var name = (fd && fd.xaxis) || traces[i].xaxis || "x";
      return "xaxis" + name.slice(1);
    }

    function fullSpan(i) {
      var s = samples[i];
      return [s.x0, s.x0 + (s.y.length - 1) * s.dx];
    }

    function envelope(i, lo, hi, columns) {
      var s = samples[i];
      var n = s.y.length;
      var i0 = Math.max(0, Math.floor((lo - s.x0) / s.dx));
      var i1 = Math.min(n, Math.ceil((hi - s.x0) / s.dx) + 1);
      if (i1 <= i0) { i0 = 0; i1 = n; }
      var count = i1 - i0;
      var threshold = opts.rawThreshold > 0 ? opts.rawThreshold : columns;
      if (count <= threshold) {
        var rx = new Array(count);
        var ry = new Array(count);
        for (var k = 0; k < count; k++) {
          rx[k] = s.x0 + (i0 + k) * s.dx;
          ry[k] = s.y[i0 + k];
        }
        return { x: rx, y: ry, raw: true, count: count, total: n, per: 1 };
      }
      // One min/max pair per column, drawn as one snaking line - the way an
      // oscilloscope draws it. No peak is lost and nothing is invented.
      var step = Math.max(1, Math.floor(count / columns));
      var used = Math.floor(count / step);
      var ex = new Array(used * 2);
      var ey = new Array(used * 2);
      for (var b = 0; b < used; b++) {
        var start = i0 + b * step;
        var mn = s.y[start];
        var mx = mn;
        for (var j = 1; j < step; j++) {
          var v = s.y[start + j];
          if (v < mn) mn = v; else if (v > mx) mx = v;
        }
        var xc = s.x0 + (start + (step >> 1)) * s.dx;
        ex[2 * b] = xc; ex[2 * b + 1] = xc;
        ey[2 * b] = mn; ey[2 * b + 1] = mx;
      }
      return { x: ex, y: ey, raw: false, count: count, total: n, per: step };
    }

    var pending = false;
    var force = false;
    var lastKey = "";

    function redrawZoom(forceNow) {
      if (!zoomDrawn.length) return;
      force = force || Boolean(forceNow);
      if (pending) return;
      pending = true;
      // Coalesce rather than lock: a "busy" flag drops every request that
      // arrives during an update, and stays set for good if one never settles.
      window.requestAnimationFrame(function () {
        pending = false;
        var fl = div._fullLayout;
        if (!fl) return;
        var columns = Math.max(100, Math.round((fl._size && fl._size.w) || 800));
        var xs = [], ys = [], idx = [], key = [], info = null;
        zoomDrawn.forEach(function (i) {
          var axis = fl[axisOf(i)];
          var span = fullSpan(i);
          var range = (axis && axis.range && !axis.autorange) ? axis.range : span;
          var lo = Number(range[0]), hi = Number(range[1]);
          key.push(i + ":" + lo.toPrecision(9) + ":" + hi.toPrecision(9));
          var visibleNow = div.data[i].visible !== false && div.data[i].visible !== "legendonly";
          var built = envelope(i, lo, hi, columns);
          xs.push(built.x); ys.push(built.y); idx.push(i);
          if (visibleNow && !info) info = built;
        });
        var k = key.join("|") + "@" + columns;
        if (!force && k === lastKey) return;
        lastKey = k;
        force = false;
        withPlotly(function (Pl) { safely(Pl.restyle(div, { x: xs, y: ys }, idx)); });
        if (info) {
          zoomInfo = info.raw
            ? "every sample · " + info.count.toLocaleString() + " of " + info.total.toLocaleString()
            : "min/max per pixel · " + info.per.toLocaleString() + " samples each · " +
              "zoom in for every sample";
        }
        paintReadout();
      });
    }

    function toFullExtent() {
      var update = {};
      zoomDrawn.forEach(function (i) {
        var span = fullSpan(i);
        update[axisOf(i) + ".range"] = span;
        update[axisOf(i) + ".autorange"] = false;
      });
      withPlotly(function (Pl) { safely(Pl.relayout(div, update)); });
      redrawZoom(true);
    }

    function paintReadout() {
      readout.textContent = [note, zoomInfo].filter(Boolean).join(" · ");
    }

    // ---- events ----
    if (select) {
      select.addEventListener("change", function () {
        state.set = sets[Number(select.value)];
        apply();
      });
    }
    if (slider) {
      slider.addEventListener("input", function () {
        state.step = steps[Number(slider.value)];
        apply();
      });
    }
    groups.forEach(function (g) {
      boxes[g].box.addEventListener("change", function (event) {
        state.groups[g] = event.target.checked;
        apply("toggle");
      });
    });

    if (zoomDrawn.length && div.on) {
      div.on("plotly_relayout", function (event) {
        var reset = Object.keys(event || {}).some(function (k) {
          return /^xaxis\d*\.autorange$/.test(k) && event[k];
        });
        if (reset) { toFullExtent(); return; }
        redrawZoom(false);
      });
      div.on("plotly_doubleclick", function () { toFullExtent(); });
    }
    if (div.on) div.on("plotly_afterplot", paintSwatches);

    apply("open");
    if (zoomDrawn.length) toFullExtent();
    paintSwatches();
  }

  // ---- find figures, including ones drawn after the deck is ready ------
  function scan() {
    withPlotly(function (P) {
      // js-plotly-plot is the class plotly.js itself puts on every figure;
      // plotly-graph-div is only on the wrapper Python's renderer writes, so
      // looking for that alone missed any figure drawn with plain JavaScript.
      var divs = document.querySelectorAll(".reveal .slides .js-plotly-plot");
      for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        // A thumbnail clone carries no live figure: no layout, no .on.
        if (!d.layout || !d.on || !d.data) continue;
        if (d.closest(".tp-drawer")) continue;
        wire(P, d);
      }
    });
  }

  var factory = function () {
    return {
      id: "RevealPlotExplorer",
      init: function (deck) {
        var cfg = (deck.getConfig() || {}).plotExplorer || {};
        if (cfg.rawThreshold !== undefined) opts.rawThreshold = Number(cfg.rawThreshold) || 0;
        ["ready", "slidechanged"].forEach(function (e) { deck.on(e, scan); });
        // Figures are drawn asynchronously and some after `ready`; look again
        // for a while rather than assume the first pass saw them all.
        var tries = 0;
        var timer = window.setInterval(function () {
          scan();
          if (++tries > 60) window.clearInterval(timer);
        }, 500);
      }
    };
  };
  // Wire figures added after the deck loaded - drawn by your own script on a
  // slide change, say. Already-wired figures are skipped.
  factory.refresh = scan;
  window.RevealPlotExplorer = factory;
})();
