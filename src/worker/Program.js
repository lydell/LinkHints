// @flow

import { bind, unreachable } from "../utils/main";
import type {
  FromBackground,
  FromWorker,
  ToBackground,
} from "../data/Messages";
import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import ElementManager from "./ElementManager";
import type { Viewport } from "./ElementManager";

// The single-page HTML specification has over 70K links! If trying to track all
// of those, Firefox warns that the extension is slowing the page down while
// loading. When fully loaded, scrolling is noticeably laggy. On my computer,
// the lag starts somewhere between 10K and 20K tracked links. Tracking at most
// 10K should be enough for regular sites.
const MAX_TRACKED_ELEMENTS = 10e3;

export default class WorkerProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  suppressByDefault: boolean;
  elementManager: ElementManager;
  oneTimeWindowMessageToken: ?string;

  constructor() {
    this.keyboardShortcuts = [];
    this.suppressByDefault = false;
    this.elementManager = new ElementManager({
      maxTrackedElements: MAX_TRACKED_ELEMENTS,
    });
    this.oneTimeWindowMessageToken = undefined;

    bind(this, [
      "onMessage",
      "onKeydownCapture",
      "onKeydownBubble",
      "onWindowMessage",
    ]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydownCapture, true);
    window.addEventListener("keydown", this.onKeydownBubble, false);
    window.addEventListener("message", this.onWindowMessage, true);
    this.elementManager.start();

    this.sendMessage({
      type: "WorkerScriptAdded",
    });
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    window.removeEventListener("keydown", this.onKeydownCapture, true);
    window.removeEventListener("keydown", this.onKeydownBubble, false);
    this.elementManager.stop();
  }

  async sendMessage(message: FromWorker): Promise<any> {
    const wrappedMessage: ToBackground = {
      type: "FromWorker",
      message,
    };
    try {
      return await browser.runtime.sendMessage((wrappedMessage: any));
    } catch (error) {
      console.error("WorkerProgram#sendMessage failed", wrappedMessage, error);
      throw error;
    }
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToWorker") {
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
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        this.reportVisibleElements([viewport]);
        break;
      }

      default:
        unreachable(message.type, message);
    }
  }

  onWindowMessage(event: MessageEvent) {
    if (
      this.oneTimeWindowMessageToken != null &&
      event.data != null &&
      typeof event.data === "object" &&
      !Array.isArray(event.data) &&
      event.data.token === this.oneTimeWindowMessageToken
    ) {
      let viewports = undefined;
      try {
        viewports = parseViewports(event.data.viewports);
      } catch (error) {
        console.warn(
          "Ignoring bad window message",
          this.oneTimeWindowMessageToken,
          event,
          error
        );
        return;
      }
      this.reportVisibleElements(viewports);
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
        timestamp: performance.now(),
      });
    } else if (this.suppressByDefault) {
      suppressEvent(event);
    }
  }

  reportVisibleElements(viewports: Array<Viewport>) {
    const elements = this.elementManager.getVisibleElements(
      new Set(["link"]),
      viewports
    );

    const frames = this.elementManager.getVisibleFrames();

    for (const frame of frames) {
      if (
        frame instanceof HTMLIFrameElement ||
        frame instanceof HTMLFrameElement
      ) {
        const message = {
          token: this.oneTimeWindowMessageToken,
          viewports: viewports.concat(getFrameViewport(frame)),
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

function parseViewports(rawViewports: mixed): Array<Viewport> {
  function getNumber(arg: { [string]: mixed }, property: string): number {
    const value = arg[property];
    if (!(typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Invalid '${property}': ${String(value)}`);
    }
    return value;
  }

  if (!Array.isArray(rawViewports)) {
    throw new Error(`Expected an array, but got: ${typeof rawViewports}`);
  }

  return rawViewports.map(viewport => {
    if (
      viewport == null ||
      typeof viewport !== "object" ||
      Array.isArray(viewport)
    ) {
      throw new Error(`Expected an object, but got: ${typeof viewport}`);
    }
    return {
      x: getNumber(viewport, "x"),
      y: getNumber(viewport, "y"),
      width: getNumber(viewport, "width"),
      height: getNumber(viewport, "height"),
    };
  });
}

function getFrameViewport(
  frame: HTMLIFrameElement | HTMLFrameElement
): Viewport {
  const rect = frame.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(frame);
  const border = {
    left: parseFloat(computedStyle.getPropertyValue("border-left-width")),
    right: parseFloat(computedStyle.getPropertyValue("border-right-width")),
    top: parseFloat(computedStyle.getPropertyValue("border-top-width")),
    bottom: parseFloat(computedStyle.getPropertyValue("border-bottom-width")),
  };
  const padding = {
    left: parseFloat(computedStyle.getPropertyValue("padding-left")),
    right: parseFloat(computedStyle.getPropertyValue("padding-right")),
    top: parseFloat(computedStyle.getPropertyValue("padding-top")),
    bottom: parseFloat(computedStyle.getPropertyValue("padding-bottom")),
  };
  return {
    x: rect.left + border.left + padding.left,
    y: rect.top + border.top + padding.top,
    width:
      rect.width - border.left - border.right - padding.left - padding.right,
    height:
      rect.height - border.top - border.bottom - padding.top - padding.bottom,
  };
}
