// @flow

import { unreachable } from "../utils/main";
import type { FromAllFrames, ToAllFrames } from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

export default class AllFramesProgram {
  keyboardShortcuts: Array<KeyboardMapping>;

  constructor() {
    this.keyboardShortcuts = [];
  }

  start() {
    this.sendMessage({
      type: "AllFramesScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage.bind(this));
  }

  async sendMessage(message: FromAllFrames): Promise<any> {
    try {
      return browser.runtime.sendMessage((message: any));
    } catch (error) {
      console.error("AllFramesProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(message: ToAllFrames) {
    switch (message.type) {
      case "StateSync":
        this.keyboardShortcuts = message.keyboardShortcuts;
        break;

      default:
        unreachable(message.type, message);
    }
  }
}
