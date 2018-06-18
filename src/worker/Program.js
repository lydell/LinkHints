// @flow

import {
  autoLog,
  bind,
  catchRejections,
  log,
  unreachable,
} from "../shared/main";
import type {
  FromBackground,
  FromWorker,
  ToBackground,
} from "../data/Messages";
import type {
  KeyboardMapping,
  KeyboardOptions,
} from "../data/KeyboardShortcuts";

import ElementManager from "./ElementManager";
import type { Box, ElementType, VisibleElement } from "./ElementManager";

// The single-page HTML specification has over 70K links! If trying to track all
// of those, Firefox warns that the extension is slowing the page down while
// loading. When fully loaded, scrolling is noticeably laggy. On my computer,
// the lag starts somewhere between 10K and 20K tracked links. Tracking at most
// 10K should be enough for regular sites.
const MAX_TRACKED_ELEMENTS = 10e3;

export default class WorkerProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  keyboardOptions: KeyboardOptions;
  elementManager: ElementManager;
  elements: ?Array<VisibleElement>;
  oneTimeWindowMessageToken: ?string;

  constructor() {
    this.keyboardShortcuts = [];
    this.keyboardOptions = {
      capture: false,
      suppressByDefault: false,
      sendAll: false,
    };
    this.elementManager = new ElementManager({
      maxTrackedElements: MAX_TRACKED_ELEMENTS,
    });
    this.elements = undefined;
    this.oneTimeWindowMessageToken = undefined;

    bind(this, [
      this.onMessage,
      this.onKeydownCapture,
      this.onKeydownBubble,
      this.onWindowMessage,
    ]);

    autoLog(this, [this.start, this.stop, this.sendMessage]);

    catchRejections(this, [
      this.sendMessage,
      this.onMessage,
      this.onKeydownCapture,
      this.onKeydownBubble,
      this.onWindowMessage,
      this.reportVisibleElements,
    ]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydownCapture, true);
    window.addEventListener("keydown", this.onKeydownBubble, false);
    window.addEventListener("message", this.onWindowMessage, true);
    this.elementManager.start();

    // See `RendererProgram` about this port stuff.
    const port = browser.runtime.connect();
    port.postMessage(
      ({
        type: "FromWorker",
        message: { type: "WorkerScriptAdded" },
      }: ToBackground)
    );
    port.onDisconnect.addListener(() => {
      this.stop();
    });
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    window.removeEventListener("keydown", this.onKeydownCapture, true);
    window.removeEventListener("keydown", this.onKeydownBubble, false);
    window.removeEventListener("message", this.onWindowMessage, true);
    this.elementManager.stop();
  }

  async sendMessage(message: FromWorker): Promise<void> {
    const wrappedMessage: ToBackground = {
      type: "FromWorker",
      message,
    };
    await browser.runtime.sendMessage((wrappedMessage: any));
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToWorker") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "WorkerProgram#onMessage", message.type, message);

    switch (message.type) {
      case "StateSync":
        log.level = message.logLevel;
        this.keyboardShortcuts = message.keyboardShortcuts;
        this.keyboardOptions = message.keyboardOptions;
        this.oneTimeWindowMessageToken = message.oneTimeWindowMessageToken;

        if (message.clearElements) {
          this.elements = undefined;
        }
        break;

      case "StartFindElements": {
        const viewport = {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        this.reportVisibleElements(new Set(message.types), [viewport]);
        break;
      }

      case "FocusElement": {
        const element =
          this.elements == null ? undefined : this.elements[message.index];
        if (element == null) {
          log("error", "FocusElement: Missing element", message, this.elements);
          return;
        }
        element.element.focus();
        break;
      }

      case "ClickElement": {
        const element =
          this.elements == null ? undefined : this.elements[message.index];
        if (element == null) {
          log("error", "ClickElement: Missing element", message, this.elements);
          return;
        }
        element.element.focus();
        element.element.click();
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
      let types = undefined;
      let viewports = undefined;
      const { types: rawTypes, viewports: rawViewports } = event.data;
      try {
        types = parseTypes(rawTypes);
        viewports = parseViewports(rawViewports);
      } catch (error) {
        log(
          "warn",
          "Ignoring bad window message",
          this.oneTimeWindowMessageToken,
          event,
          error
        );
        return;
      }
      log("log", "WorkerProgram#onWindowMessage", types, rawViewports);
      this.reportVisibleElements(types, viewports);
      this.oneTimeWindowMessageToken = undefined;
    }
  }

  onKeydownCapture(event: KeyboardEvent) {
    if (this.keyboardOptions.capture) {
      this.onKeydown(event);
    }
  }

  onKeydownBubble(event: KeyboardEvent) {
    if (!this.keyboardOptions.capture) {
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

    if (match != null || this.keyboardOptions.suppressByDefault) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (match != null) {
      this.sendMessage({
        type: "KeyboardShortcutMatched",
        action: match.action,
        timestamp: performance.now(),
      });
    } else if (this.keyboardOptions.sendAll) {
      this.sendMessage({
        type: "NonKeyboardShortcutMatched",
        shortcut: {
          key: event.key,
          code: event.code,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
      });
    }
  }

  reportVisibleElements(types: Set<ElementType>, viewports: Array<Box>) {
    const elements = this.elementManager.getVisibleElements(types, viewports);

    const frames = this.elementManager.getVisibleFrames();

    for (const frame of frames) {
      if (
        frame instanceof HTMLIFrameElement ||
        frame instanceof HTMLFrameElement
      ) {
        const message = {
          token: this.oneTimeWindowMessageToken,
          types,
          viewports: viewports.concat(getFrameViewport(frame)),
        };
        frame.contentWindow.postMessage(message, "*");
      }
    }

    this.sendMessage({
      type: "ReportVisibleElements",
      elements: elements.map(
        ({ element, data: { type }, measurements }, index) => ({
          type,
          index,
          url: element instanceof HTMLAnchorElement ? element.href : undefined,
          hintMeasurements: measurements,
        })
      ),
      pendingFrames: frames.length,
    });

    this.elements = elements;
  }
}

function parseTypes(rawTypes: any): Set<ElementType> {
  try {
    // `rawTypes instanceof Set` doesn’t work when the `Set` comes from a posted
    // message. Instead, use duck typing.
    const result = rawTypes.has("test");
    if (typeof result !== "boolean") {
      throw new Error(
        `Expected .has() to return a boolean, but got: ${typeof result}`
      );
    }
  } catch (error) {
    throw new Error(`Expected a Set, but got: ${typeof rawTypes}. ${error}`);
  }

  // Don’t bother checking the contents of the Set. It doesn’t matter if there’s
  // invalid stuff in there, because we only check if certain types exist in the
  // Set or not (`types.has(type)`).
  return rawTypes;
}

function parseViewports(rawViewports: mixed): Array<Box> {
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

function getNumber(arg: { [string]: mixed }, property: string): number {
  const value = arg[property];
  if (!(typeof value === "number" && Number.isFinite(value))) {
    throw new Error(`Invalid '${property}': ${String(value)}`);
  }
  return value;
}

function getFrameViewport(frame: HTMLIFrameElement | HTMLFrameElement): Box {
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
