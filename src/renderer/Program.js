// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ElementWithHint,
  FromBackground,
  FromRenderer,
  HintUpdate,
  ToBackground,
} from "../data/Messages";

// It's tempting to put a random number or something in the ID, but in case
// something goes wrong and a rogue container is left behind it's always
// possible to find and remove it if the ID is known.
const CONTAINER_ID = "SynthWebExt";
const HINT_CLASS = "hint";
const HIDDEN_HINT_CLASS = "hiddenHint";
const MATCHED_HINT_CLASS = "matchedHint";
const MATCHED_CHARS_CLASS = "matchedChars";

const MAX_IMMEDIATE_HINT_MOVEMENTS = 50;

const CONTAINER_STYLES = {
  all: "unset",
  position: "absolute",
  "z-index": "2147483647", // Maximum z-index browsers support.
  width: "100%",
  height: "100%",
  "pointer-events": "none",
  overflow: "hidden",
};

const CSS = `
.${HINT_CLASS} {
  position: absolute;
  transform: translateY(-50%);
  box-sizing: border-box;
  padding: 2px;
  border: solid 1px rgba(0, 0, 0, 0.4);
  background-color: #ffd76e;
  color: black;
  font: menu;
  font-size: 12px;
  line-height: 1;
  font-weight: bold;
  white-space: nowrap;
  text-align: center;
  text-transform: uppercase;
}

.${HIDDEN_HINT_CLASS} {
  opacity: 0;
}

.${MATCHED_HINT_CLASS} {
  background-color: lime;
}

.${MATCHED_CHARS_CLASS} {
  opacity: 0.3;
}
`.trim();

export default class RendererProgram {
  css: string;

