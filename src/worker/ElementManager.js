// @flow strict-local

import type {
  ElementType,
  ElementTypes,
  HintMeasurements,
  Point,
  VisibleElement,
} from "../shared/hints";
import {
  type Box,
  CONTAINER_ID,
  Resets,
  addEventListener,
  bind,
  log,
  partition,
  setStyles,
  unreachable,
  walkTextNodes,
} from "../shared/main";
import type { TimeTracker } from "../shared/perf";
import injected, {
  CLICKABLE_EVENT,
  CLICKABLE_EVENT_NAMES,
  CLICKABLE_EVENT_PROPS,
  EVENT_ATTRIBUTE,
  INJECTED_VAR,
  INJECTED_VAR_PATTERN,
  MESSAGE_FLUSH,
  MESSAGE_RESET,
  QUEUE_EVENT,
  SECRET,
  UNCLICKABLE_EVENT,
} from "./injected";

// Keep the above imports and this object in sync. See injected.js.
const constants = {
  CLICKABLE_EVENT: JSON.stringify(CLICKABLE_EVENT),
  CLICKABLE_EVENT_NAMES: JSON.stringify(CLICKABLE_EVENT_NAMES),
  CLICKABLE_EVENT_PROPS: JSON.stringify(CLICKABLE_EVENT_PROPS),
  EVENT_ATTRIBUTE: JSON.stringify(EVENT_ATTRIBUTE),
  INJECTED_VAR: JSON.stringify(INJECTED_VAR),
  INJECTED_VAR_PATTERN: INJECTED_VAR_PATTERN.toString(),
  MESSAGE_FLUSH: JSON.stringify(MESSAGE_FLUSH),
  MESSAGE_RESET: JSON.stringify(MESSAGE_RESET),
  QUEUE_EVENT: JSON.stringify(QUEUE_EVENT),
  SECRET: JSON.stringify(SECRET),
  UNCLICKABLE_EVENT: JSON.stringify(UNCLICKABLE_EVENT),
};

const LOW_QUALITY_TYPES: Set<ElementType> = new Set(["clickable-event"]);

// Give worse hints to scrollable elements and (selectable) frames. They are
// usually very large by nature, but not that commonly used.
const WORSE_HINT_TYPES = new Set(["scrollable", "selectable"]);

type QueueItem = {|
  mutationType: MutationType,
  element: HTMLElement,
|};

type MutationType = "added" | "removed" | "changed";

// Elements this many pixels high or taller always get their hint placed at the
// very left edge.
const BOX_MIN_HEIGHT = 110; // px

// Avoid placing hints too far to the right side. The first non-empty text node
// of an element does not necessarily have to come first, due to CSS. For
// example, it is not uncommon to see menu items with a label to the left and a
// number to the right. That number is usually positioned using `float: right;`
// and due to how floats work it then needs to come _before_ the label in DOM
// order. This avoids targeting such text.
const MAX_HINT_X_PERCENTAGE_OF_WIDTH = 0.75;

// Maximum area for elements with only click listeners. Elements larger than
// this are most likely not clickable, and only used for event delegation.
const MAX_CLICKABLE_EVENT_AREA = 1e6; // px

const NON_WHITESPACE = /\S/;
const LAST_NON_WHITESPACE = /\S\s*$/;

const LINK_PROTOCOLS = new Set(
  [
    "http:",
    "https:",
    "ftp:",
    // Firefox does not allow opening `file://` URLs in new tabs, but Chrome
    // does. Both allow _clicking_ them.
    // See: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/create>
    BROWSER === "chrome" ? "file:" : undefined,
  ].filter(Boolean)
);

// http://w3c.github.io/aria/#widget_roles
const CLICKABLE_ROLES = new Set([
  "button",
  "checkbox",
  "gridcell",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
  // Omitted since they don’t seem useful to click:
  // "progressbar",
  // "scrollbar",
  // "separator",
  // "slider",
  // "tabpanel",
]);

// "true" indicates that contenteditable on. Chrome also supports
// "plaintext-only". There may be more modes in the future, such as "caret", so
// it’s better to only list the values that indicate that an element _isn’t_
// contenteditable.
const NON_CONTENTEDITABLE_VALUES = new Set([
  // The default value. If a parent is contenteditable, it means that this
  // element is as well (and `element.isContentEditable` is true). But we only
  // want hints for the “root” contenteditable element.
  "inherit",
  // Explicitly turned off:
  "false",
  // The value for SVG elements:
  undefined,
]);

const SCROLLABLE_OVERFLOW_VALUES = new Set(["auto", "scroll"]);

const FRAME_MIN_SIZE = 6; // px
const TEXT_RECT_MIN_SIZE = 2; // px
const ICON_MIN_SIZE = 10; // px

const CLICKABLE_ATTRIBUTES = [
  // These are supposed to be used with a `role` attribute. In some GitHub
  // dropdowns some items only have this attribute hinting that they are
  // clickable, though.
  "aria-checked",
  "aria-selected",
  // Ember.
  "data-ember-action",
  // Bootstrap.
  "data-dismiss",
  // Twitter.
  "data-permalink-path",
  "data-image-url",
  // Gmail.
  "jsaction",
];

const MUTATION_ATTRIBUTES = [
  "contenteditable",
  "href",
  "role",
  ...CLICKABLE_EVENT_PROPS,
  ...CLICKABLE_ATTRIBUTES,
];

// Find actual images as well as icon font images. Matches for example “Icon”,
// “glyphicon”, “fa” and “fa-thumbs-up” but not “face or “alfa”.
const IMAGE_SELECTOR =
  "img, svg, [class*='icon' i], [class~='fa'], [class^='fa-'], [class*=' fa-']";

// If the `<html>` element has for example `transform: translate(-10px, -10px);`
// it can cause the probe to be off-screen, but both Firefox and Chrome seem to
// trigger the IntersectionObserver anyway so we can safely position the probe
// at (0, 0).
const PROBE_STYLES = {
  all: "unset",
  position: "fixed",
  top: "0",
  left: "0",
  width: "1px",
  height: "1px",
};

const infiniteDeadline = {
  timeRemaining: () => Infinity,
};

export default class ElementManager {
  maxIntersectionObservedElements: number;
  onTrackedElementsMutation: () => void;
  queue: Array<QueueItem>;
  injectedHasQueue: boolean;
  elements: Map<HTMLElement, ElementType>;
  visibleElements: Set<HTMLElement>;
  visibleFrames: Set<HTMLIFrameElement | HTMLFrameElement>;
  elementsWithClickListeners: WeakSet<HTMLElement>;
  elementsWithScrollbars: WeakSet<HTMLElement>;
  intersectionObserver: IntersectionObserver;
  frameIntersectionObserver: IntersectionObserver;
  mutationObserver: MutationObserver;
  idleCallbackId: ?IdleCallbackID;
  bailed: boolean;
  resets: Resets;
  probe: HTMLElement;
  observerProbeCallback: ?() => void;
  flushObserversPromise: ?Promise<void>;

