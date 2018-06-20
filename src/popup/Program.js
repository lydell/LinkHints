// @flow

import { bind, log, unreachable } from "../shared/main";
import type { FromBackground, FromPopup, ToBackground } from "../data/Messages";

export default class PopupProgram {
  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { log: true, catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);

    this.sendMessage({ type: "PopupScriptAdded" });
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendMessage(message: FromPopup): Promise<void> {
    const wrappedMessage: ToBackground = {
      type: "FromPopup",
      message,
    };
    await browser.runtime.sendMessage((wrappedMessage: any));
  }

  // Technically, `ToWorker` and `ToRenderer` messages (which are part of
  // `FromBackground`) can never appear here, since they are sent using
  // `browser.tabs.sendMessage` rather than `browser.runtime.sendMessage`.
  // Instead, `FromWorker` and `FromRenderer` messages can appear (which are
  // part of `ToBackground`)! That's because a popup counts as a background
  // script, which can receive messages from content scripts. So the
  // `FromBackground` type annotation isn't entirely true, but the
  // `wrappedMessage.type` check narrows the messages down correctly anyway.
  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToPopup") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "PopupProgram#onMessage", message.type, message);

    switch (message.type) {
      case "PopupData":
        log.level = message.logLevel;
        if (message.data == null) {
          this.renderDisabled();
        } else {
          this.render(message.data.perf);
        }
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
