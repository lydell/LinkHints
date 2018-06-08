// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ElementWithHint,
  FromBackground,
  FromRenderer,
  ToBackground,
} from "../data/Messages";

const PREFIX = `synth-${String(Math.random()).slice(2)}`;
const CONTAINER_ID = `${PREFIX}-container`;
const HINT_CLASS = `${PREFIX}-hint`;

const CONTAINER_STYLES = {
  all: "unset",
  position: "fixed",
  "z-index": "2147483647",
  left: "0",
  top: "0",
  width: "100%",
  height: "100%",
};

const HINT_STYLES = {
  all: "unset",
  position: "absolute",
  transform: "translate(-100%, -50%)",
  padding: "0.2em",
  border: "solid 1px rgba(0, 0, 0, 0.4)",
  "background-color": "#ffd76e",
  color: "black",
  font: "menu",
  "font-size": "12px",
  "line-height": "1",
  "font-weight": "bold",
  "white-space": "nowrap",
  "text-transform": "uppercase",
};

export default class RendererProgram {
  css: string;

  constructor() {
    this.css = [
      rule(`#${CONTAINER_ID}`, CONTAINER_STYLES),
      rule(`.${HINT_CLASS}`, HINT_STYLES),
    ].join("");

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

    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    // Inserting a `<style>` element is way faster than doing
    // `element.style.setProperty()` on every element.
    const style = document.createElement("style");
    const styleText = document.createTextNode(this.css);
    style.append(styleText);
    container.append(style);

    for (const { hintMeasurements, hint } of elements) {
      const element = document.createElement("div");
      element.className = HINT_CLASS;
      const text = document.createTextNode(hint);
      element.append(text);
      element.style.setProperty(
        "left",
        `${Math.round(hintMeasurements.x)}px`,
        "important"
      );
      element.style.setProperty(
        "top",
        `${Math.round(hintMeasurements.y)}px`,
        "important"
      );
      container.append(element);
    }

    if (document.documentElement != null) {
      document.documentElement.append(container);

      // Most hints are already correctly positioned, but some near the edges
      // might need to be moved a tiny bit to avoid being partially off-screen.
      // Do this in the next animation frame so that the hints appear on screen
      // as quickly as possible. Adjusting positions is just a tweak – that can
      // be delayed a little bit.
      window.requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
        for (const child of container.children) {
          const rect = child.getBoundingClientRect();
          if (rect.left < 0) {
            child.style.setProperty(
              "margin-left",
              `${-rect.left}px`,
              "important"
            );
          }
          if (rect.top < 0) {
            child.style.setProperty(
              "margin-top",
              `${-rect.top}px`,
              "important"
            );
          }
          if (rect.right > innerWidth) {
            child.style.setProperty(
              "margin-left",
              `${innerWidth - rect.right}px`,
              "important"
            );
          }
          if (rect.bottom > innerHeight) {
            child.style.setProperty(
              "margin-top",
              `${innerHeight - rect.bottom}px`,
              "important"
            );
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

function rule(selector: string, styles: { [string]: string }): string {
  const declarations = Object.entries(styles)
    .map(([property, value]) => `${property}:${String(value)}!important;`)
    .join("");
  return `${selector}{${declarations}}`;
}
