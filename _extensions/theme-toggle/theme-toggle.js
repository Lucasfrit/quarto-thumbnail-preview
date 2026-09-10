/*
 * RevealThemeToggle
 *
 * Light and dark for a Quarto + Reveal.js deck, driven by the operating
 * system's setting via prefers-color-scheme, with a floating button and a
 * keyboard shortcut to override it for the session.
 *
 * Why this exists: Quarto has no light/dark switch for reveal decks - the one
 * in its documentation is a website/HTML feature - so a deck that wants one
 * has to carry it. Without it the browser's own "auto dark mode" inverts the
 * page instead, and an inversion is not a theme: it turns pale gridlines into
 * near-white ones and flips a tooltip's background without flipping its text.
 *
 * This plugin owns the *state* and the *chrome* only. It sets `data-theme` on
 * <html>, remembers a deliberate choice, and tells anyone who asked when the
 * mode changes. Anything whose colours do not live in CSS - a Plotly figure
 * keeps its palette in the figure's layout - is the deck's own business, and
 * `RevealThemeToggle.onChange` is how the deck hears about it:
 *
 *     RevealThemeToggle.onChange(function (mode) {
 *       repaintMyFigures(mode);          // also called once, immediately
 *     });
 *
 * Options come from the `theme-toggle` key in the document YAML, merged over
 * the defaults declared in _extension.yml. Quarto only forwards plugin options
 * it was told about there, so a key that is not declared in _extension.yml
 * never reaches deck.getConfig().
 */
(function () {
  "use strict";

  var LIGHT = "light";
  var DARK = "dark";

  // Printing wants ink on paper, not a black slide. PDF export is the one
  // case where the viewer's preference is not what they meant, so it is
  // forced rather than merely defaulted.
  var PRINTING = /print-pdf/gi.test(window.location.search);

  var opts = {
    default: "system",
    shortcut: "D",
    showButton: true,
    styleSlides: true,
    remember: true,
    storageKey: "quarto-deck-theme"
  };

  // null = follow the system. A deliberate choice is remembered, so a deck
  // reopened for a talk comes back the way it was left.
  var override = null;
  var listeners = [];
  var button = null;
  var applied = null;

  function readStored() {
    if (!opts.remember) return null;
    try {
      var saved = window.localStorage.getItem(opts.storageKey);
      return saved === LIGHT || saved === DARK ? saved : null;
    } catch (e) {
      return null; // private window, or storage disabled
    }
  }

  function writeStored(value) {
    if (!opts.remember) return;
    try {
      if (value) window.localStorage.setItem(opts.storageKey, value);
      else window.localStorage.removeItem(opts.storageKey);
    } catch (e) { /* ignore */ }
  }

  function systemMode() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? DARK : LIGHT;
  }

  function wanted() {
    if (PRINTING) return LIGHT;
    if (override) return override;
    if (opts.default === LIGHT || opts.default === DARK) return opts.default;
    return systemMode();
  }

  function notify(mode) {
    // A listener that throws is a bug in the deck, not a reason to leave the
    // remaining figures on the previous theme.
    listeners.forEach(function (fn) {
      try { fn(mode); } catch (e) { /* the deck's problem, not ours */ }
    });
  }

  function apply() {
    var mode = wanted();
    var changed = mode !== applied;
    applied = mode;
    // The attribute is the contract with CSS, and it is set before anything
    // else runs so a deck's own [data-theme="dark"] rules match on the first
    // paint rather than a frame later.
    document.documentElement.setAttribute("data-theme", mode);
    // The button always refreshes: pinning the mode you are already in
    // changes nothing on screen but everything about what the next click
    // does, and the tooltip is where that is written down.
    updateButton();
    // Listeners only hear about a real change. Repainting is expensive on
    // the decks this exists for - a figure-heavy deck spends most of a second
    // of blocked main thread relaying out every plot - and following the
    // system again while already in the system's mode is not a change.
    if (changed) notify(mode);
  }

  function set(mode) {
    override = mode === LIGHT || mode === DARK ? mode : null;
    writeStored(override);
    apply();
  }

  function toggle() { set(wanted() === DARK ? LIGHT : DARK); }
  function follow() { set(null); }

  function updateButton() {
    if (!button) return;
    var dark = wanted() === DARK;
    button.textContent = dark ? "☾" : "☀";
    button.setAttribute("aria-pressed", dark ? "true" : "false");
    button.title = (override ? "Theme: " + override + " (fixed)"
                             : "Theme: following the system")
      + " — click to switch, double-click to follow the system again"
      + (opts.shortcut ? " (Shift+" + opts.shortcut + ")" : "");
  }

  function addButton() {
    if (button || !opts.showButton || PRINTING || !document.body) return;
    button = document.createElement("button");
    button.className = "deck-theme-toggle";
    button.setAttribute("aria-label", "Toggle light and dark");
    button.addEventListener("click", toggle);
    // Double-click is the way back to the system setting. It fires after a
    // click has already toggled, so the second one lands on `follow` and the
    // net effect is still "stop overriding".
    button.addEventListener("dblclick", follow);
    document.body.appendChild(button);
    updateButton();
  }

  function onKeydown(event) {
    if (!opts.shortcut) return;
    // Shift is what keeps this off the letter keys Reveal itself uses, and
    // comparing the shifted character rather than the code keeps it working
    // on a layout where the key sits somewhere else.
    if (event.shiftKey && event.key === String(opts.shortcut).toUpperCase()) {
      toggle();
    }
  }

  // The system setting is the source of truth, and it can change while the
  // deck is open - someone's machine crossing into the evening mid-talk.
  function watchSystem() {
    if (!window.matchMedia) return;
    var query = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (!override) apply(); };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  var api = {
    /** The mode now in effect: "light" or "dark". */
    mode: function () { return wanted(); },
    /** True when the viewer pinned a mode rather than following the system. */
    isOverridden: function () { return override !== null; },
    /** Pin a mode, or pass null to follow the system again. */
    set: set,
    toggle: toggle,
    follow: follow,
    /**
     * Register a callback for theme changes. It is also called immediately
     * with the current mode, so a deck that registers late still paints
     * itself correctly instead of waiting for the first switch.
     */
    onChange: function (fn) {
      if (typeof fn !== "function") return;
      listeners.push(fn);
      if (applied) {
        try { fn(applied); } catch (e) { /* the deck's problem, not ours */ }
      }
    }
  };

  window.RevealThemeToggle = function () {
    return {
      id: "RevealThemeToggle",

      init: function (deck) {
        var cfg = (deck.getConfig() || {}).themeToggle || {};
        Object.keys(opts).forEach(function (key) {
          if (cfg[key] !== undefined) opts[key] = cfg[key];
        });

        // Read storage only now: the key it lives under is configurable, so
        // the early paint used the default key and this is the first moment
        // the real one is known.
        var stored = readStored();
        if (stored) override = stored;

        if (opts.styleSlides && !PRINTING) {
          document.documentElement.classList.add("theme-toggle-slides");
        }

        addButton();
        apply();
      }
    };
  };

  // Expose the API on the same name the plugin factory uses. Reveal calls the
  // factory; a deck calls these. Assigning the methods onto the function
  // keeps both spellings working from one global.
  Object.keys(api).forEach(function (key) {
    window.RevealThemeToggle[key] = api[key];
  });

  // Before Reveal is anywhere near ready: no flash of the wrong theme while
  // the plugin waits its turn.
  apply();
  watchSystem();
  document.addEventListener("keydown", onKeydown);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addButton);
  } else {
    addButton();
  }
})();
