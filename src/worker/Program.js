// @flow strict-local

import {
  type ElementReport,
  type ElementType,
  type ElementTypes,
  type VisibleElement,
} from "../shared/hints";
import {
  type KeyboardMapping,
  type KeyboardMode,
  keyboardEventToKeypress,
  normalizeKeypress,
} from "../shared/keyboard";
import {
  type Box,
  Resets,
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
} from "../shared/messages";
import { TimeTracker } from "../shared/perf";
import ElementManager, { getVisibleBox } from "./ElementManager";
import { type FrameMessage, decodeFrameMessage } from "./decoders";

type CurrentElements = {|
  elements: Array<VisibleElement>,
  frames: Array<HTMLIFrameElement | HTMLFrameElement>,
  viewports: Array<Box>,
  types: ElementTypes,
  indexes: Array<number>,
  words: Array<string>,
  updating: boolean,
|};

// The single-page HTML specification has over 70K links! If trying to track all
// of those with `IntersectionObserver`, scrolling is noticeably laggy. On my
// computer, the lag starts somewhere between 10K and 20K tracked links.
// Tracking at most 10K should be enough for regular sites.
const MAX_INTERSECTION_OBSERVED_ELEMENTS = 10e3;

const MODIFIER_KEYS: Set<string> = new Set([
  "Alt",
  "Control",
  "Hyper",
  "Meta",
  "Shift",
  "Super",
  "OS",
]);

// All `<input type="…"`> values that look like a button by default, and can be
// activated by pressing space and as such prevent _scrolling_ by pressing space
// when focused. Note: Blurring `<input type="file">` when pressing space does
// not result in a page scroll on Firefox (but all the others do).
const BUTTON_INPUT_TYPES: Set<string> = new Set([
  "button",
  "color",
  "file",
  "image",
  "reset",
  "submit",
]);

export default class WorkerProgram {
  keyboardShortcuts: Array<KeyboardMapping>;
  keyboardMode: KeyboardMode;
  ignoreKeyboardLayout: boolean;
  trackInteractions: boolean;
  mutationObserver: ?MutationObserver;
  elementManager: ElementManager;
  current: ?CurrentElements;
  oneTimeWindowMessageToken: ?string;
  suppressNextKeyup: ?{| key: string, code: string |};
  resets: Resets;

