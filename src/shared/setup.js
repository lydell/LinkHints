// @flow

if (typeof BROWSER === "undefined") {
  // Prevent rollup-plugin-replace from replacing BROWSER here.
  window[`${"B"}ROWSER`] = window.sidebar ? "firefox" : "chrome";
}