  constructor({
    maxIntersectionObservedElements,
    onTrackedElementsMutation,
  }: {|
    maxIntersectionObservedElements: number,
    onTrackedElementsMutation: () => void,
  |}) {
    this.maxIntersectionObservedElements = maxIntersectionObservedElements;
    this.onTrackedElementsMutation = onTrackedElementsMutation;

    this.queue = [];
    this.injectedHasQueue = false;
    this.elements = new Map();
    this.visibleElements = new Set();
    this.visibleFrames = new Set();
    this.elementsWithClickListeners = new WeakSet();
    this.elementsWithScrollbars = new WeakSet();

    this.intersectionObserver = new IntersectionObserver(
      this.onIntersection.bind(this)
    );

    this.frameIntersectionObserver = new IntersectionObserver(
      this.onFrameIntersection.bind(this)
    );

    this.mutationObserver = new MutationObserver(this.onMutation.bind(this));

    this.idleCallbackId = undefined;
    this.bailed = false;
    this.resets = new Resets();

    const probe = document.createElement("div");
    setStyles(probe, PROBE_STYLES);
    this.probe = probe;
    this.observerProbeCallback = undefined;
    this.flushObserversPromise = undefined;

    bind(this, [
      this.onClickableElement,
      this.onUnclickableElement,
      this.onInjectedQueue,
      this.onOverflowChange,
    ]);
  }

  start() {
    const { documentElement } = document;
    if (documentElement == null) {
      return;
    }

    this.queueItemAndChildren({
      mutationType: "added",
      element: documentElement,
    });

    this.mutationObserver.observe(documentElement, {
      childList: true,
      subtree: true,
      attributeFilter: MUTATION_ATTRIBUTES,
    });

    for (const frame of document.querySelectorAll("iframe, frame")) {
      this.frameIntersectionObserver.observe(frame);
    }

    this.resets.add(
      addEventListener(window, CLICKABLE_EVENT, this.onClickableElement),
      addEventListener(window, UNCLICKABLE_EVENT, this.onUnclickableElement),
      addEventListener(window, QUEUE_EVENT, this.onInjectedQueue),
      addEventListener(window, "overflow", this.onOverflowChange),
      addEventListener(window, "underflow", this.onOverflowChange)
    );

    injectScript();
  }

  stop() {
    if (this.idleCallbackId != null) {
      cancelIdleCallback(this.idleCallbackId);
    }

    this.intersectionObserver.disconnect();
    this.frameIntersectionObserver.disconnect();
    this.mutationObserver.disconnect();
    this.queue = [];
    this.elements.clear();
    this.visibleElements.clear();
    this.visibleFrames.clear();
    // `WeakSet`s don’t have a `.clear()` method.
    // this.elementsWithClickListeners.clear();
    // this.elementsWithScrollbars.clear();
    this.idleCallbackId = undefined;
    this.resets.reset();
    sendInjectedMessage(MESSAGE_RESET);
  }

  // Stop using the intersection observer for everything except frames. The
  // reason to still track frames is because it saves more than half a second
  // when generating hints on the single-page HTML specification.
  bail() {
    if (this.bailed) {
      return;
    }

    const { size } = this.elements;

    this.intersectionObserver.disconnect();
    this.visibleElements.clear();
    this.bailed = true;

    log(
      "warn",
      "ElementManager#bail",
      size,
      this.maxIntersectionObservedElements
    );
  }

  queueItem(item: QueueItem) {
    this.queue.push(item);
    this.requestIdleCallback();
  }

  queueItemAndChildren(item: QueueItem) {
    const elements = [item.element, ...item.element.querySelectorAll("*")];
    for (const element of elements) {
      if (
        element instanceof HTMLIFrameElement ||
        element instanceof HTMLFrameElement
      ) {
        switch (item.mutationType) {
          case "added":
            // In theory, this can lead to more than
            // `maxIntersectionObservedElements` frames being tracked by the
            // intersection observer, but in practice there are never that many
            // frames. YAGNI.
            this.frameIntersectionObserver.observe(element);
            break;
          case "removed":
            this.frameIntersectionObserver.unobserve(element);
            this.visibleFrames.delete(element); // Just to be sure.
            break;
          case "changed":
            // Do nothing.
            break;
          default:
            unreachable(item.mutationType, item);
        }
      } else {
        this.queueItem({ mutationType: item.mutationType, element });
      }
    }
  }

  requestIdleCallback() {
    if (this.idleCallbackId == null) {
      this.idleCallbackId = requestIdleCallback(deadline => {
        this.idleCallbackId = undefined;
        this.flushQueue(deadline);
      });
    }
  }

  onIntersection(entries: Array<IntersectionObserverEntry>) {
    let probed = false;

    for (const entry of entries) {
      if (entry.target === this.probe) {
        probed = true;
      } else if (entry.isIntersecting) {
        this.visibleElements.add(entry.target);
      } else {
        this.visibleElements.delete(entry.target);
      }
    }

    if (probed && this.observerProbeCallback != null) {
      this.observerProbeCallback();
    }
  }

  onFrameIntersection(entries: Array<IntersectionObserverEntry>) {
    for (const entry of entries) {
      const element = entry.target;
      if (
        element instanceof HTMLIFrameElement ||
        element instanceof HTMLFrameElement
      ) {
        if (entry.isIntersecting) {
          this.visibleFrames.add(element);
        } else {
          this.visibleFrames.delete(element);
        }
      }
    }
  }

  onMutation(records: Array<MutationRecord>) {
    let probed = false;
    let changed = false;

    for (const record of records) {
      for (const node of record.addedNodes) {
        this.consumeEventAttribute(node);
        if (node === this.probe) {
          probed = true;
        } else if (node instanceof HTMLElement && node.id !== CONTAINER_ID) {
          this.queueItemAndChildren({ mutationType: "added", element: node });
          changed = true;
        }
      }

      for (const node of record.removedNodes) {
        this.consumeEventAttribute(node);
        if (node === this.probe) {
          probed = true;
        } else if (node instanceof HTMLElement && node.id !== CONTAINER_ID) {
          this.queueItemAndChildren({ mutationType: "removed", element: node });
          changed = true;
        }
      }

      if (record.attributeName != null) {
        const element = record.target;
        if (element instanceof HTMLElement) {
          this.queueItem({ mutationType: "changed", element });
          changed = true;
        }
      }
    }

    if (probed && this.observerProbeCallback != null) {
      this.observerProbeCallback();
    }

    if (changed) {
      this.onTrackedElementsMutation();
    }
  }