  constructor() {
    this.css = CSS;

    bind(this, ["onMessage"]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);

    this.sendMessage({
      type: "RendererScriptAdded",
    });
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendMessage(message: FromRenderer): Promise<any> {
    const wrappedMessage: ToBackground = {
      type: "FromRenderer",
      message,
    };
    try {
      return await browser.runtime.sendMessage((wrappedMessage: any));
    } catch (error) {
      console.error(
        "RendererProgram#sendMessage failed",
        wrappedMessage,
        error
      );
      throw error;
    }
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToRenderer") {
      return;
    }

    const { message } = wrappedMessage;

    switch (message.type) {
      case "Render":
        this.render(message.elements);
        break;

      case "UpdateHints":
        this.updateHints(message.updates, { markMatched: message.markMatched });
        break;

      case "Unrender":
        this.unrender();
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render(elements: Array<ElementWithHint>) {
    this.unrender();

    // I've tried creating the container in the constructor and re-using it for
    // all renders, but that didn't turn out to be faster.
    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    setStyles(container, {
      ...CONTAINER_STYLES,
      left: `${window.scrollX}px`,
      top: `${window.scrollY}px`,
    });

    // Using `mode: "closed"` is tempting, but then Firefox does not seem to
    // allow inspecting the elements inside in its devtools. That's important
    // for people who want to customize the styling of the hints.
    const root = container.attachShadow({ mode: "open" });

    // Inserting a `<style>` element is way faster than doing
    // `element.style.setProperty()` on every element.
    const style = document.createElement("style");
    style.append(document.createTextNode(this.css));
    root.append(style);

    if (document.documentElement != null) {
      document.documentElement.append(container);
    }

    // "W" is usually (one of) the widest character(s). This is surprisingly
    // cheap to calculate.
    const probe1 = createHintElement("W");
    const probe2 = createHintElement("WW");
    root.append(probe1);
    root.append(probe2);
    const rect1 = probe1.getBoundingClientRect();
    const rect2 = probe2.getBoundingClientRect();
    const halfHeight = Math.ceil(rect1.height / 2);
    const widthK = rect2.width - rect1.width;
    const widthM = rect1.width - widthK;
    probe1.remove();
    probe2.remove();

    const edgeElements = [];
    const restElements = [];
    let numEdgeElements = 0;

    const { innerHeight } = window;

    for (const { hintMeasurements, hint } of elements) {
      const element = createHintElement(hint);

      // Use `right` rather than `left` since the hints should be right-aligned
      // rather than left-aligned. This could also be done using `left` and
      // `transform: translateX(-100%)`, but that results in blurry hints in
      // Chrome due to Chrome making the widths of the hints non-integer based
      // on the font. `calc()` does not affect performance.
      element.style.right = `calc(100% - ${Math.round(hintMeasurements.x)}px)`;
      element.style.top = `${Math.round(hintMeasurements.y)}px`;

      root.append(element);

      if (
        numEdgeElements < MAX_IMMEDIATE_HINT_MOVEMENTS &&
        (hintMeasurements.x <= Math.ceil(widthM + widthK * hint.length) ||
          hintMeasurements.y <= halfHeight ||
          innerHeight - hintMeasurements.y <= halfHeight)
      ) {
        numEdgeElements = edgeElements.push(element);
      } else {
        restElements.push(element);
      }
    }

    // Most hints are already correctly positioned, but some near the edges
    // might need to be moved a tiny bit to avoid being partially off-screen.
    // Do this in a separate animation frame if there are a lot of hints so
    // that the hints appear on screen as quickly as possible. Adjusting
    // positions is just a tweak – that can be delayed a little bit.
    if (numEdgeElements > 0) {
      moveInsideViewport(edgeElements);
    }

    // Using double `requestAnimationFrame` since they run before paint.
    // See: https://youtu.be/cCOL7MC4Pl0?t=20m29s
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        moveInsideViewport(restElements);
      });
    });

    this.sendMessage({
      type: "Rendered",
      timestamp: performance.now(),
    });
  }

  updateHints(
    updates: Array<HintUpdate>,
    { markMatched = false }: {| markMatched: boolean |} = {}
  ) {
    const container = document.getElementById(CONTAINER_ID);
    const root = container == null ? undefined : container.shadowRoot;
    if (root == null) {
      console.error("RendererProgram#updateHints: missing root", container);
      return;
    }

    const hints = root.querySelectorAll(`.${HINT_CLASS}`);

    for (const [index, update] of updates.entries()) {
      const child = hints[index];

      if (child == null) {
        console.error(
          "RendererProgram#updateHints: missing child",
          index,
          update
        );
        continue;
      }

      child.classList.toggle(HIDDEN_HINT_CLASS, update.type === "Hide");

      if (update.type === "Update") {
        emptyElement(child);
        if (update.matched !== "") {
          const matched = document.createElement("span");
          matched.className = MATCHED_CHARS_CLASS;
          matched.append(document.createTextNode(update.matched));
          child.append(matched);
        }
        if (markMatched) {
          child.classList.add(MATCHED_HINT_CLASS);
        }
        child.append(document.createTextNode(update.rest));
      }
    }
  }

  unrender() {
    const container = document.getElementById(CONTAINER_ID);
    if (container != null) {
      container.remove();
    }
  }
}

function setStyles(element: HTMLElement, styles: { [string]: string }) {
  for (const [property, value] of Object.entries(styles)) {
    // $FlowIgnore: Flow thinks that `value` is `mixed` here, but it is a `string`.
    element.style.setProperty(property, value, "important");
  }
}

function emptyElement(element: HTMLElement) {
  while (element.firstChild != null) {
    element.removeChild(element.firstChild);
  }
}

function moveInsideViewport(elements: Array<HTMLElement>) {
  const { innerWidth, innerHeight } = window;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.left < 0) {
      element.style.marginRight = `${Math.round(rect.left)}px`;
    }
    if (rect.top < 0) {
      element.style.marginTop = `${Math.round(-rect.top)}px`;
    }
    if (rect.right > innerWidth) {
      element.style.marginRight = `${Math.round(rect.right - innerWidth)}px`;
    }
    if (rect.bottom > innerHeight) {
      element.style.marginTop = `${Math.round(innerHeight - rect.bottom)}px`;
    }
  }
}

function createHintElement(hint: string): HTMLElement {
  const element = document.createElement("div");
  element.className = HINT_CLASS;
  element.append(document.createTextNode(hint));
  return element;
}
