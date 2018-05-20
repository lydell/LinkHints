// @flow

import { bind, unreachable } from "../utils/main";
import type {
  FromContent,
  ToAllFrames,
  ToContent,
  ToTopFrame,
} from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;

  constructor({
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
  }: {|
    normalKeyboardShortcuts: Array<KeyboardMapping>,
    hintsKeyboardShortcuts: Array<KeyboardMapping>,
  |}) {
    this.normalKeyboardShortcuts = normalKeyboardShortcuts;
    this.hintsKeyboardShortcuts = hintsKeyboardShortcuts;

    bind(this, ["onMessage"]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
  }

  async sendAllFramesMessage(
    message: ToAllFrames,
    { tabId, frameId }: {| tabId?: number, frameId?: number |} = {}
  ): Promise<any> {
    return this.sendMessage(
      { type: "ToAllFrames", message },
      { tabId, frameId }
    );
  }

  async sendTopFrameMessage(message: ToTopFrame): Promise<any> {
    return this.sendMessage({ type: "ToTopFrame", message });
  }

  async sendMessage(
    message: ToContent,
    { tabId: passedTabId, frameId }: {| tabId?: number, frameId?: number |} = {}
  ): Promise<any> {
    try {
      const tabId =
        passedTabId == null
          ? (await browser.tabs.query({ active: true })).id
          : passedTabId;
      return frameId == null
        ? browser.tabs.sendMessage(tabId, message)
        : browser.tabs.sendMessage(tabId, message, { frameId });
    } catch (error) {
      console.error("BackgroundProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(message: FromContent, sender: MessageSender) {
    switch (message.type) {
      case "AllFramesScriptAdded":
        this.sendAllFramesMessage(
          {
            type: "StateSync",
            keyboardShortcuts: this.normalKeyboardShortcuts,
            suppressByDefault: false,
          },
          { tabId: sender.tab == null ? undefined : sender.tab.id }
        );
        break;

      case "KeyboardShortcutMatched":
        console.log("KeyboardShortcutMatched", message.action);
        break;

      case "TODO":
        console.log("BackgroundProgram#onMessage TODO message");
        break;

      default:
        unreachable(message.type, message);
    }
  }
}