  onClickableElement(event: CustomEvent) {
    const element = event.target;
    if (element instanceof HTMLElement) {
      this.elementsWithClickListeners.add(element);
      this.queueItem({ mutationType: "changed", element });
    }
  }

  onUnclickableElement(event: CustomEvent) {
    const element = event.target;
    if (element instanceof HTMLElement) {
      this.elementsWithClickListeners.delete(element);
      this.queueItem({ mutationType: "changed", element });
    }
  }

  consumeEventAttribute(node: Node) {
    if (node instanceof HTMLElement) {
      const value = node.getAttribute(EVENT_ATTRIBUTE);
      switch (value) {
        case CLICKABLE_EVENT:
          this.elementsWithClickListeners.add(node);
          break;
        case UNCLICKABLE_EVENT:
          this.elementsWithClickListeners.delete(node);
          break;
        default:
          return;
      }
      node.removeAttribute(EVENT_ATTRIBUTE);
    }
  }

  onInjectedQueue(event: CustomEvent) {
    const { detail } = event;
    if (detail == null) {
      return;
    }

    const { hasQueue } = detail;
    if (typeof hasQueue !== "boolean") {
      return;
    }

    this.injectedHasQueue = hasQueue;
  }

  onOverflowChange(event: UIEvent) {
    const element = event.target;
    if (!(element instanceof HTMLElement)) {
      return;
    }

    // An element might have `overflow-x: hidden; overflow-y: auto;`. The events
    // don't tell which direction changed its overflow, so we must check that
    // ourselves. We're only interested in elements with scrollbars, not with
    // hidden overflow.
    if (isScrollable(element)) {
      if (!this.elementsWithScrollbars.has(element)) {
        this.elementsWithScrollbars.add(element);
        this.queueItem({ mutationType: "changed", element });
      }
    } else if (this.elementsWithScrollbars.has(element)) {
      this.elementsWithScrollbars.delete(element);
      this.queueItem({ mutationType: "changed", element });
    }
  }

  flushQueue(deadline: { timeRemaining: () => number }) {
    for (const [index, { mutationType, element }] of this.queue.entries()) {
      const type =
        mutationType === "removed" ? undefined : this.getElementType(element);
      if (type == null) {
        if (mutationType !== "added") {
          this.elements.delete(element);
          // Removing an element from the DOM also triggers the
          // IntersectionObserver (removing it from `this.visibleElements`), but
          // changing an attribute of an element so that it isn't considered
          // clickable anymore requires a manual deletion from
          // `this.visibleElements` since the element might still be on-screen.
          this.visibleElements.delete(element);
          this.intersectionObserver.unobserve(element);
          // The element must not be removed from `elementsWithClickListeners`
          // or `elementsWithScrollbars` (if `mutationType === "removed"`), even
          // though it might seem logical at first. But the element (or one of
          // its parents) could temporarily be removed from the paged and then
          // re-inserted. Then it would still have its click listener, but we
          // wouldn’t know. So instead of removing `element` here a `WeakSet` is
          // used, to avoid memory leaks. An example of this is the sortable
          // table headings on Wikipedia:
          // <https://en.wikipedia.org/wiki/Help:Sorting>
          // this.elementsWithClickListeners.delete(element);
          // this.elementsWithScrollbars.delete(element);
        }
      } else {
        this.elements.set(element, type);
        if (!this.bailed) {
          this.intersectionObserver.observe(element);
          if (this.elements.size > this.maxIntersectionObservedElements) {
            this.bail();
          }
        }
      }

      if (deadline.timeRemaining() <= 0) {
        this.queue = this.queue.slice(index + 1);
        this.requestIdleCallback();
        return;
      }
    }

    this.queue = [];
  }

  flushObservers(): Promise<void> {
    const { documentElement } = document;
    if (documentElement == null) {
      return Promise.resolve();
    }

    // Another `.getVisibleElements` is already pending and waiting for observers.
    if (this.flushObserversPromise != null) {
      return this.flushObserversPromise;
    }

    const flushObserversPromise = new Promise(resolve => {
      const intersectionCallback = () => {
        this.observerProbeCallback = undefined;
        this.intersectionObserver.unobserve(this.probe);
        this.probe.remove();
        resolve();
      };

      const mutationCallback = () => {
        this.observerProbeCallback = intersectionCallback;
        this.intersectionObserver.observe(this.probe);
      };

      // Trigger first the MutationObserver, then the IntersectionObserver.
      // `this.observerProbeCallback` like this is a bit ugly, but it works (at
      // least until we need concurrent flushes).
      this.observerProbeCallback = mutationCallback;
      documentElement.append(this.probe);
    });

    this.flushObserversPromise = flushObserversPromise;
    flushObserversPromise.finally(() => {
      this.flushObserversPromise = undefined;
    });

    return flushObserversPromise;
  }

  async getVisibleElements(
    types: ElementTypes,
    viewports: Array<Box>,
    time: TimeTracker,
    passedCandidates?: Array<HTMLElement>
  ): Promise<Array<?VisibleElement>> {
    const isUpdate = passedCandidates != null;
    const prefix = `ElementManager#getVisibleElements${
      isUpdate ? " (update)" : ""
    }`;

    // Make sure that the MutationObserver and the IntersectionObserver have had
    // a chance to run. This is important if you click a button that adds new
    // elements and really quickly enter hints mode after that. Only do this in
    // the top frame, because that cuts the time to first paint in half on
    // Twitter. Hopefully, while waiting for the observers in the top frame the
    // child frame observers run too. Also, don’t flush observers when updating
    // the positions during hints mode. The thinking is that it should be
    // faster, and observer updates get through during the next update anyway.
    time.start("flush observers");
    if (window.top === window && !isUpdate) {
      log("log", prefix, "flush observers (top frame only)");
      await this.flushObservers();
    }

    time.start("flush queues");

    const injectedNeedsFlush = this.injectedHasQueue;

    if (injectedNeedsFlush) {
      log("log", prefix, "flush injected");
      sendInjectedMessage(MESSAGE_FLUSH);
    }

    // If `injectedNeedsFlush` then `this.queue` will be modified, so check the
    // length _after_ flusing injected.js.
    const needsFlush = this.queue.length > 0;

    if (needsFlush) {
      log("log", prefix, "flush queue", this.queue);
      this.flushQueue(infiniteDeadline);
    }

    if (injectedNeedsFlush || needsFlush) {
      log("log", prefix, "flush observers", { injectedNeedsFlush, needsFlush });
      await this.flushObservers();
    }

    const candidates =
      passedCandidates != null
        ? passedCandidates
        : types === "selectable"
        ? document.querySelectorAll("*")
        : this.bailed
        ? this.elements.keys()
        : this.visibleElements;
    const range = document.createRange();
    const deduper = new Deduper();

    time.start("loop");
    const maybeResults = Array.from(candidates, element => {
      const type: ?ElementType =
        types === "selectable"
          ? getElementTypeSelectable(element)
          : this.elements.get(element);

      if (type == null) {
        return undefined;
      }

      if (types !== "selectable" && !types.includes(type)) {
        return undefined;
      }

      // Ignore `<label>` elements with no control and no click listeners.
      if (
        type === "label" &&
        element instanceof HTMLLabelElement &&
        element.control == null
      ) {
        return undefined;
      }

      const measurements = getMeasurements(element, type, viewports, range);

      if (measurements == null) {
        return undefined;
      }

      const visibleElement: VisibleElement = {
        element,
        type,
        measurements,
        hasClickListener: this.elementsWithClickListeners.has(element),
      };

      // In selectable mode we need to be able to select `<label>` text, and
      // click listeners aren't taken into account at all, so skip the deduping.
      // Also, a paragraph starting with an inline element shouldn't be deduped
      // away – both should be selectable.
      if (types !== "selectable") {
        deduper.add(visibleElement);
      }

      return visibleElement;
    });

    time.start("filter");
    return maybeResults.map(result =>
      result == null || deduper.rejects(result) ? undefined : result
    );
  }

