// @flow

import { bind, log, unreachable } from "../shared/main";
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
      suppressByDefault: false,
      sendAll: false,
    };
    this.elementManager = new ElementManager({
      maxTrackedElements: MAX_TRACKED_ELEMENTS,
    });
    this.elements = undefined;
    this.oneTimeWindowMessageToken = undefined;

    bind(this, [
      [this.onKeydown, { catch: true }],
      [this.onMessage, { catch: true }],
      [this.onWindowMessage, { catch: true }],
      [this.reportVisibleElements, { catch: true }],
      [this.sendMessage, { log: true, catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    browser.runtime.onMessage.addListener(this.onMessage);
    window.addEventListener("keydown", this.onKeydown, true);
    window.addEventListener("message", this.onWindowMessage, true);
    this.elementManager.start();

    // See `RendererProgram` about this port stuff.
    const port = browser.runtime.connect();
    port.postMessage(wrapMessage({ type: "WorkerScriptAdded" }));
    port.onDisconnect.addListener(() => {
      this.stop();
    });
  }

  stop() {
    browser.runtime.onMessage.removeListener(this.onMessage);
    window.removeEventListener("keydown", this.onKeydown, true);
    window.removeEventListener("message", this.onWindowMessage, true);
    this.elementManager.stop();
  }

  async sendMessage(message: FromWorker): Promise<void> {
    await browser.runtime.sendMessage(wrapMessage(message));
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

        // Running `.click()` on an `<a href="..." target="_blank">` causes the
        // popup blocker to block the new tab/window from opening. That's really
        // annoying, so temporarily remove the `target`. The user can use the
        // commands for opening links in new tabs instead if they want a new
        // tab.
        let target = undefined;
        if (
          element.element instanceof HTMLAnchorElement &&
          element.element.target.toLowerCase() === "_blank"
        ) {
          ({ target } = element.element);
          element.element.target = "";
        }

        element.element.focus();
        element.element.click();

        if (element.element instanceof HTMLAnchorElement && target != null) {
          element.element.target = target;
        }

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

  // This is run in the capture phase of the keydown event, overriding any site
  // shortcuts. The initial idea was to run in the bubble phase (mostly) and let
  // sites use `event.preventDefault()` to override Synth's shortcuts (just like
  // any other browser shortcut). However, duckduckgo.com has "j/k" shortcuts
  // for navigation, but don't check for the alt key and don't call
  // `event.preventDefault()`, making it impossible to use alt-j as a Synth
  // shortcut without causing side-effects. This feels like a common thing, so
  // (at least for now) the Synth shortcuts always do their thing (making it
  // impossible to trigger a site shortcut using the same keys).
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

function wrapMessage(message: FromWorker): ToBackground {
  return {
    type: "FromWorker",
    message,
  };
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
