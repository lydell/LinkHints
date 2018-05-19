// @flow

import { unreachable } from "../utils/main";
import type { FromAllFrames, ToAllFrames } from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

export default class AllFramesProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  suppressByDefault: boolean;

  constructor() {
    this.keyboardShortcuts = [];
    this.suppressByDefault = false;
  }

  start() {
    this.sendMessage({
      type: "AllFramesScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage.bind(this));

    window.addEventListener("keydown", this.onKeydown.bind(this), false);
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
        this.suppressByDefault = message.suppressByDefault;
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onKeydown(event: KeyboardEvent) {
    if (!event.isTrusted || event.defaultPrevented) {
      return;
    }

    const match = this.keyboardShortcuts.find(
      ({ shortcut }) =>
        event.key === shortcut.key &&
        event.code === shortcut.code &&
        event.altKey === shortcut.altKey &&
        event.ctrlKey === shortcut.ctrlKey &&
        event.metaKey === shortcut.metaKey &&
        event.shiftKey === shortcut.shiftKey
    );

    if (match != null) {
      suppressEvent(event);
      this.sendMessage({
        type: "KeyboardShortcutMatched",
        action: match.action,
      });
    } else if (this.suppressByDefault) {
      suppressEvent(event);
    }
  }
}

function suppressEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}
