// @flow

import { bind, unreachable } from "../utils/main";
import type { FromTopFrame, ToContent } from "../data/Messages";

export default class TopFrameProgram {
  constructor() {
    bind(this, ["onMessage"]);
  }

  start() {
    this.sendMessage({
      type: "TopFrameScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage);
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendMessage(message: FromTopFrame): Promise<any> {
    try {
      return browser.runtime.sendMessage((message: any));
    } catch (error) {
      console.error("TopFrameProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(wrappedMessage: ToContent) {
    if (wrappedMessage.type !== "ToTopFrame") {
      return;
    }

    const { message } = wrappedMessage;

    switch (message.type) {
      case "TODO":
        console.log("TopFrameProgram TODO message", message);
        break;

      default:
        unreachable(message.type, message);
    }
  }
}
