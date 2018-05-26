// @flow

import { bind, unreachable } from "../utils/main";
import type { FromAllFrames, ToContent } from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import ElementManager from "./ElementManager";
import type { Viewport } from "./ElementManager";

const KEYBOARD_OPTIONS = { capture: false };
const WINDOW_MESSAGE_OPTIONS = { capture: true };

export default class AllFramesProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  suppressByDefault: boolean;
  elementManager: ElementManager;
  oneTimeWindowMessageToken: ?string;

  constructor() {
    this.keyboardShortcuts = [];
    this.suppressByDefault = false;
    this.elementManager = new ElementManager();
    this.oneTimeWindowMessageToken = undefined;

    bind(this, ["onMessage", "onKeydown", "onWindowMessage"]);
  }

  start() {
    this.sendMessage({
      type: "AllFramesScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydown, KEYBOARD_OPTIONS);
    window.addEventListener(
      "message",
      this.onWindowMessage,
      WINDOW_MESSAGE_OPTIONS
    );
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
        this.oneTimeWindowMessageToken = message.oneTimeWindowMessageToken;
        break;

      case "StartFindElements": {
        const viewport = {
          top: 0,
          bottom: window.innerHeight,
          left: 0,
          right: window.innerWidth,
        };
        this.reportVisibleElements(viewport);
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  onWindowMessage(event: MessageEvent) {
    console.log("onWindowMessage", event);
    if (
      this.oneTimeWindowMessageToken != null &&
      event.data != null &&
      typeof event.data === "object" &&
      !Array.isArray(event.data) &&
      event.data.token === this.oneTimeWindowMessageToken
    ) {
      let viewport = undefined;
      try {
        viewport = parseWindowMessage(event.data);
      } catch (error) {
        console.warn(
          "Ignoring bad window message",
          this.oneTimeWindowMessageToken,
          event,
          error
        );
        return;
      }
      this.reportVisibleElements(viewport);
      this.oneTimeWindowMessageToken = undefined;
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

  reportVisibleElements(viewport: Viewport) {
    const elements = this.elementManager.getVisibleElements(
      new Set(["link"]),
      viewport
    );

    const frames = this.elementManager.getVisibleElements(
      new Set(["frame"]),
      viewport
    );

    for (const { element: frame } of frames) {
      if (
        frame instanceof window.HTMLIFrameElement ||
        frame instanceof window.HTMLFrameElement
      ) {
        const message = {
          ...viewport,
          token: this.oneTimeWindowMessageToken,
        };
        console.log("postMessage", message);
        frame.contentWindow.postMessage(message, "*");
      }
    }

    console.log("reportVisibleElements", elements, frames);
  }
}

function suppressEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function parseWindowMessage(arg: { [string]: mixed }): Viewport {
  return {
    top: assertViewportNumber(arg.top, "top"),
    bottom: assertViewportNumber(arg.bottom, "bottom"),
    left: assertViewportNumber(arg.left, "left"),
    right: assertViewportNumber(arg.right, "right"),
  };
}

function assertViewportNumber(value: mixed, property: string): number {
  if (!(typeof value === "number" && value >= 0 && Number.isFinite(value))) {
    throw new Error(`Invalid Viewport '${property}': ${String(value)}`);
  }
  return value;
}
