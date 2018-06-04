// @flow

import { bind, unreachable } from "../utils/main";
import type {
  ExtendedElementReport,
  FromBackground,
  FromRenderer,
  ToBackground,
} from "../data/Messages";

export default class RendererProgram {
  constructor() {
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

  render(elements: Array<ExtendedElementReport>) {
    const container = document.createElement("div");
    container.id = "synth-hints";

    for (const { hintMeasurements } of elements) {
      const element = document.createElement("div");
      const text = document.createTextNode("ab");
      element.append(text);
      element.className = "synth-hint";
      element.style.setProperty(
        "transform",
        `translate(calc(${Math.round(
          hintMeasurements.x
        )}px - 100%), calc(${Math.round(hintMeasurements.y)}px - 50%))`,
        "important"
      );
      container.append(element);
    }

    if (document.documentElement != null) {
      document.documentElement.append(container);
    }

    this.sendMessage({
      type: "Rendered",
      timestamp: performance.now(),
    });
  }

  unrender() {
    const container = document.getElementById("synth-hints");
    if (container != null) {
      container.remove();
    }
  }
}
