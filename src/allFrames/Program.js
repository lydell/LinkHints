// @flow

import { bind, unreachable } from "../utils/main";
import type { FromAllFrames, ToContent } from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import ElementManager from "./ElementManager";

const KEYBOARD_OPTIONS = { capture: false };

export default class AllFramesProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  suppressByDefault: boolean;
  elementManager: ElementManager;

  constructor() {
    this.keyboardShortcuts = [];
    this.suppressByDefault = false;
    this.elementManager = new ElementManager();

    bind(this, ["onMessage", "onKeydown"]);
  }

  start() {
    this.sendMessage({
      type: "AllFramesScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydown, KEYBOARD_OPTIONS);
    this.elementManager.start();
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    window.removeEventListener("keydown", this.onKeydown, KEYBOARD_OPTIONS);
    this.elementManager.stop();
  }

  async sendMessage(message: FromAllFrames): Promise<any> {
    try {
      return browser.runtime.sendMessage((message: any));
    } catch (error) {
      console.error("AllFramesProgram#sendMessage failed", message, error);
      throw error;
    }
  }

  onMessage(wrappedMessage: ToContent) {
    if (wrappedMessage.type !== "ToAllFrames") {
      return;
    }

    const { message } = wrappedMessage;

    switch (message.type) {
      case "StateSync":
        this.keyboardShortcuts = message.keyboardShortcuts;
        this.suppressByDefault = message.suppressByDefault;
        break;

      case "StartFindElements": {
        const viewport = {
          top: 0,
          bottom: window.innerHeight,
          left: 0,
          right: window.innerWidth,
        };
        console.log(
          "StartFindElements",
          this.elementManager.getVisibleElements(new Set(["link"]), viewport),
          this
        );
        break;
      }

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