  getVisibleFrames(
    viewports: Array<Box>
  ): Array<HTMLIFrameElement | HTMLFrameElement> {
    // In theory this might need flushing, but in practice this method is always
    // called _after_ `getVisibleElements`, so everything should already be
    // flushed.
    return Array.from(this.visibleFrames, element => {
      if (
        // Needed on reddit.com. There's a Google Ads iframe where
        // `contentWindow` is null.
        element.contentWindow == null
      ) {
        return undefined;
      }
      // Frames are slow to visit. Gmail has ~10 weird frames that are super
      // small. Not sure what they do. But not visiting saves around ~80ms on my
      // machine.
      const box = getVisibleBox(element.getBoundingClientRect(), viewports);
      return box != null &&
        box.width > FRAME_MIN_SIZE &&
        box.height > FRAME_MIN_SIZE
        ? element
        : undefined;
    }).filter(Boolean);
  }

  getElementType(element: HTMLElement): ?ElementType {
    switch (element.nodeName) {
      case "A":
        return element instanceof HTMLAnchorElement
          ? getLinkElementType(element)
          : undefined;
      case "BUTTON":
      case "SELECT":
      case "SUMMARY":
      case "AUDIO":
      case "VIDEO":
        return "clickable";
      case "INPUT":
        return element instanceof HTMLInputElement && element.type !== "hidden"
          ? "clickable"
          : undefined;
      // Twitter and DuckDuckGo have useless click handlers on the `<form>`
      // around their search inputs, whose hints end up below the hint of the
      // input. It feels like `<form>`s are never relevant to click, so exclude
      // them.
      case "FORM":
        return undefined;
      case "TEXTAREA":
        return "textarea";
      default: {
        const document = element.ownerDocument;

        // Even `<html>` and `<body>` can be contenteditable. That trumps all
        // the below types.
        if (!NON_CONTENTEDITABLE_VALUES.has(element.contentEditable)) {
          return "textarea";
        }

        if (
          this.elementsWithScrollbars.has(element) &&
          // Allow `<html>` (or `<body>`) to get hints only if they are
          // scrollable and in a frame. This allows focusing frames to scroll
          // them. In Chrome, `iframeElement.focus()` allows for scrolling a
          // specific frame, but I haven’t found a good way to show hints only
          // for _scrollable_ frames. Chrome users can use the "select element"
          // command instead. See `getElementTypeSelectable`.
          !(element === document.scrollingElement && window.top === window)
        ) {
          return "scrollable";
        }

        // `<html>` and `<body>` might have click listeners or role attributes
        // etc. but we never want hints for them.
        if (element === document.documentElement || element === document.body) {
          return undefined;
        }

        if (CLICKABLE_ROLES.has(element.getAttribute("role"))) {
          return "clickable";
        }

        if (
          hasClickListenerProp(element) ||
          this.elementsWithClickListeners.has(element) ||
          CLICKABLE_ATTRIBUTES.some(attr => element.hasAttribute(attr))
        ) {
          return "clickable-event";
        }

        // Match `<label>` elements last so that labels without controls but
        // with click listeners are matched as clickable.
        if (element.nodeName === "LABEL") {
          return "label";
        }

        return undefined;
      }
    }
  }
}

// Attempt to remove hints that do the same thing as some other element
// (`<label>`–`<input>` pairs) or hints that are most likely false positives
// (`<div>`s with click listeners wrapping a `<button>`).
class Deduper {
  positionMap: Map<string, Array<VisibleElement>>;
  rejected: Set<HTMLElement>;

  constructor() {
    this.positionMap = new Map();
    this.rejected = new Set();
  }

  add(visibleElement: VisibleElement) {
    const { element } = visibleElement;

    // Exclude `<label>` elements whose associated control has a hint.
    // $FlowIgnore: Only some types of elements have `.labels`, and I'm not going to `instanceof` check them all.
    if (element.labels instanceof NodeList) {
      for (const label of element.labels) {
        this.rejected.add(label);
      }
    }

    const key = hintPositionKey(visibleElement.measurements);
    const elements = this.positionMap.get(key);

    if (elements == null) {
      this.positionMap.set(key, [visibleElement]);
      return;
    }

    elements.push(visibleElement);

    const [bad, good] = partition(elements, ({ type }) =>
      LOW_QUALITY_TYPES.has(type)
    );

    // If hints are positioned in the exact same spot, reject those of low
    // quality (for exmaple those that only have click listeners and nothing
    // else) since they are likely just noise. Many `<button>`s and `<a>`s on
    // Twitter and Gmail are wrapped in `<div>`s with click listeners. And on
    // GitHub there are dropdown menus near the top where the hint for the
    // `<summary>` elements that open them are covered by the hint for a
    // `<details>` element with a click listener that doesn't do anything when
    // clicked.
    if (bad.length > 0 && good.length > 0) {
      for (const { element: badElement } of bad) {
        this.rejected.add(badElement);
      }
    }
  }

  rejects({ element }: VisibleElement): boolean {
    return this.rejected.has(element);
  }
}

function hintPositionKey(measurements: HintMeasurements): string {
  return [
    String(Math.round(measurements.x)),
    String(Math.round(measurements.y)),
    measurements.align,
  ].join(",");
}

