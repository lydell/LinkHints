// @flow

import { bind, unreachable } from "../utils/main";
import type { FromBackground, FromPopup } from "../data/Messages";

export default class PopupProgram {
  constructor() {
    bind(this, ["onMessage"]);
  }

  async start(): Promise<void> {
    browser.runtime.onMessage.addListener(this.onMessage);

    const perf: ?Array<number> = await this.sendMessage({
      type: "GetPerf",
    });

    if (perf == null) {
      this.renderDisabled();
    } else {
      this.render(perf);
    }
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendMessage(message: FromPopup): Promise<any> {
    try {
      return await browser.runtime.sendMessage((message: any));
    } catch (error) {
      console.error("PopupProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToPopup") {
      return;
    }

    const { message } = wrappedMessage;

    switch (message.type) {
      case "TODO":
        console.log("ToPopup TODO message");
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render(perf: Array<number>) {
    const container = document.createElement("pre");
    container.textContent = JSON.stringify(perf, undefined, 2);
    if (document.body != null) {
      document.body.append(container);
    }
  }

  renderDisabled() {
    const container = document.createElement("p");
    container.textContent = "Synth is not allowed to run on this page.";
    if (document.body != null) {
      document.body.append(container);
    }
  }
}
