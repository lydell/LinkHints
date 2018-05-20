// @flow

import { bind, unreachable } from "../utils/main";
import type {
  FromContent,
  ToAllFrames,
  ToContent,
  ToTopFrame,
} from "../data/Messages";
import type {
  KeyboardAction,
  KeyboardMapping,
} from "../data/KeyboardShortcuts";

export default class BackgroundProgram {
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
  topFrameIds: Map<number, number>;

  constructor({
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
  }: {|
    normalKeyboardShortcuts: Array<KeyboardMapping>,
    hintsKeyboardShortcuts: Array<KeyboardMapping>,
  |}) {
    this.normalKeyboardShortcuts = normalKeyboardShortcuts;
    this.hintsKeyboardShortcuts = hintsKeyboardShortcuts;
    this.topFrameIds = new Map();

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
        this.onKeyboardShortcut(
          message.action,
          sender.tab == null ? undefined : sender.tab.id
        );
        break;

      case "TopFrameScriptAdded":
        if (sender.tab != null && sender.frameId != null) {
          this.topFrameIds.set(sender.tab.id, sender.frameId);
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onKeyboardShortcut(action: KeyboardAction, tabId?: number) {
    switch (action.type) {
      case "EnterHintsMode":
        this.sendAllFramesMessage(
          { type: "StartFindElements" },
          tabId == null
            ? undefined
            : {
                tabId,
                frameId: this.topFrameIds.get(tabId),
              }
        );
        break;

      case "ExitHintsMode":
        console.log("ExitHintsMode");
        break;

      case "PressHintChar":
        console.log("PressHintChar", action.char);
        break;

      default:
        unreachable(action.type, action);
    }
  }
}