function getMeasurements(
  element: HTMLElement,
  elementType: ElementType,
  viewports: Array<Box>,
  // The `range` is passed in since it is faster to re-use the same one than
  // creating a new one for every element candidate.
  range: Range
): ?HintMeasurements {
  // If an inline `<a>` wraps a block `<div>`, the link gets three rects. The
  // first and last have 0 width. The middle is the "real" one. Remove the
  // "empty" ones, so that the link is considered a "card" and not a
  // line-wrapped text link.
  const allRects = Array.from(element.getClientRects());
  const filteredRects = allRects.filter(
    rect =>
      rect.width >= TEXT_RECT_MIN_SIZE && rect.height >= TEXT_RECT_MIN_SIZE
  );
  // For links with only floated children _all_ rects might have 0 width/height.
  // In that case, use the "empty" ones after all. Floated children is handled
  // further below.
  const rects = filteredRects.length > 0 ? filteredRects : allRects;

  // Ignore elements with only click listeners that are really large. These are
  // most likely not clickable, and only used for event delegation.
  if (elementType === "clickable-event" && rects.length === 1) {
    if (area(rects[0]) > MAX_CLICKABLE_EVENT_AREA) {
      return undefined;
    }
  }

  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

  const visibleBoxes = Array.from(rects, rect => getVisibleBox(rect, viewports))
    .filter(Boolean)
    // Remove `offsetX` and `offsetY` to turn `x` and `y` back to the coordinate
    // system of the current frame. This is so we can easily make comparisons
    // with other rects of the frame.
    .map(box => ({ ...box, x: box.x - offsetX, y: box.y - offsetY }));

  if (visibleBoxes.length === 0) {
    // If there’s only one rect and that rect has no width it means that all
    // children are floated or absolutely positioned (and that `element` hasn’t
    // been made to “contain” the floats). For example, a link in a menu could
    // contain a span of text floated to the left and an icon floated to the
    // right. Those are still clickable. So return the measurements of one of
    // the children instead. At least for now we just pick the first (in DOM
    // order), but there might be a more clever way of doing it.
    if (rects.length === 1) {
      const rect = rects[0];
      if (rect.width === 0) {
        for (const child of element.children) {
          const measurements = getMeasurements(
            child,
            elementType,
            viewports,
            range
          );
          if (measurements != null) {
            return measurements;
          }
        }
      }
    }

    return undefined;
  }

  const hintPoint =
    rects.length === 1
      ? getSingleRectPoint({
          element,
          elementType,
          rect: rects[0],
          visibleBox: visibleBoxes[0],
          viewports,
          range,
        })
      : getMultiRectPoint({ element, visibleBoxes, viewports, range });

  const maxX = Math.max(...visibleBoxes.map(box => box.x + box.width));

  // Check that the element isn’t covered. A little bit expensive, but totally
  // worth it since it makes link hints in fixed menus so much easier find.
  // If this runs in a frame, the element can still be covered by something in a
  // parent frame, but it's not worth the trouble to try and check that.
  const nonCoveredPoint = getNonCoveredPoint(element, {
    // Rounding upwards is required in html/tridactyl/index.html.
    x: Math.ceil(hintPoint.x),
    y: Math.round(hintPoint.y),
    maxX,
  });

  if (nonCoveredPoint == null) {
    // Putting a large `<input type="file">` inside a smaller wrapper element
    // with `overflow: hidden;` seems to be a common pattern, used both on
    // addons.mozilla.org and <https://blueimp.github.io/jQuery-File-Upload/>.
    if (
      element instanceof HTMLInputElement &&
      element.type === "file" &&
      element.parentNode instanceof HTMLElement &&
      area(element.parentNode.getBoundingClientRect()) < area(rects[0])
    ) {
      const measurements = getMeasurements(
        element.parentNode,
        elementType,
        viewports,
        range
      );
      return measurements == null ? undefined : measurements;
    }

    // CodeMirror editor uses a tiny hidden textarea positioned at the caret.
    // Targeting those are the only reliable way of focusing CodeMirror
    // editors, and doing so without moving the caret.
    // <https://codemirror.net/demo/complete.html>
    if (
      !(
        element instanceof HTMLTextAreaElement &&
        // Use `element.clientWidth` instead of `pointBox.width` because the
        // latter includes the width of the borders of the textarea, which are
        // unreliable.
        element.clientWidth <= 1
      )
    ) {
      return undefined;
    }
  }

  const { x, y } = nonCoveredPoint == null ? hintPoint : nonCoveredPoint;

  // Where to place the hint and the weight of the element.
  return {
    x: x + offsetX,
    y: y + offsetY,
    align: hintPoint.align,
    maxX: maxX + offsetX,
    weight: hintWeight(elementType, visibleBoxes),
  };
}

function getSingleRectPoint({
  element,
  elementType,
  rect,
  visibleBox,
  viewports,
  range,
}: {|
  element: HTMLElement,
  elementType: ElementType,
  rect: ClientRect,
  visibleBox: Box,
  viewports: Array<Box>,
  range: Range,
|}): Point {
  // Scrollbars are usually on the right side, so put the hint there, making it
  // easier to see that the hint is for scrolling and reducing overlap.
  if (elementType === "scrollable") {
    return {
      ...getXY(visibleBox),
      x: visibleBox.x + visibleBox.width - 1,
      align: "right",
    };
  }

  // Always put hints for "tall" elements at the left-center edge – except in
  // selectable mode (long paragraphs). Then it is nicer to put the marker at
  // the start of the text.
  // Also do not look for text nodes or images in `<textarea>` (which does have
  // hidden text nodes) and `contenteditable` elements, since it looks nicer
  // always placing the hint at the edge for such elements. Usually they are
  // tall enough to have their hint end up there. This ensures the hint is
  // _always_ placed there for consistency.
  if (
    elementType === "textarea" ||
    (elementType !== "selectable" && rect.height >= BOX_MIN_HEIGHT)
  ) {
    return {
      ...getXY(visibleBox),
      align: "left",
    };
  }

  function isAcceptable(point: Point): boolean {
    return isWithin(point, visibleBox);
  }

  // Try to place the hint at the text of the element.
  // Don’t try to look for text nodes in `<select>` elements. There
  // _are_ text nodes inside the `<option>` elements and their rects _can_ be
  // measured, but if the dropdown opens _upwards_ the `elementAtPoint` check
  // will fail. An example is the signup form at <https://www.facebook.com/>.
  if (!(element instanceof HTMLSelectElement)) {
    const textPoint = getBestNonEmptyTextPoint({
      element,
      elementRect: rect,
      viewports,
      isAcceptable,
      preferTextStart: elementType === "selectable",
      range,
    });
    if (textPoint != null) {
      return textPoint;
    }
  }

  // Try to place the hint near an image. Many buttons have just an icon and no
  // (visible) text.
  const imagePoint = getFirstImagePoint(element, viewports);
  if (
    imagePoint != null &&
    // For images that are taller than the element, allow the point to be
    // outside the rects. It's common to find `p > a > img` where the `<a>` is
    // just a regular inline element with the `<img>` sticking out the top.
    (isAcceptable(imagePoint.point) || rect.height < imagePoint.rect.height)
  ) {
    return imagePoint.point;
  }

  // Checkboxes and radio buttons are typically small and we don't want to cover
  // them with the hint.
  if (
    element instanceof HTMLInputElement &&
    (element.type === "checkbox" || element.type === "radio")
  ) {
    return {
      ...getXY(visibleBox),
      align: "right",
    };
  }

  // Take border and padding into account. This is nice since it places the hint
  // nearer the placeholder in `<input>` elements and nearer the text in `<input
  // type="button">` and `<select>`.
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement
  ) {
    const borderAndPaddingPoint = getBorderAndPaddingPoint(
      element,
      rect,
      visibleBox
    );
    if (isAcceptable(borderAndPaddingPoint)) {
      return borderAndPaddingPoint;
    }
  }

  return {
    ...getXY(visibleBox),
    align: "left",
  };
}

