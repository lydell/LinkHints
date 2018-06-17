// @flow

import { bind, unreachable } from "../shared/main";
import type { FromBackground, FromPopup, ToBackground } from "../data/Messages";

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
    const wrappedMessage: ToBackground = {
      type: "FromPopup",
      message,
    };
    try {
      return await browser.runtime.sendMessage((wrappedMessage: any));
    } catch (error) {
      console.error("PopupProgram#sendMessage failed", wrappedMessage, error);
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
    const container = document.createElement("div");
    container.style.padding = `0 20px`;

    const heading = document.createElement("h2");
    heading.textContent = "Latest durations";
    container.append(heading);

    if (perf.length > 0) {
      const average = document.createElement("p");
      average.textContent = `Average: ${getAverage(perf).toFixed(2)} ms`;
      container.append(average);
    }

    const list = document.createElement("ol");
    list.style.paddingLeft = "1em";
    for (const duration of perf) {
      const li = document.createElement("li");
      li.textContent = `${duration.toFixed(2)} ms`;
      list.append(li);
    }
    container.append(list);

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

function getAverage(numbers: Array<number>): number {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}
