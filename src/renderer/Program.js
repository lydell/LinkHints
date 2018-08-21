// @flow

import {
  LOADED_KEY,
  Resets,
  addListener,
  bind,
  log,
  unreachable,
} from "../shared/main";
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
const UNRENDER_DELAY = 200; // ms

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
  resets: Resets;

  constructor() {
    this.css = CSS;
    this.resets = new Resets();

    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    // The background program checks for this global using `executeScript` (in
    // the top frame only) to see if content scripts have been loaded
    // automatically from `content_scripts` in manifest.json.
    window[LOADED_KEY] = true;

    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    // In Chrome, content scripts continue to live after the extension has been
    // disabled, uninstalled or reloaded. A way to detect this is to make a
    // `Port` and listen for `onDisconnect`.
    // In Firefox, content scripts are nuked when uninstalling. `onDisconnect`
    // never runs. However, when reloading the content scripts seems to be
    // re-run (with the new code), but not connected to the background. Super
    // weird. That causes any kind of messaging with the background to throw
    // errors. And the port to immediately disconnect. So this port stuff for
    // dealing with “orphaned” content scripts ends up working in Firefox as
    // well, just in a slightly different way. Unfortunately, the
    // `port.postMessage()` call below causes a fat `TypeError: extension is
    // undefined` error to be logged to the Browser console for “orphaned”
    // content scripts. (The error is only logged, not `throw`n.) This bloats
    // the console a little, but doesn’t cause any other problems.
    const port = browser.runtime.connect();
    port.postMessage(wrapMessage({ type: "RendererScriptAdded" }));
    port.onDisconnect.addListener(() => {
      this.stop();
    });
  }

  stop() {
    window[LOADED_KEY] = false;
    this.resets.reset();
    this.unrender();
  }

  async sendMessage(message: FromRenderer): Promise<void> {
    log("log", "RendererProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToRenderer") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "RendererProgram#onMessage", message.type, message);

    switch (message.type) {
      case "StateSync":
        log.level = message.logLevel;
        break;

      case "Render":
        this.render(message.elements);
        break;

      case "UpdateHints":
        this.updateHints(message.updates, { markMatched: message.markMatched });
        break;

      case "Unrender":
        this.unrender({ delayed: message.delayed });
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

    if (elements.length === 0) {
      const element = createHintElement("¯\\_(ツ)_/¯");
      element.style.top = "50%";
      element.style.left = "50%";
      element.style.transform = "translate(-50%, -50%)";
      root.append(element);
      return;
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

    // Use the rect of the container to get viewport width and height rather
    // than relying on `window.innerWidth` and `window.innerHeight`, to avoid
    // rendering hints behind the page scrollbars (if any). We've already
    // inserted the container into the DOM and made other DOM measurements
    // anyway. This is fast.
    const containerRect = container.getBoundingClientRect();

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
          containerRect.height - hintMeasurements.y <= halfHeight)
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
      moveInsideViewport(edgeElements, containerRect);
    }

    // Using double `requestAnimationFrame` since they run before paint.
    // See: https://youtu.be/cCOL7MC4Pl0?t=20m29s
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        moveInsideViewport(restElements, containerRect);
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
      log("error", "RendererProgram#updateHints: missing root", container);
      return;
    }

    const hints = root.querySelectorAll(`.${HINT_CLASS}`);

    for (const [index, update] of updates.entries()) {
      const child = hints[index];

      if (child == null) {
        log(
          "error",
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

  unrender({ delayed = false }: {| delayed: boolean |} = {}) {
    const container = document.getElementById(CONTAINER_ID);
    if (container != null) {
      if (delayed) {
        setTimeout(() => {
          container.remove();
        }, UNRENDER_DELAY);
      } else {
        container.remove();
      }
    }
  }
}

function wrapMessage(message: FromRenderer): ToBackground {
  return {
    type: "FromRenderer",
    message,
  };
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

function moveInsideViewport(
  elements: Array<HTMLElement>,
  containerRect: ClientRect
) {
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.left < 0) {
      element.style.marginRight = `${Math.round(rect.left)}px`;
    }
    if (rect.top < 0) {
      element.style.marginTop = `${Math.round(-rect.top)}px`;
    }
    if (rect.right > containerRect.width) {
      element.style.marginRight = `${Math.round(
        rect.right - containerRect.width
      )}px`;
    }
    if (rect.bottom > containerRect.height) {
      element.style.marginTop = `${Math.round(
        containerRect.height - rect.bottom
      )}px`;
    }
  }
}

function createHintElement(hint: string): HTMLElement {
  const element = document.createElement("div");
  element.className = HINT_CLASS;
  element.append(document.createTextNode(hint));
  return element;
}