function getMultiRectPoint({
  element,
  visibleBoxes,
  viewports,
  range,
}: {|
  element: HTMLElement,
  visibleBoxes: Array<Box>,
  viewports: Array<Box>,
  range: Range,
|}): Point {
  function isAcceptable(point: Point): boolean {
    return visibleBoxes.some(box => isWithin(point, box));
  }

  const textPoint = getBestNonEmptyTextPoint({
    element,
    elementRect: element.getBoundingClientRect(),
    viewports,
    isAcceptable,
    preferTextStart: true,
    range,
  });
  if (textPoint != null) {
    return textPoint;
  }

  const minY = Math.min(...visibleBoxes.map(box => box.y));
  const maxY = Math.max(...visibleBoxes.map(box => box.y + box.height));

  return {
    x: Math.min(...visibleBoxes.map(box => box.x)),
    y: (minY + maxY) / 2,
    align: "right",
  };
}

function getFirstImagePoint(
  element: HTMLElement,
  viewports: Array<Box>
): ?{| point: Point, rect: ClientRect |} {
  const images = [
    // First try to find an image _child._ For example, <button
    // class="icon-button"><img></button>`. (This button should get the hint at
    // the image, not at the edge of the button.)
    ...element.querySelectorAll(IMAGE_SELECTOR),
    // Then, see if the element itself is an image. For example, `<button
    // class="Icon Icon-search"></button>`. The element itself can also be an
    // `<img>` due to the `float` case in `getMeasurements`.
    ...(element.matches(IMAGE_SELECTOR) ? [element] : []),
  ];

  // Some buttons on Twitter have two icons inside – one shown, one hidden (and
  // it toggles between them based on if the button is active or not). At least
  // for now we just pick the first image (in DOM order) that gets a
  // `visibleBox`, but there might be a more clever way of doing it.
  for (const image of images) {
    const rect = image.getBoundingClientRect();
    const visibleBox = getVisibleBox(rect, viewports);

    if (visibleBox != null) {
      return {
        point: {
          // The image might have padding around it.
          ...getBorderAndPaddingPoint(image, rect, visibleBox),
          align: rect.height >= BOX_MIN_HEIGHT ? "left" : "right",
        },
        rect,
      };
    }
  }

  return undefined;
}

function getBorderAndPaddingPoint(
  element: HTMLElement,
  rect: ClientRect,
  visibleBox: Box
): Point {
  const computedStyle = window.getComputedStyle(element);

  const left =
    parseFloat(computedStyle.getPropertyValue("border-left-width")) +
    parseFloat(computedStyle.getPropertyValue("padding-left"));

  return {
    ...getXY(visibleBox),
    x: rect.left + left,
    align:
      element instanceof HTMLInputElement &&
      (element.type === "file" ||
        (element.type === "image" && element.src !== ""))
        ? "left"
        : "right",
  };
}

function getNonCoveredPoint(
  element: HTMLElement,
  { x, y, maxX }: {| x: number, y: number, maxX: number |}
): ?{| x: number, y: number |} {
  const elementAtPoint = document.elementFromPoint(x, y);

  // (x, y) is off-screen.
  if (elementAtPoint == null) {
    return undefined;
  }

  // `.contains` also checks `element === elementAtPoint`.
  if (element.contains(elementAtPoint)) {
    return { x, y };
  }

  const rect = elementAtPoint.getBoundingClientRect();

  // `.getBoundingClientRect()` does not include pseudo-elements that are
  // absolutely positioned so that they go outside of the element, but calling
  // `.elementAtPoint()` on the pseudo-element _does_ return the element. For
  // `/###\`-looking tabs, which overlap each other slightly, the slanted parts
  // are often made using pseudo-elements. When trying to position a hint for
  // tab 2, `.elementAtPoint()` might return tab 1. So if we get a non-sensical
  // rect (one that does not cover (x, y)) for the "covering" element it's
  // better to treat (x, y) as non-covered.
  if (rect.left > x || rect.right <= x || rect.top > y || rect.bottom <= y) {
    return { x, y };
  }

  const newX = Math.round(rect.right + 1);

  // Try once to the right of the covering element (if it doesn't cover all the
  // way to the right of `element`). For example, there could be an absolutely
  // positioned search icon at the left of an `<input>`. Just trying once to the
  // right seemed to be a good tradeoff between correctness and performance in
  // the VimFx add-on.
  if (newX > x && newX <= maxX) {
    const elementAtPoint2 = document.elementFromPoint(newX, y);

    if (elementAtPoint2 != null && element.contains(elementAtPoint2)) {
      return { x: newX, y };
    }
  }

  return undefined;
}

// Turn a `ClientRect` into a `Box` using the coordinates of the topmost
// viewport. Only the part of the `ClientRect` visible through all viewports end
// up in the `Box`.
export function getVisibleBox(
  passedRect: ClientRect,
  viewports: Array<Box>
): ?Box {
  // No shortcuts (such as summing up viewport x:s and y:s) can be taken here,
  // since each viewport (frame) clips the visible area. We have to loop them
  // all through.
  const visibleRect = viewports.reduceRight(
    (rect, viewport) => ({
      left: viewport.x + Math.max(rect.left, 0),
      right: viewport.x + Math.min(rect.right, viewport.width),
      top: viewport.y + Math.max(rect.top, 0),
      bottom: viewport.y + Math.min(rect.bottom, viewport.height),
    }),
    passedRect
  );

  const width = visibleRect.right - visibleRect.left;
  const height = visibleRect.bottom - visibleRect.top;

  // If `visibleRect` has a non-sensical width or height it means it is not
  // visible within `viewports`.
  return width <= 0 || height <= 0
    ? undefined
    : {
        x: visibleRect.left,
        y: visibleRect.top,
        width,
        height,
      };
}

