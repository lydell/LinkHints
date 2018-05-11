// @flow

if (typeof BROWSER === "undefined") {
  // Prevent rollup-plugin-replace from replacing BROWSER here.
  window[`${"B"}ROWSER`] = sniffBrowser();
}

function sniffBrowser(): Browser {
  return window.sidebar ? "firefox" : "chrome";
}
