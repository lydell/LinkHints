export const ROOT_CLASS = "root";
export const HINT_CLASS = "hint";
export const HIGHLIGHTED_HINT_CLASS = "highlighted";
export const MIXED_CASE_CLASS = "mixedCase";
export const HAS_MATCHED_CHARS_CLASS = "hasMatchedChars";
export const MATCHED_CHARS_CLASS = "matchedChars";
export const TEXT_RECT_CLASS = "matchedText";
export const SHRUGGIE_CLASS = "shruggie";
export const STATUS_CLASS = "status";
export const PEEK_CLASS = "peek";
export const HIDDEN_CLASS = "hidden";

// The minimum and maximum z-index browsers support.
export const MIN_Z_INDEX = -2147483648;
export const MAX_Z_INDEX = 2147483647;

export const SHRUGGIE = "¯\\_(ツ)_/¯";

export const CONTAINER_STYLES = {
  all: "unset",
  position: "fixed",
  "z-index": MAX_Z_INDEX.toString(),
  "pointer-events": "none",
  overflow: "hidden",
};

const font = BROWSER === "firefox" ? "font: menu;" : "font-family: system-ui;";

// The CSS is ordered so that stuff more interesting for users to change in the
// options are closer to the top.
export const CSS = `
.${ROOT_CLASS} {
  ${font}
}

.${HINT_CLASS} {
  font-size: 12px;
  padding: 2px;
  color: black;
  background-color: ${COLOR_YELLOW};
  border: solid 1px rgba(0, 0, 0, 0.5);
  text-transform: uppercase;
  font-weight: bold;
  line-height: 1;
  white-space: nowrap;
}

.${HIGHLIGHTED_HINT_CLASS} {
  background-color: ${COLOR_GREEN};
}

.${MATCHED_CHARS_CLASS} {
  opacity: 0.3;
}

.${TEXT_RECT_CLASS} {
  border-bottom: 2px solid ${COLOR_PURPLE};
  box-sizing: border-box;
}

.${STATUS_CLASS} {
  font-size: 14px;
  padding: 4px 6px;
  color: white;
  background-color: black;
  box-shadow: 0 0 1px 0 rgba(255, 255, 255, 0.5);
  bottom: 0;
  right: 0;
  line-height: 1;
}

.${PEEK_CLASS} .${HINT_CLASS}:not(.${HAS_MATCHED_CHARS_CLASS}):not(.${HIGHLIGHTED_HINT_CLASS}) {
  opacity: 0.2;
}

.${MIXED_CASE_CLASS} {
  text-transform: none;
}

.${HIDDEN_CLASS},
.${HINT_CLASS}:not(.${HIDDEN_CLASS}) ~ .${SHRUGGIE_CLASS},
.${STATUS_CLASS}:empty {
  opacity: 0 !important;
}
`.trim();

export const SUGGESTION_FONT_SIZE = `
.${HINT_CLASS} {
  font-size: 14px;
}

.${STATUS_CLASS} {
  font-size: 16px;
}
`.trim();

export const SUGGESTION_VIMIUM = `
.${ROOT_CLASS} {
  font-family: Helvetica, Arial, sans-serif;
}

.${HINT_CLASS} {
  font-size: 11px;
  padding: 1px 3px 0px 3px;
  color: #302505;
  background-image: linear-gradient(to bottom, #fff785, #ffc542);
  border: 1px solid #c38a22;
  border-radius: 3px;
  box-shadow: 0px 3px 7px 0px rgba(0, 0, 0, 0.3);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
  font-weight: bold;
}

.${HIGHLIGHTED_HINT_CLASS} {
  filter: hue-rotate(45deg) saturate(150%);
}

.${MATCHED_CHARS_CLASS} {
  opacity: 1;
  color: #d4ac3a;
}

.${STATUS_CLASS} {
  font-size: 12px;
  padding: 3px 3px 2px 3px;
  color: black;
  background-color: #ebebeb;
  border: 1px solid #b3b3b3;
  border-radius: 4px 4px 0 0;
  text-shadow: 0 1px 2px white;
  min-width: 150px;
  right: 150px;
}
`.trim();