// Try to find the best piece of text to place the hint at. This is difficult,
// since lots of types of elements end up here: Everything from simple text
// links to "cards" with titles, subtitles, badges and price tags. See the
// inline comments for more details.
function getBestNonEmptyTextPoint({
  element,
  elementRect,
  viewports,
  isAcceptable,
  preferTextStart = false,
  range,
}: {|
  element: HTMLElement,
  elementRect: ClientRect,
  viewports: Array<Box>,
  isAcceptable: Point => boolean,
  preferTextStart: boolean,
  range: Range,
|}): ?Point {
  const align = "right";

  // This goes through _all_ text nodes inside the element. That sounds
  // expensive, but in reality I have not noticed this to slow things down. Note
  // that `range.selectNodeContents(element); range.getClientRects()` might seem
  // easier to use, but it takes padding and such of child elements into
  // account. Also, it would count leading visible whitespace as the first
  // character.
  const rects = [].concat(
    ...Array.from(walkTextNodes(element), textNode => {
      const start = textNode.data.search(NON_WHITESPACE);
      const end = textNode.data.search(LAST_NON_WHITESPACE);
      if (start >= 0 && end >= 0) {
        range.setStart(textNode, start);
        range.setEnd(textNode, end + 1);
        return Array.from(range.getClientRects(), rect => {
          const point = { ...getXY(rect), align };
          return (
            // Exclude screen reader only text.
            rect.width >= TEXT_RECT_MIN_SIZE &&
              rect.height >= TEXT_RECT_MIN_SIZE &&
              // Make sure that the text is inside the element.
              isAcceptable(point)
              ? rect
              : undefined
          );
        }).filter(Boolean);
      }
      return [];
    })
  );

  if (rects.length === 0) {
    return undefined;
  }

  // In selectable mode, prefer placing the hint at the start of the text
  // (visually) rather than at the most eye-catching text. Also used for
  // line-wrapped links, where the hint should be at the start of the link (if
  // possible), not at the left-most part of it:
  //
  //     text text text [F]link
  //     link text text
  //
  if (preferTextStart) {
    // Prefer the top-most part of the line. In case of a tie, prefer the
    // left-most one.
    const leftMostRect = rects.reduce((a, b) =>
      b.top < a.top ? b : b.top === a.top && b.left < a.left ? b : a
    );
    return { ...getXY(leftMostRect), align };
  }

  // Prefer the tallest one. In case of a tie, prefer the widest one.
  const largestRect = rects.reduce((a, b) =>
    b.height > a.height ? b : b.height === a.height && b.width > a.width ? b : a
  );

  // There could be smaller text just to the left of the tallest text. It feels
  // more natural to be looking for the tallest _line_ rather than the tallest
  // piece of text and place the hint at the beginning of the line.
  const sameLineRects = rects.filter(
    rect => rect.top < largestRect.bottom && rect.bottom > largestRect.top
  );

  // Prefer the left-most part of the line. In case of a tie, prefer the
  // top-most one.
  const leftMostRect = sameLineRects.reduce((a, b) =>
    b.left < a.left ? b : b.left === a.left && b.top < a.top ? b : a
  );

  // If the text of the element is a single line and there's room to the left of
  // the text for an icon, look for an icon (image) and place the hint there
  // instead. It is common to have a little icon before the text of buttons.
  // This avoids covering the icon with the hint.
  const isSingleLine = sameLineRects.length === rects.length;
  if (isSingleLine && leftMostRect.left >= elementRect.left + ICON_MIN_SIZE) {
    const imagePoint = getFirstImagePoint(element, viewports);
    if (
      imagePoint != null &&
      imagePoint.point.x < leftMostRect.left &&
      isAcceptable(imagePoint.point)
    ) {
      return imagePoint.point;
    }
  }

  return { ...getXY(leftMostRect), align };
}

function isWithin(point: Point, box: Box): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width * MAX_HINT_X_PERCENTAGE_OF_WIDTH &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function injectScript() {
  // Neither Chrome nor Firefox allow inline scripts in the options page. It's
  // not needed there anyway.
  const { protocol } = window.location;
  if (protocol === "chrome-extension:" || protocol === "moz-extension:") {
    return;
  }

  const { documentElement } = document;
  if (documentElement == null) {
    return;
  }

  const rawCode = replaceConstants(injected.toString());
  const code = `(${rawCode})()`;

  // In Firefox, `eval !== window.eval`. `eval` executes in the content script
  // context, while `window.eval` executes in the page context. So in Firefox we
  // can use `window.eval` instead of a script tag.
  let hasCSP = false;
  if (BROWSER === "firefox") {
    try {
      // Hide the eval call from linters and Rollup since this is a legit and
      // safe usage of eval: The input is static and known, and this is just a
      // substitute for running the code as an inline script (see below). Also,
      // it is run in the _page_ context.
      window["ev".concat("al")](code);
      return;
    } catch {
      // However, the `window.eval` can fail if the page has a Content Security
      // Policy. In such a case we have to resort to injecting a `<script
      // src="...">`. Script tags with URLs injected by a web extension seems to
      // be allowed regardless of CSP. In theory an inline script _could_ be
      // allowed by the CSP (which would be a better choice since inline scripts
      // execute synchronously while scripts with URLs are always async – and we
      // want to ideally execute as early as possible in case the page adds
      // click listeners via an inline script), but there's no easy way of
      // detecting if inline scrips are allowed. As a last note, if the
      // `window.eval` fails a warning is unfortunately logged to the console. I
      // wish there was a way to avoid that.
      hasCSP = true;
    }
  }

  const script = document.createElement("script");

  if (hasCSP) {
    script.src = `data:application/javascript;utf8,${encodeURIComponent(code)}`;
  } else {
    // Chrome nicely allows inline scripts inserted by an extension regardless
    // of CSP. I look forward to the day Firefox works this way too. See
    // <bugzil.la/1446231> and <bugzil.la/1267027>.
    script.textContent = code;
  }

  documentElement.append(script);
  script.remove();
}

function replaceConstants(code: string): string {
  const regex = RegExp(`\\b(${Object.keys(constants).join("|")})\\b`, "g");
  return code.replace(regex, name => constants[name]);
}

