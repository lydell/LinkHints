// @flow

import {
  Resets,
  TimeTracker,
  addEventListener,
  addListener,
  bind,
  getTitle,
  getViewport,
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
import type { Box, ElementTypes, VisibleElement } from "./ElementManager";

type FrameMessage = {|
  token: string,
  types: ElementTypes,
  viewports: Array<Box>,
|};

// The single-page HTML specification has over 70K links! If trying to track all
// of those with `IntersectionObserver`, scrolling is noticeably laggy. On my
// computer, the lag starts somewhere between 10K and 20K tracked links.
// Tracking at most 10K should be enough for regular sites.
const MAX_INTERSECTION_OBSERVED_ELEMENTS = 10e3;

export default class WorkerProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  keyboardOptions: KeyboardOptions;
  trackInteractions: boolean;
  mutationObserver: ?MutationObserver;
  elementManager: ElementManager;
  elements: ?Array<VisibleElement>;
  oneTimeWindowMessageToken: ?string;
  resets: Resets;

  constructor() {
    this.keyboardShortcuts = [];
    this.keyboardOptions = {
      suppressByDefault: false,
      sendAll: false,
    };
    this.trackInteractions = false;
    this.mutationObserver = undefined;
    this.elementManager = new ElementManager({
      maxIntersectionObservedElements: MAX_INTERSECTION_OBSERVED_ELEMENTS,
    });
    this.elements = undefined;
    this.oneTimeWindowMessageToken = undefined;
    this.resets = new Resets();

    bind(this, [
      [this.onClick, { catch: true }],
      [this.onKeydown, { catch: true }],
      [this.onMessage, { catch: true }],
      [this.onWindowMessage, { catch: true }],
      [this.onPagehide, { catch: true }],
      [this.reportVisibleElements, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  async start(): Promise<void> {
    this.resets.add(
      addListener(browser.runtime.onMessage, this.onMessage),
      addEventListener(window, "click", this.onClick),
      addEventListener(window, "keydown", this.onKeydown, { passive: false }),
      addEventListener(window, "message", this.onWindowMessage),
      addEventListener(window, "pagehide", this.onPagehide)
    );
    this.elementManager.start();

    // See `RendererProgram#start`.
    try {
      await browser.runtime.sendMessage(
        wrapMessage({ type: "WorkerScriptAdded" })
      );
    } catch (_error) {
      return;
    }
    browser.runtime.connect().onDisconnect.addListener(() => {
      this.stop();
    });
  }

  stop() {
    this.resets.reset();
    this.elementManager.stop();
  }

  async sendMessage(message: FromWorker): Promise<void> {
    log("log", "WorkerProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
  }

  onMessage(wrappedMessage: FromBackground) {
    // See `RendererProgram#onMessage`.
    if (wrappedMessage.type === "FirefoxWorkaround") {
      this.sendMessage({ type: "WorkerScriptAdded" });
      return;
    }

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
        const { scrollingElement } = document;
        const { oneTimeWindowMessageToken } = this;
        if (scrollingElement == null || oneTimeWindowMessageToken == null) {
          break;
        }
        const viewport = {
          x: 0,
          y: 0,
          ...getViewport(),
        };
        this.reportVisibleElements(
          message.types,
          [viewport],
          oneTimeWindowMessageToken
        );
        break;
      }

      case "FocusElement": {
        const elementData =
          this.elements == null ? undefined : this.elements[message.index];
        if (elementData == null) {
          log("error", "FocusElement: Missing element", message, this.elements);
          return;
        }
        const { element } = elementData;
        const { activeElement } = document;
        const textInputIsFocused =
          activeElement != null && isTextInput(activeElement);
        // Allow opening links in new tabs without losing focus from a text
        // input.
        if (!textInputIsFocused) {
          element.focus();
        }
        break;
      }

      case "ClickElement": {
        const elementData =
          this.elements == null ? undefined : this.elements[message.index];
        const { trackRemoval } = message;

        if (elementData == null) {
          log("error", "ClickElement: Missing element", message, this.elements);
          return;
        }

        log("log", "WorkerProgram: ClickElement", elementData);

        const { element } = elementData;

        if (trackRemoval) {
          this.trackRemoval(element);
        }

        // Programmatically clicking on an `<a href="..." target="_blank">`
        // causes the popup blocker to block the new tab/window from opening.
        // That's really annoying, so temporarily remove the `target`. The user
        // can use the commands for opening links in new tabs instead if they
        // want a new tab.
        let target = undefined;
        if (
          element instanceof HTMLAnchorElement &&
          element.target.toLowerCase() === "_blank"
        ) {
          ({ target } = element);
          element.target = "";
        }

        if (element instanceof HTMLMediaElement) {
          element.focus();
          if (element.paused) {
            element.play();
          } else {
            element.pause();
          }
          return;
        }

        const rect = element.getBoundingClientRect();
        const options = {
          // Mimic real events as closely as possible.
          bubbles: true,
          cancelable: true,
          composed: true,
          detail: 1,
          view: window,
          // These seem to automatically set `x`, `y`, `pageX` and `pageY` as
          // well. There’s also `screenX` and `screenY`, but we can’t know
          // those.
          clientX: Math.round(rect.left),
          clientY: Math.round(rect.top + rect.height / 2),
        };

        // When clicking a link for real the focus happens between the mousedown
        // and the mouseup, but moving this line between those two
        // `.dispatchEvent` calls below causes dropdowns in gmail not to be
        // triggered anymore.
        element.focus();

        // Just calling `.click()` isn’t enough to open dropdowns in gmail. That
        // requires the full mousedown+mouseup+click event sequence.
        element.dispatchEvent(
          new MouseEvent("mousedown", { ...options, buttons: 1 })
        );
        element.dispatchEvent(new MouseEvent("mouseup", options));
        element.dispatchEvent(new MouseEvent("click", options));

        if (element instanceof HTMLAnchorElement && target != null) {
          element.target = target;
        }

        break;
      }

      case "SelectElement": {
        const elementData =
          this.elements == null ? undefined : this.elements[message.index];
        const { trackRemoval } = message;

        if (elementData == null) {
          log(
            "error",
            "SelectElement: Missing element",
            message,
            this.elements
          );
          return;
        }

        log("log", "WorkerProgram: SelectElement", elementData);

        const { element } = elementData;

        if (trackRemoval) {
          this.trackRemoval(element);
        }

        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          // Focus and, if possible, select the text inside. There are two cases
          // here: "Text input" (`<textarea>`, `<input type="text">`, `<input
          // type="search">`, `<input type="unknown">`, etc) style elements
          // technically only need `.select()`, but it doesn't hurt calling
          // `.focus()` first. For all other types (`<input type="checkbox">`,
          // `<input type="color">`, etc) `.select()` seems to be a no-op, so
          // `.focus()` is strictly needed but calling `.select()` also doesn't
          // hurt.
          element.focus();
          element.select();
        } else if (
          // Text inside `<button>` elements can be selected and copied just
          // fine in Chrome, but not in Firefox. In Firefox,
          // `document.elementFromPoint(x, y)` returns the `<button>` for
          // elements nested inside, causing them not to get hints either.
          (BROWSER === "firefox" && element instanceof HTMLButtonElement) ||
          // `<select>` elements _can_ be selected, but you seem to get the
          // empty string when trying to copy them.
          element instanceof HTMLSelectElement ||
          // Frame elements can be selected in Chrome, but that just looks
          // weird. The reason to focus a frame element is to allow the arrow
          // keys to scroll them.
          element instanceof HTMLIFrameElement ||
          element instanceof HTMLFrameElement
        ) {
          element.focus();
        } else {
          // Focus the element, even if it isn't usually focusable.
          focusElement(element);

          // Try to select the text of the element, or the element itself.
          const selection: Selection | null = window.getSelection();
          if (selection != null) {
            const range = document.createRange();
            if (element.childNodes.length === 0) {
              range.selectNode(element);
            } else {
              range.selectNodeContents(element);
            }
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }

        break;
      }

      // Used instead of `browser.tabs.create` in Chrome, to have the opened tab
      // end up in the same position as if you'd clicked a link with the mouse.
      // This technique does not seem to work in Firefox, but it's not needed
      // there anyway (see background/Program.js).
      case "OpenNewTab": {
        const { url, foreground } = message;
        const link = document.createElement("a");
        link.href = url;
        link.dispatchEvent(
          new MouseEvent("click", {
            ctrlKey: true,
            metaKey: true,
            shiftKey: foreground,
          })
        );
        break;
      }

      case "Escape": {
        if (document.activeElement != null) {
          document.activeElement.blur();
        }
        const selection: Selection | null = window.getSelection();
        if (selection != null) {
          selection.removeAllRanges();
        }
        break;
      }

      case "TrackInteractions":
        this.trackInteractions = message.track;
        if (!this.trackInteractions && this.mutationObserver != null) {
          this.mutationObserver.disconnect();
          this.mutationObserver = undefined;
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onWindowMessage(event: MessageEvent) {
    const { oneTimeWindowMessageToken } = this;
    if (
      oneTimeWindowMessageToken != null &&
      event.data != null &&
      typeof event.data === "object" &&
      !Array.isArray(event.data) &&
      event.data.token === oneTimeWindowMessageToken
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
          oneTimeWindowMessageToken,
          event,
          error
        );
        return;
      }
      this.oneTimeWindowMessageToken = undefined;
      log("log", "WorkerProgram#onWindowMessage", types, rawViewports);
      this.sendMessage({ type: "ReportVisibleFrame" });
      this.reportVisibleElements(types, viewports, oneTimeWindowMessageToken);
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
    if (!event.isTrusted) {
      return;
    }

    if (this.trackInteractions) {
      this.sendMessage({ type: "Interaction" });
    }

    const match = this.keyboardShortcuts.find(
      ({ shortcut }) =>
        event.key === shortcut.key &&
        // Disabled `.code` for now, waiting for an "Ignore keyboard layout" option.
        // event.code === shortcut.code &&
        event.altKey === shortcut.altKey &&
        event.ctrlKey === shortcut.ctrlKey &&
        event.metaKey === shortcut.metaKey &&
        event.shiftKey === shortcut.shiftKey
    );

    if (match != null || this.keyboardOptions.suppressByDefault) {
      event.preventDefault();
      // `event.stopPropagation()` prevents the event from propagating further
      // up and down the DOM tree. `event.stopImmediatePropagation()` also
      // prevents additional listeners on the same node (`window` in this case)
      // from being called.
      event.stopImmediatePropagation();
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
        timestamp: performance.now(),
      });
    }
  }

  onClick(event: MouseEvent) {
    if (event.isTrusted && this.trackInteractions) {
      this.sendMessage({ type: "Interaction" });
    }
  }

  onPagehide() {
    if (window.top === window) {
      this.sendMessage({ type: "PageLeave" });
    }
  }

  async reportVisibleElements(
    types: ElementTypes,
    viewports: Array<Box>,
    oneTimeWindowMessageToken: string
  ): Promise<void> {
    const time = new TimeTracker();

    const elements = await this.elementManager.getVisibleElements(
      types,
      viewports,
      time
    );

    time.start("frames");
    const frames = this.elementManager.getVisibleFrames(viewports);
    for (const frame of frames) {
      const message: FrameMessage = {
        token: oneTimeWindowMessageToken,
        types,
        viewports: viewports.concat(getFrameViewport(frame)),
      };
      frame.contentWindow.postMessage(message, "*");
    }

    time.start("report");
    this.sendMessage({
      type: "ReportVisibleElements",
      elements: elements.map(
        ({ element, data: { type }, measurements }, index) => ({
          type,
          index,
          url:
            type === "link" && element instanceof HTMLAnchorElement
              ? element.href
              : undefined,
          title: getTitle(element),
          hintMeasurements: measurements,
        })
      ),
      numFrames: frames.length,
      durations: time.export(),
    });

    this.elements = elements;
  }

  // Track if the element (or any of its parents) is removed. This is used to
  // hide the title popup if its element is removed. If the element is in a
  // frame, it could also be removed by removing one of its parent frames, but I
  // don’t think it’s worth trying to detect that.
  trackRemoval(element: HTMLElement) {
    const { documentElement } = document;

    if (documentElement == null) {
      return;
    }

    if (this.mutationObserver != null) {
      this.mutationObserver.disconnect();
    }

    const mutationObserver = new MutationObserver(records => {
      const nodesWereRemoved = records.some(
        record => record.removedNodes.length > 0
      );
      if (nodesWereRemoved && !documentElement.contains(element)) {
        mutationObserver.disconnect();
        this.sendMessage({ type: "ClickedElementRemoved" });
      }
    });

    mutationObserver.observe(documentElement, {
      childList: true,
      subtree: true,
    });

    this.mutationObserver = mutationObserver;
  }
}

function wrapMessage(message: FromWorker): ToBackground {
  return {
    type: "FromWorker",
    message,
  };
}

function parseTypes(rawTypes: any): ElementTypes {
  // Don’t bother checking the contents of the array. It doesn’t matter if
  // there’s invalid stuff in there, because we only check if certain types
  // exist in the array or not (`types.includes(type)`).
  if (Array.isArray(rawTypes) || rawTypes === "selectable") {
    return rawTypes;
  }

  throw new Error(`Expected an Array, but got: ${typeof rawTypes}`);
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

// Focus any element. Temporarily alter tabindex if needed, and properly
// restore it again when blurring.
function focusElement(element: HTMLElement) {
  if (element === document.activeElement) {
    return;
  }

  const focusable = isFocusable(element);
  const tabIndexAttr = element.getAttribute("tabindex");

  if (!focusable) {
    element.setAttribute("tabindex", "-1");
  }

  element.focus();

  const { documentElement } = document;

  if (!focusable && documentElement != null) {
    const onBlur = () => {
      if (tabIndexAttr == null) {
        element.removeAttribute("tabindex");
      } else {
        element.setAttribute("tabindex", tabIndexAttr);
      }
      stop();
    };

    const options = { capture: true, passive: true };
    element.addEventListener("blur", onBlur, options);

    const mutationObserver = new MutationObserver(records => {
      const removed = !documentElement.contains(element);
      const tabindexChanged = records.some(
        record => record.type === "attributes"
      );
      if (removed || tabindexChanged) {
        stop();
      }
    });

    const stop = () => {
      element.removeEventListener("blur", onBlur, options);
      mutationObserver.disconnect();
    };

    mutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ["tabindex"],
    });
    mutationObserver.observe(documentElement, {
      childList: true,
      subtree: true,
    });
  }
}

// https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#rules-for-parsing-integers
const TABINDEX = /^\s*([+-]\d+)\s*$/;

// Returns whether `element.focus()` will do anything or not.
function isFocusable(element: HTMLElement): boolean {
  const propValue = element.tabIndex;

  // `<a>`, `<button>`, etc. are natively focusable (`.tabIndex === 0`).
  // `.tabIndex` can also be set if the HTML contains a valid `tabindex`
  // attribute.
  // `-1` means either that the element isn't focusable, or that
  // `tabindex="-1"` was set, so we have to use `.getAttribute` to
  // disambiguate.
  if (propValue !== -1) {
    return true;
  }

  // Contenteditable elements are always focusable.
  if (element.isContentEditable) {
    return true;
  }

  const attrValue = element.getAttribute("tabindex");

  if (attrValue == null) {
    return false;
  }

  // In Firefox, elements are focusable if they have the tabindex attribute,
  // regardless of whether it is valid or not.
  if (BROWSER === "firefox") {
    return true;
  }

  return TABINDEX.test(attrValue);
}

function isTextInput(element: HTMLElement): boolean {
  return (
    element.isContentEditable ||
    element instanceof HTMLTextAreaElement ||
    // `.selectionStart` is set to a number for all `<input>` types that you can
    // type regular text into (`<input type="text">`, `<input type="search">`,
    // `<input type="unknown">`, etc), but not for `<input type="email">` and
    // `<input type="number">` for some reason.
    (element instanceof HTMLInputElement &&
      (element.selectionStart != null ||
        element.type === "email" ||
        element.type === "number"))
  );
}
