// @flow

import { bind, unreachable } from "../utils/main";
import type { FromAllFrames, ToContent } from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import ElementManager from "./ElementManager";
import type { Offsets } from "./ElementManager";

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

    bind(this, [
      "onMessage",
      "onKeydownCapture",
      "onKeydownBubble",
      "onWindowMessage",
    ]);
  }

  start() {
    this.sendMessage({
      type: "AllFramesScriptAdded",
    });

    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydownCapture, true);
    window.addEventListener("keydown", this.onKeydownBubble, false);
    window.addEventListener("message", this.onWindowMessage, true);
    this.elementManager.start();
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    window.removeEventListener("keydown", this.onKeydownCapture, true);
    window.removeEventListener("keydown", this.onKeydownBubble, false);
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
        this.reportVisibleElements({ offsetY: 0, offsetX: 0 });
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
      let offsets = undefined;
      try {
        offsets = parseWindowMessage(event.data);
      } catch (error) {
        console.warn(
          "Ignoring bad window message",
          this.oneTimeWindowMessageToken,
          event,
          error
        );
        return;
      }
      this.reportVisibleElements(offsets);
      this.oneTimeWindowMessageToken = undefined;
    }
  }

  onKeydownCapture(event: KeyboardEvent) {
    if (this.suppressByDefault) {
      this.onKeydown(event);
    }
  }

  onKeydownBubble(event: KeyboardEvent) {
    if (!this.suppressByDefault) {
      this.onKeydown(event);
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

  reportVisibleElements(offsets: Offsets) {
    const viewport = {
      left: 0,
      right: window.innerWidth,
      top: 0,
      bottom: window.innerHeight,
    };

    const elements = this.elementManager.getVisibleElements(
      new Set(["link"]),
      offsets,
      viewport
    );

    const frames = this.elementManager.getVisibleFrames();

    for (const frame of frames) {
      if (
        frame instanceof HTMLIFrameElement ||
        frame instanceof HTMLFrameElement
      ) {
        const frameOffsets = getFrameOffsets(frame);
        const message = {
          token: this.oneTimeWindowMessageToken,
          offsetX: offsets.offsetX + frameOffsets.offsetX,
          offsetY: offsets.offsetY + frameOffsets.offsetY,
        };
        frame.contentWindow.postMessage(message, "*");
      }
    }

    this.sendMessage({
      type: "ReportVisibleElements",
      elements: elements.map(({ element, data: { type }, measurements }) => ({
        type,
        url: element instanceof HTMLAnchorElement ? element.href : undefined,
        hintMeasurements: measurements,
      })),
      pendingFrames: frames.length,
    });
  }
}

function suppressEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function parseWindowMessage(arg: { [string]: mixed }): Offsets {
  function getNumber(property: string): number {
    const value = arg[property];
    if (!(typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Invalid '${property}': ${String(value)}`);
    }
    return value;
  }
  return {
    offsetX: getNumber("offsetX"),
    offsetY: getNumber("offsetY"),
  };
}

function getFrameOffsets(frame: HTMLIFrameElement | HTMLFrameElement): Offsets {
  const rect = frame.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(frame);
  return {
    offsetX:
      rect.left +
      parseFloat(computedStyle.getPropertyValue("border-left-width")) +
      parseFloat(computedStyle.getPropertyValue("padding-left")),
    offsetY:
      rect.top +
      parseFloat(computedStyle.getPropertyValue("border-top-width")) +
      parseFloat(computedStyle.getPropertyValue("padding-top")),
  };
}