function isScrollable(element: HTMLElement): boolean {
  const computedStyle = window.getComputedStyle(element);

  // `.scrollLeftMax` and `.scrollTopMax` are Firefox-only, but this function is
  // only called from the "overflow" and "underflow" event listeners, and those
  // are Firefox-only as well. Those properties are the easiest way to check if
  // an element overflows in either the X or Y direction.
  return (
    // $FlowIgnore: See above.
    (element.scrollLeftMax > 0 &&
      (SCROLLABLE_OVERFLOW_VALUES.has(
        computedStyle.getPropertyValue("overflow-x")
      ) ||
        element === document.scrollingElement)) ||
    // $FlowIgnore: See above.
    (element.scrollTopMax > 0 &&
      (SCROLLABLE_OVERFLOW_VALUES.has(
        computedStyle.getPropertyValue("overflow-y")
      ) ||
        element === document.scrollingElement))
  );
}

function hasClickListenerProp(element: HTMLElement): boolean {
  // Adding a `onclick="..."` attribute in HTML automatically sets
  // `.onclick` of the element to a function. But in Chrome, `.onclick`
  // is `undefined` when inspected from a content script, so we need to
  // use `.hasAttribute` instead. That works, except in rare edge cases
  // where `.onclick = null` is set afterwards (the attribute string
  // will remain but the listener will be gone).
  return CLICKABLE_EVENT_PROPS.some(prop =>
    BROWSER === "chrome"
      ? element.hasAttribute(prop)
      : // $FlowIgnore: I _do_ want to dynamically read properties here.
        typeof element[prop] === "function"
  );
}

function sendInjectedMessage(message: string) {
  try {
    if (window.wrappedJSObject != null) {
      window.wrappedJSObject[INJECTED_VAR](message, SECRET);
    } else {
      const { documentElement } = document;
      if (documentElement == null) {
        return;
      }
      // I guess the page can read the secret via a MutationObserver, but at
      // least in the Firefox case the page shouldn't be able to read it. The
      // page can't do much with the secret anyway. However, this probably runs
      // so early that the page never has a chance to set up a MutationObserver
      // in time.
      const script = document.createElement("script");
      script.textContent = `window[${JSON.stringify(
        INJECTED_VAR
      )}](${JSON.stringify(message)}, ${JSON.stringify(SECRET)});`;
      documentElement.append(script);
      script.remove();
    }
  } catch (error) {
    log("error", "Failed to message injected.js", error);
  }
}

function getXY(box: Box | ClientRect): {| x: number, y: number |} {
  return {
    // $FlowIgnore: Chrome and Firefox _do_ support `.x` and `.y` on ClientRects (aka DOMRects).
    x: box.x,
    // $FlowIgnore: See above.
    y: box.y + box.height / 2,
  };
}

function area(rect: ClientRect): number {
  return rect.width * rect.height;
}

function hintWeight(
  elementType: ElementType,
  visibleBoxes: Array<Box>
): number {
  // Use the height as the weight. In a list of links, all links will then get
  // the same weight, since they have the same weight. (They’re all as important
  // as the other.) A multiline link gets the height of one of its lines as
  // weight. But use the width as weight if it is smaller so that very tall but
  // not very wide elements aren’t over powered.
  // If there are a bunch boxes next to each other with seemingly the same size
  // (and no other clickable elements around) the first box should get the first
  // hint chars as a hint, the second should get the second hint char, and so
  // on. However, the sizes of the boxes can differ ever so slightly (by less
  // than 1px). So round the weight to make the order more predictable.
  const weight = Math.round(
    Math.min(
      Math.max(...visibleBoxes.map(box => box.width)),
      Math.max(...visibleBoxes.map(box => box.height))
    )
  );

  // Use logarithms too make the difference between small and large elements
  // smaller. Instead of an “image card” being 10 times heavier than a
  // navigation link, it’ll only be about 3 times heavier. Give worse hints to
  // some types, such as scrollable elements, by using a logarithm with a higher
  // base. A tall scrollable element (1080px) gets a weight slightly smaller
  // than that of a small link (12px high).
  const lg = WORSE_HINT_TYPES.has(elementType) ? Math.log10 : Math.log2;

  return Math.max(1, lg(weight));
}

function getElementTypeSelectable(element: HTMLElement): ?ElementType {
  switch (element.nodeName) {
    // Links _could_ be marked as "clickable" as well for simplicity, but
    // marking them as "link" allows opening them in a new tab by holding alt
    // for consistency with all other hints modes.
    case "A":
      return element instanceof HTMLAnchorElement
        ? getLinkElementType(element)
        : undefined;
    // Always consider the following elements as selectable, regardless of their
    // children, since they have special context menu items. A
    // `<canvas><p>fallback</p></canvas>` could be considered a wrapper element
    // and be skipped otherwise. Making frames selectable also allows Chrome
    // users to scroll frames using the arrow keys. It would be convenient to
    // give frames hints during regular click hints mode for that reason, but
    // unfortunately for example Twitter uses iframes for many of its little
    // widgets/embeds which would result in many unnecessary/confusing hints.
    case "AUDIO":
    case "BUTTON":
    case "SELECT":
    case "TEXTAREA":
    case "VIDEO":
      return "clickable";
    case "INPUT":
      return element instanceof HTMLInputElement && element.type !== "hidden"
        ? "clickable"
        : undefined;
    case "CANVAS":
    case "EMBED":
    case "FRAME":
    case "IFRAME":
    case "IMG":
    case "OBJECT":
      return "selectable";
    default: {
      // If an element has no child _elements_ (but possibly child text nodes),
      // consider it selectable. This allows focusing `<div>`-based "buttons"
      // with only a background image as icon inside. It also catches many
      // elements with text without having to iterate through all child text
      // nodes.
      if (element.childElementCount === 0) {
        return "selectable";
      }

      // If the element has at least one immediate non-blank text node, consider
      // it selectable. If an element contains only other elements, whitespace
      // and comments it is a "wrapper" element that would just cause duplicate
      // hints.
      for (const node of element.childNodes) {
        if (node instanceof Text && NON_WHITESPACE.test(node.data)) {
          return "selectable";
        }
      }
      return undefined;
    }
  }
}

function getLinkElementType(element: HTMLAnchorElement): ElementType {
  const hrefAttr = element.getAttribute("href");
  return (
    // Exclude `<a>` tags used as buttons.
    typeof hrefAttr === "string" &&
      hrefAttr !== "" &&
      hrefAttr !== "#" &&
      // Exclude `javascript:`, `mailto:`, `tel:` and other protocols that
      // don’t make sense to open in a new tab.
      LINK_PROTOCOLS.has(element.protocol)
      ? "link"
      : "clickable"
  );
}
