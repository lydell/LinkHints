// @flow

import { unreachable } from "../utils/main";
import type {
  FromAllFrames,
  FromTopFrame,
  ToAllFrames,
  ToTopFrame,
} from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

export default class BackgroundProgram {
  keyboardShortcuts: Array<KeyboardMapping>;

  constructor() {
    this.keyboardShortcuts = [
      {
        shortcut: {
          key: "e",
          code: "KeyE",
          altKey: false,
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
        },
        action: {
          type: "Background",
          name: "EnterHintsModeGeneral",
        },
      },
    ];
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage.bind(this));
  }

  async sendAllFramesMessage(message: ToAllFrames): Promise<any> {
    return this.sendMessage(message);
  }

  async sendTopFrameMessage(message: ToTopFrame): Promise<any> {
    return this.sendMessage(message);
  }

  async sendMessage(message: any): Promise<any> {
    try {
      // TODO: Need to be able to send message to a specific tab, and a specific frame.
      const currentTab = await browser.tabs.query({ active: true });
      return browser.tabs.sendMessage(currentTab.id, message);
    } catch (error) {
      console.error("BackgroundProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(message: FromAllFrames | FromTopFrame) {
    switch (message.type) {
      case "AllFramesScriptAdded":
        this.sendAllFramesMessage({
          type: "StateSync",
          keyboardShortcuts: this.keyboardShortcuts,
        });
        break;

      case "TODO":
        console.log("BackgroundProgram#onMessage TODO message");
        break;

      default:
        unreachable(message.type, message);
    }
  }
}
