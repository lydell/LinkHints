// @flow strict-local

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromPopup,
  ToBackground,
} from "../shared/messages";

const CONTAINER_ID = "container";

export default class PopupProgram {
  resets: Resets = new Resets();

  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    this.sendMessage({ type: "PopupScriptAdded" });
  }

  stop() {
    this.resets.reset();
  }

  async sendMessage(message: FromPopup) {
    log("log", "PopupProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
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
      case "Init":
        log.level = message.logLevel;
        this.render({ isEnabled: message.isEnabled });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  render({ isEnabled }: {| isEnabled: boolean |}) {
    const previous = document.getElementById(CONTAINER_ID);

    if (previous != null) {
      previous.remove();
    }

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.style.padding = `0 20px`;
    container.style.minWidth = "200px";

    if (!isEnabled) {
      const info = document.createElement("p");
      info.style.minWidth = "250px";
      info.style.textAlign = "center";
      info.style.margin = "10px 0";
      info.textContent = "Browser extensions are not allowed on this page.";
      container.append(info);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Options";
    button.onclick = () => {
      browser.runtime.openOptionsPage().catch(error => {
        log("error", "PopupProgram: Failed to open options page", error);
      });
    };
    button.style.margin = "10px 0";
    container.append(button);

    if (document.body != null) {
      document.body.append(container);
    }
  }
}

function wrapMessage(message: FromPopup): ToBackground {
  return {
    type: "FromPopup",
    message,
  };
}