  constructor() {
    this.keyboardShortcuts = [];
    this.keyboardMode = "Normal";
    this.ignoreKeyboardLayout = true;
    this.trackInteractions = false;
    this.mutationObserver = undefined;
    this.elementManager = new ElementManager({
      maxIntersectionObservedElements: MAX_INTERSECTION_OBSERVED_ELEMENTS,
      onTrackedElementsMutation: this.onTrackedElementsMutation.bind(this),
    });
    this.current = undefined;
    this.oneTimeWindowMessageToken = undefined;
    this.suppressNextKeyup = undefined;
    this.resets = new Resets();

    bind(this, [
      [this.onBlur, { catch: true }],
      [this.onClick, { catch: true }],
      [this.onKeydown, { catch: true }],
      [this.onKeyup, { catch: true }],
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
      addEventListener(window, "blur", this.onBlur),
      addEventListener(window, "click", this.onClick),
      addEventListener(window, "keydown", this.onKeydown, { passive: false }),
      addEventListener(window, "keyup", this.onKeyup, { passive: false }),
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
    this.oneTimeWindowMessageToken = undefined;
    this.suppressNextKeyup = undefined;
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
        this.keyboardMode = message.keyboardMode;
        this.ignoreKeyboardLayout = message.ignoreKeyboardLayout;
        this.oneTimeWindowMessageToken = message.oneTimeWindowMessageToken;

        if (message.clearElements) {
          this.current = undefined;
        }
        break;

      case "StartFindElements": {
        const { oneTimeWindowMessageToken } = this;
        if (oneTimeWindowMessageToken == null) {
          log("error", "missing oneTimeWindowMessageToken", message);
          break;
        }
        const viewport = getViewport();
        this.reportVisibleElements(
          message.types,
          [viewport],
          oneTimeWindowMessageToken
        );
        break;
      }

      case "UpdateElements": {
        const { current, oneTimeWindowMessageToken } = this;
        if (current == null) {
          return;
        }

        current.viewports = [getViewport()];

        this.updateVisibleElements({
          current,
          oneTimeWindowMessageToken,
        });
        break;
      }

      case "GetTextRects": {
        const { current } = this;
        if (current == null) {
          return;
        }

        const { indexes, words } = message;
        current.indexes = indexes;
        current.words = words;

        const elements = current.elements.filter((_elementData, index) =>
          indexes.includes(index)
        );
        const wordsSet = new Set(words);
        const rects = [].concat(
          ...elements.map(elementData =>
            getTextRects(elementData.element, current.viewports, wordsSet)
          )
        );

        this.sendMessage({
          type: "ReportTextRects",
          rects,
        });

        break;
      }

      case "FocusElement": {
        const elementData = this.getElement(message.index);
        if (elementData == null) {
          log("error", "FocusElement: Missing element", message, this.current);
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
        const elementData = this.getElement(message.index);
        const { trackRemoval } = message;

        if (elementData == null) {
          log("error", "ClickElement: Missing element", message, this.current);
          return;
        }

        log("log", "WorkerProgram: ClickElement", elementData);

        const { element } = elementData;

        if (trackRemoval) {
          this.trackRemoval(element);
        }

        const defaultNotPrevented = clickElement(element);

        if (defaultNotPrevented && elementData.type === "link") {
          this.sendMessage({ type: "ClickedLinkNavigatingToOtherPage" });
        }

        break;
      }

      case "SelectElement": {
        const elementData = this.getElement(message.index);
        if (elementData == null) {
          log("error", "SelectElement: Missing element", message, this.current);
          return;
        }

        log("log", "WorkerProgram: SelectElement", elementData);

        const { trackRemoval } = message;
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

      case "ReverseSelection": {
        const selection: Selection | null = window.getSelection();
        if (selection != null) {
          reverseSelection(selection);
        }
        break;
      }

      case "ClickFocusedElement": {
        const { activeElement } = document;
        if (activeElement != null) {
          clickElement(activeElement);
        }
        break;
      }

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
      event.data.token === oneTimeWindowMessageToken &&
      typeof event.data.type === "string"
    ) {
      let message = undefined;
      try {
        message = decodeFrameMessage(event.data);
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
      log("log", "WorkerProgram#onWindowMessage", message);

      switch (message.type) {
        case "FindElements":
          this.sendMessage({ type: "ReportVisibleFrame" });
          this.reportVisibleElements(
            message.types,
            message.viewports,
            oneTimeWindowMessageToken
          );
          break;

        case "UpdateElements": {
          const { current } = this;
          if (current == null) {
            return;
          }

          current.viewports = message.viewports;
          this.updateVisibleElements({
            current,
            oneTimeWindowMessageToken,
          });
          break;
        }

        default:
          unreachable(message.type, message);
      }
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
    const prefix = "WorkerProgram#onKeydown";

    if (!event.isTrusted) {
      log("log", prefix, "ignoring untrusted event", event);
      return;
    }

    // The "keydown" event fires at an interval while it is pressed. We're only
    // interested in the event where the key was actually pressed down. Ignore
    // the rest. Don't log this since it results in a _lot_ of logs.
    if (event.repeat) {
      return;
    }

    const { activeElement } = document;

    // Scroll the page when pressing space while a button is focused, rather
    // than activating the button. The button can still be activated by pressing
    // Enter (or sometimes ctrl+space or similar).
    // TODO: Should this be part of Synth? If so, put it behind an option.
    if (
      this.keyboardMode === "Normal" &&
      event.key === " " &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      // `event.shiftKey` scrolls backwards.
      activeElement != null &&
      (activeElement instanceof HTMLButtonElement ||
        (activeElement instanceof HTMLInputElement &&
          BUTTON_INPUT_TYPES.has(activeElement.type)) ||
        activeElement.nodeName === "SUMMARY")
    ) {
      activeElement.blur();
    }

    const keypress = normalizeKeypress({
      keypress: keyboardEventToKeypress(event),
      ignoreKeyboardLayout: this.ignoreKeyboardLayout,
    });

    const match = this.keyboardShortcuts.find(mapping => {
      const mappingKeypress = normalizeKeypress({
        keypress: mapping.keypress,
        ignoreKeyboardLayout: this.ignoreKeyboardLayout,
      });
      return (
        keypress.key === mappingKeypress.key &&
        keypress.alt === mappingKeypress.alt &&
        keypress.cmd === mappingKeypress.cmd &&
        keypress.ctrl === mappingKeypress.ctrl &&
        (mappingKeypress.shift == null ||
          keypress.shift === mappingKeypress.shift)
      );
    });

    const suppress =
      match != null ||
      this.keyboardMode === "PreventOverTyping" ||
      // Allow ctrl and cmd _shortcuts_ in hints mode (but always suppress
      // pressing modifier keys _themselves_ in case the page does unwanted
      // things when holding down alt for example). ctrl and cmd can't safely be
      // combined with hint chars anyway, due to some keyboard shortcuts not
      // being suppressable (such as ctrl+n, ctrl+q, ctrl+t, ctrl+w) (and
      // ctrl+alt+t opens a terminal by default in Ubuntu).
      // This always uses `event.key` since we are looking for _actual_ modifier
      // key presses (keys may be rebound).
      (this.keyboardMode === "Hints" &&
        (MODIFIER_KEYS.has(event.key) || (!event.ctrlKey && !event.metaKey)));

    if (suppress) {
      suppressEvent(event);
      // `keypress` events are automatically suppressed when suppressing
      // `keydown`, but `keyup` needs to be manually suppressed. Note that if a
      // keyboard shortcut is alt+j it's possible to either release the alt key
      // first or the J key first, so we have to store _which_ key we want to
      // suppress the `keyup` event for.
      this.suppressNextKeyup = {
        key: event.key,
        code: event.code,
      };
      log("log", prefix, "suppressing event", {
        key: event.key,
        code: event.code,
        event,
        match,
        keyboardMode: this.keyboardMode,
        suppressNextKeyup: this.suppressNextKeyup,
      });
    }

    if (
      this.trackInteractions &&
      // If the key press is suppressed and doesn’t trigger anything, it’s not
      // really an interaction. This allows showing title attributes when
      // overtyping after filtering hints by text. Otherwise the extra key
      // presses would cause the title to immediately disappear.
      !(suppress && match == null)
    ) {
      this.sendMessage({ type: "Interaction" });
    }

    if (match != null) {
      this.sendMessage({
        type: "KeyboardShortcutMatched",
        action: match.action,
        timestamp: performance.now(),
      });
    } else if (this.keyboardMode === "Hints" && suppress) {
      this.sendMessage({
        type: "NonKeyboardShortcutKeypress",
        keypress: keyboardEventToKeypress(event),
        timestamp: performance.now(),
      });
    }
  }

  onKeyup(event: KeyboardEvent) {
    const prefix = "WorkerProgram#onKeyup";

    if (!event.isTrusted) {
      log("log", prefix, "ignoring untrusted event", event);
      return;
    }

    if (this.keyboardMode === "Hints") {
      this.sendMessage({
        type: "Keyup",
        keypress: keyboardEventToKeypress(event),
      });
    }

    if (this.suppressNextKeyup != null) {
      const { key, code } = this.suppressNextKeyup;
      if (event.key === key && event.code === code) {
        log("log", prefix, "suppressing event", {
          event,
          keyboardMode: this.keyboardMode,
          suppressNextKeyup: this.suppressNextKeyup,
        });
        suppressEvent(event);
        this.suppressNextKeyup = undefined;
      }
    }
  }

  onBlur(event: FocusEvent) {
    if (!event.isTrusted) {
      log("log", "WorkerProgram#onBlur", "ignoring untrusted event", event);
      return;
    }

    if (event.target === window) {
      this.sendMessage({ type: "WindowBlur" });
    }
  }

  onClick(event: MouseEvent) {
    if (!event.isTrusted) {
      log("log", "WorkerProgram#onClick", "ignoring untrusted event", event);
      return;
    }

    if (this.trackInteractions) {
      this.sendMessage({ type: "Interaction" });
    }
  }

  onTrackedElementsMutation() {
    const { current } = this;
    if (current == null) {
      return;
    }

    // In addition to the "UpdateElements" polling, update as soon as possible
    // when elements are removed/added/changed for better UX. For example, if a
    // modal closes it looks nicer if the hints for elements in the modal
    // disappear immediately rather than after a small delay.
    this.updateVisibleElements({
      current,
      // Skip updating child frames since we only know that things changed in
      // _this_ frame. Child frames will be updated during the next poll.
      oneTimeWindowMessageToken: undefined,
    });
  }

  onPagehide(event: Event) {
    if (!event.isTrusted) {
      log("log", "WorkerProgram#onPagehide", "ignoring untrusted event", event);
      return;
    }

    if (window.top === window) {
      this.sendMessage({ type: "PageLeave" });
    }
  }

  getElement(index: number): ?VisibleElement {
    return this.current == null ? undefined : this.current.elements[index];
  }

  async reportVisibleElements(
    types: ElementTypes,
    viewports: Array<Box>,
    oneTimeWindowMessageToken: string
  ): Promise<void> {
    // In ManyClick mode and when refreshing hints we enter hints mode anew
    // without exiting the “previous” hints mode. Make sure that any update
    // polling (or the update from `onTrackedElementsMutation`) don’t interfere
    // with this report.
    if (this.current != null) {
      this.current.updating = true;
    }

    const time = new TimeTracker();

    const elementsWithNulls: Array<?VisibleElement> = await this.elementManager.getVisibleElements(
      types,
      viewports,
      time
    );
    const elements = elementsWithNulls.filter(Boolean);

    time.start("frames");
    const frames = this.elementManager.getVisibleFrames(viewports);
    for (const frame of frames) {
      const message: FrameMessage = {
        type: "FindElements",
        token: oneTimeWindowMessageToken,
        types,
        viewports: viewports.concat(getFrameViewport(frame)),
      };
      frame.contentWindow.postMessage(message, "*");
    }

    time.start("report");
    this.sendMessage({
      type: "ReportVisibleElements",
      elements: elements.map(visibleElementToElementReport),
      numFrames: frames.length,
      durations: time.export(),
    });

    this.current = {
      elements,
      frames,
      viewports,
      types,
      indexes: [],
      words: [],
      updating: false,
    };
  }

  async updateVisibleElements({
    current,
    oneTimeWindowMessageToken,
  }: {|
    current: CurrentElements,
    oneTimeWindowMessageToken: ?string,
  |}): Promise<void> {
    if (current.updating) {
      return;
    }

    current.updating = true;

    const elements: Array<?VisibleElement> = await this.elementManager.getVisibleElements(
      current.types,
      current.viewports,
      new TimeTracker(),
      current.elements.map(({ element }) => element)
    );

    const { words } = current;

    if (oneTimeWindowMessageToken != null) {
      for (const frame of current.frames) {
        // Removing an iframe from the DOM nukes its page (this will be detected
        // by the port disconnecting). Re-inserting it causes the page to be
        // loaded anew.
        if (frame.contentWindow != null) {
          const message: FrameMessage = {
            type: "UpdateElements",
            token: oneTimeWindowMessageToken,
            viewports: current.viewports.concat(getFrameViewport(frame)),
          };
          frame.contentWindow.postMessage(message, "*");
        }
      }
    }

    const wordsSet = new Set(words);
    const rects =
      words.length === 0
        ? []
        : [].concat(
            ...elements
              .filter((_elementData, index) => current.indexes.includes(index))
              .filter(Boolean)
              .map(({ element }) =>
                getTextRects(element, current.viewports, wordsSet)
              )
          );

    current.updating = false;

    this.sendMessage({
      type: "ReportUpdatedElements",
      elements: elements
        // Doing `.filter(Boolean)` _after_ the `.map()` makes sure that the
        // indexes stay the same.
        .map((elementData, index) => {
          return elementData == null
            ? undefined
            : visibleElementToElementReport(elementData, index);
        })
        .filter(Boolean),
      rects,
    });
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

function reverseSelection(selection: Selection) {
  const direction = getSelectionDirection(selection);

  if (direction == null) {
    return;
  }

  const range = selection.getRangeAt(0);
  const [edgeNode, edgeOffset] = direction
    ? [range.startContainer, range.startOffset]
    : [range.endContainer, range.endOffset];

  range.collapse(!direction);
  selection.removeAllRanges();
  selection.addRange(range);
  selection.extend(edgeNode, edgeOffset);
}

// true → forward, false → backward, undefined → unknown
function getSelectionDirection(selection: Selection): ?boolean {
  if (selection.isCollapsed) {
    return undefined;
  }

  const { anchorNode, focusNode } = selection;

  if (anchorNode == null || focusNode == null) {
    return undefined;
  }

  const range = document.createRange();
  range.setStart(anchorNode, selection.anchorOffset);
  range.setEnd(focusNode, selection.focusOffset);
  return !range.collapsed;
}

function getTextWeight(text: string, weight: number): number {
  // The weight used for hints after filtering by text is the number of
  // non-whitespace characters, plus a tiny bit of the regular hint weight in
  // case of ties.
  return Math.max(1, text.replace(/\s/g, "").length + Math.log10(weight));
}

function getTextRects(
  element: HTMLElement,
  viewports: Array<Box>,
  words: Set<string>
): Array<Box> {
  const text = element.textContent.toLowerCase();

  const ranges = [];

  for (const word of words) {
    let index = -1;
    while ((index = text.indexOf(word, index + 1)) >= 0) {
      ranges.push({
        start: index,
        end: index + word.length,
        range: document.createRange(),
      });
    }
  }

  if (ranges.length === 0) {
    return [];
  }

  let index = 0;

  for (const node of walkTextNodes(element)) {
    const nextIndex = index + node.length;

    for (const { start, end, range } of ranges) {
      if (start >= index && start < nextIndex) {
        range.setStart(node, start - index);
      }
      if (end >= index && end <= nextIndex) {
        range.setEnd(node, end - index);
      }
    }

    index = nextIndex;
  }

  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

  return [].concat(
    ...ranges.map(({ range }) => {
      const rects = range.getClientRects();
      return Array.from(rects, rect => {
        const box = getVisibleBox(rect, viewports);
        if (box == null) {
          return undefined;
        }
        const elementAtPoint = document.elementFromPoint(
          Math.round(box.x + box.width / 2 - offsetX),
          Math.round(box.y + box.height / 2 - offsetY)
        );
        return elementAtPoint != null && element.contains(elementAtPoint)
          ? box
          : undefined;
      }).filter(Boolean);
    })
  );
}

function* walkTextNodes(element: HTMLElement): Generator<Text, void, void> {
  for (const node of element.childNodes) {
    if (node instanceof Text) {
      yield node;
    } else if (node instanceof HTMLElement) {
      yield* walkTextNodes(node);
    }
  }
}

function suppressEvent(event: Event) {
  event.preventDefault();
  // `event.stopPropagation()` prevents the event from propagating further
  // up and down the DOM tree. `event.stopImmediatePropagation()` also
  // prevents additional listeners on the same node (`window` in this case)
  // from being called.
  event.stopImmediatePropagation();
}

function visibleElementToElementReport(
  { element, type, measurements, hasClickListener }: VisibleElement,
  index: number
): ElementReport {
  const text = extractText(element, type);
  const title = getTitle(element);
  return {
    type,
    index,
    url:
      type === "link" && element instanceof HTMLAnchorElement
        ? element.href
        : undefined,
    // Links to files and notifications on GitHub often have the the title
    // attribute set to the element text. That does not provide any new
    // information and is only annoying. So ignore the title if it is the same
    // as the element text – and the element is clickable for some other reason
    // than for having a title. Gmail attachments have equal title and element
    // text, but having a title is the only thing marking them as clickable.
    title: text.trim() === title && type !== "title" ? undefined : title,
    text,
    textWeight: getTextWeight(text, measurements.weight),
    isTextInput: isTextInput(element),
    hasClickListener,
    hintMeasurements: measurements,
  };
}

function extractText(element: HTMLElement, type: ElementType): string {
  // Scrollable elements do have `.textContent`, but it’s not intuitive to filter
  // them by text (especially since the matching text might be scrolled away).
  // Treat them more like frames (where you can’t look inside). `<textarea>`
  // elements have `.textContent` they have default text in the HTML, but that
  // is not updated as the user types. To be consistent with `<input>` text
  // inputs, ignore their text as well.
  return type === "scrollable" || type === "textarea"
    ? ""
    : element.textContent;
}

function clickElement(element: HTMLElement): boolean {
  if (element instanceof HTMLMediaElement) {
    element.focus();
    if (element.paused) {
      element.play();
    } else {
      element.pause();
    }
    return false;
  }

  // Programmatically clicking on an `<a href="..." target="_blank">` causes the
  // popup blocker to block the new tab/window from opening. That's really
  // annoying, so temporarily remove the `target`. The user can use the commands
  // for opening links in new tabs instead if they want a new tab.
  let target = undefined;
  if (
    element instanceof HTMLAnchorElement &&
    element.target.toLowerCase() === "_blank"
  ) {
    ({ target } = element);
    element.target = "";
  }

  const rect = element.getBoundingClientRect();
  const options = {
    // Mimic real events as closely as possible.
    bubbles: true,
    cancelable: true,
    composed: true,
    detail: 1,
    view: window,
    // These seem to automatically set `x`, `y`, `pageX` and `pageY` as well.
    // There’s also `screenX` and `screenY`, but we can’t know those.
    clientX: Math.round(rect.left),
    clientY: Math.round(rect.top + rect.height / 2),
  };

  // When clicking a link for real the focus happens between the mousedown and
  // the mouseup, but moving this line between those two `.dispatchEvent` calls
  // below causes dropdowns in gmail not to be triggered anymore.
  element.focus();

  // Just calling `.click()` isn’t enough to open dropdowns in gmail. That
  // requires the full mousedown+mouseup+click event sequence.
  element.dispatchEvent(
    new MouseEvent("mousedown", { ...options, buttons: 1 })
  );
  element.dispatchEvent(new MouseEvent("mouseup", options));
  const defaultNotPrevented = element.dispatchEvent(
    new MouseEvent("click", options)
  );

  if (element instanceof HTMLAnchorElement && target != null) {
    element.target = target;
  }

  return defaultNotPrevented;
}
