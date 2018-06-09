// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ElementWithHint,
  FromBackground,
  FromRenderer,
  ToBackground,
} from "../data/Messages";

// It's tempting to put a random number or something in the ID, but in case
// something goes wrong and a rogue container is left behind it's always
// possible to find and remove it if the ID is known.
const CONTAINER_ID = "SynthWebExt";
const HINT_CLASS = "hint";

const CONTAINER_STYLES = {
  all: "unset",
  position: "fixed",
  "z-index": "2147483647", // Maximum z-index browsers support.
  left: "0",
  top: "0",
  width: "100%",
  height: "100%",
};

const CSS = `
.${HINT_CLASS} {
  position: absolute;
  transform: translate(-100%, -50%);
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
    setStyles(container, CONTAINER_STYLES);

    // Using `mode: "closed"` is tempting, but then Firefox does not seem to
    // allow inspecting the elements inside in its devtools. That's important
    // for people who want to customize the styling of the hints.
    const root = container.attachShadow({ mode: "open" });

    // Inserting a `<style>` element is way faster than doing
    // `element.style.setProperty()` on every element.
    const style = document.createElement("style");
    const styleText = document.createTextNode(this.css);
    style.append(styleText);
    root.append(style);

    for (const { hintMeasurements, hint } of elements) {
      const element = document.createElement("div");
      element.className = HINT_CLASS;
      element.style.left = `${Math.round(hintMeasurements.x)}px`;
      element.style.top = `${Math.round(hintMeasurements.y)}px`;
      const text = document.createTextNode(hint);
      element.append(text);
      root.append(element);
    }

    if (document.documentElement != null) {
      document.documentElement.append(container);

      // Most hints are already correctly positioned, but some near the edges
      // might need to be moved a tiny bit to avoid being partially off-screen.
      // Also make sure that the width and height of the hints are integers so
      // that they end up super crisp (this is especially important in Chrome).
      // Do this in the next animation frame so that the hints appear on screen
      // as quickly as possible. Adjusting positions is just a tweak – that can
      // be delayed a little bit.
      window.requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
        for (const child of root.children) {
          const rect = child.getBoundingClientRect();
          if (rect.width % 1 !== 0) {
            child.style.width = `${Math.round(rect.width)}px`;
          }
          if (rect.height % 1 !== 0) {
            child.style.height = `${Math.round(rect.height)}px`;
          }
          if (rect.left < 0) {
            child.style.marginLeft = `${Math.round(-rect.left)}px`;
          }
          if (rect.top < 0) {
            child.style.marginTop = `${Math.round(-rect.top)}px`;
          }
          if (rect.right > innerWidth) {
            child.style.marginLeft = `${Math.round(innerWidth - rect.right)}px`;
          }
          if (rect.bottom > innerHeight) {
            child.style.marginTop = `${Math.round(
              innerHeight - rect.bottom
            )}px`;
          }
        }
      });
    }

    this.sendMessage({
      type: "Rendered",
      timestamp: performance.now(),
    });
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
