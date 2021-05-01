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
  addEventListener,
  bind,
  getElementFromPoint,
  getElementsFromPoint,
  getLabels,
  getVisibleBox,
  LAST_NON_WHITESPACE,
  log,
  NON_WHITESPACE,
  partition,
  Resets,
  SKIP_TEXT_ELEMENTS,
  unreachable,
  walkTextNodes,
} from "../shared/main";
import type { Durations, Stats, TimeTracker } from "../shared/perf";
import {
  elementTypeSet,
  selectorString,
  stringSet,
  tweakable,
  unsignedFloat,
  unsignedInt,
} from "../shared/tweakable";
import injected, {
  type FromInjected,
  CLICKABLE_CHANGED_EVENT,
  CLICKABLE_EVENT_NAMES,
  CLICKABLE_EVENT_PROPS,
  CLOSED_SHADOW_ROOT_CREATED_1_EVENT,
  CLOSED_SHADOW_ROOT_CREATED_2_EVENT,
  FLUSH_EVENT,
  OPEN_SHADOW_ROOT_CREATED_EVENT,
  QUEUE_EVENT,
  REGISTER_SECRET_ELEMENT_EVENT,
  RESET_EVENT,
} from "./injected";

// Keep the above imports and this object in sync. See injected.js.
const constants = {
  CLICKABLE_CHANGED_EVENT: JSON.stringify(CLICKABLE_CHANGED_EVENT),
  CLICKABLE_EVENT_NAMES: JSON.stringify(CLICKABLE_EVENT_NAMES),
  CLICKABLE_EVENT_PROPS: JSON.stringify(CLICKABLE_EVENT_PROPS),
  CLOSED_SHADOW_ROOT_CREATED_1_EVENT: JSON.stringify(
    CLOSED_SHADOW_ROOT_CREATED_1_EVENT
  ),
  CLOSED_SHADOW_ROOT_CREATED_2_EVENT: JSON.stringify(
    CLOSED_SHADOW_ROOT_CREATED_2_EVENT
  ),
  FLUSH_EVENT: JSON.stringify(FLUSH_EVENT),
  OPEN_SHADOW_ROOT_CREATED_EVENT: JSON.stringify(
    OPEN_SHADOW_ROOT_CREATED_EVENT
  ),
  QUEUE_EVENT: JSON.stringify(QUEUE_EVENT),
  REGISTER_SECRET_ELEMENT_EVENT: JSON.stringify(REGISTER_SECRET_ELEMENT_EVENT),
  RESET_EVENT: JSON.stringify(RESET_EVENT),
};

const ATTRIBUTES_CLICKABLE: Set<string> = new Set([
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
]);

const ATTRIBUTES_NOT_CLICKABLE: Set<string> = new Set([
  // Google.
  "data-hveid",
]);

export const t = {
  // The single-page HTML specification has over 70K links! If trying to track all
  // of those with `IntersectionObserver`, scrolling is noticeably laggy. On my
  // computer, the lag starts somewhere between 10K and 20K tracked links.
  // Tracking at most 10K should be enough for regular sites.
  MAX_INTERSECTION_OBSERVED_ELEMENTS: unsignedInt(10e3),

  // If `.getVisibleElements` is taking too long, skip remaining elements.
  // Chrome’s implementation of `document.elementFromPoint` is not optimized for
  // elements with thousands of children, which is rare in practice but present
  // in the link-monster demo.
  MAX_DURATION: unsignedInt(10e3),

  ELEMENT_TYPES_LOW_QUALITY: elementTypeSet(new Set(["clickable-event"])),

  // Give worse hints to scrollable elements and (selectable) frames. They are
  // usually very large by nature, but not that commonly used. Also give worse
  // hints to elements with click listeners only. They often wrap text inputs,
  // covering the hint for the input.
  ELEMENT_TYPES_WORSE: elementTypeSet(
    new Set(["clickable-event", "scrollable", "selectable"])
  ),

  // Elements this many pixels high or taller always get their hint placed at the
  // very left edge.
  MIN_HEIGHT_BOX: unsignedFloat(110), // px

  // Avoid placing hints too far to the right side. The first non-empty text node
  // of an element does not necessarily have to come first, due to CSS. For
  // example, it is not uncommon to see menu items with a label to the left and a
  // number to the right. That number is usually positioned using `float: right;`
  // and due to how floats work it then needs to come _before_ the label in DOM
  // order. This avoids targeting such text.
  MAX_HINT_X_PERCENTAGE_OF_WIDTH: unsignedFloat(0.75),

  // Maximum area for elements with only click listeners. Elements larger than
  // this are most likely not clickable, and only used for event delegation.
  MAX_CLICKABLE_EVENT_AREA: unsignedFloat(1e6), // px

  PROTOCOLS_LINK: stringSet(
    new Set(
      [
        "http:",
        "https:",
        "ftp:",
        "chrome-extension:",
        "moz-extension:",
        // Firefox does not allow opening `file://` URLs in new tabs, but Chrome
        // does. Both allow _clicking_ them.
        // See: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/create>
        BROWSER === "chrome" ? "file:" : undefined,
      ].filter(Boolean)
    )
  ),

  // http://w3c.github.io/aria/#widget_roles
  ROLES_CLICKABLE: stringSet(
    new Set([
      "button",
      "checkbox",
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
      // "gridcell",
      // "progressbar",
      // "scrollbar",
      // "separator",
      // "slider",
      // "tabpanel",
    ])
  ),

  // "true" indicates that contenteditable is on. Chrome also supports
  // "plaintext-only". There may be more modes in the future, such as "caret", so
  // it’s better to only list the values that indicate that an element _isn’t_
  // contenteditable.
  VALUES_NON_CONTENTEDITABLE: stringSet(
    new Set([
      // The default value. If a parent is contenteditable, it means that this
      // element is as well (and `element.isContentEditable` is true). But we only
      // want hints for the “root” contenteditable element.
      "inherit",
      // Explicitly turned off:
      "false",
    ])
  ),

  VALUES_SCROLLABLE_OVERFLOW: stringSet(new Set(["auto", "scroll"])),

  MIN_SIZE_FRAME: unsignedFloat(6), // px
  MIN_SIZE_TEXT_RECT: unsignedFloat(2), // px
  MIN_SIZE_ICON: unsignedFloat(10), // px

  ATTRIBUTES_CLICKABLE: stringSet(ATTRIBUTES_CLICKABLE),
  ATTRIBUTES_NOT_CLICKABLE: stringSet(ATTRIBUTES_NOT_CLICKABLE),

  ATTRIBUTES_MUTATION: stringSet(
    new Set([
      "contenteditable",
      "disabled",
      "href",
      "role",
      ...CLICKABLE_EVENT_PROPS,
      ...ATTRIBUTES_CLICKABLE,
      ...ATTRIBUTES_NOT_CLICKABLE,
    ])
  ),

  // Find actual images as well as icon font images. Matches for example “Icon”,
  // “glyphicon”, “fa” and “fa-thumbs-up” but not “face or “alfa”.
  SELECTOR_IMAGE: selectorString(
    "img, svg, [class*='icon' i], [class~='fa'], [class^='fa-'], [class*=' fa-']"
  ),
};

export const tMeta = tweakable("ElementManager", t);

type Rejected = {
  isRejected: true,
  debug: {
    reason: string,
    [string]: mixed,
    ...
  },
};

type Record = {
  addedNodes: Array<Node> | NodeList<Node>,
  removedNodes: Array<Node> | NodeList<Node>,
  attributeName: ?string,
  target: Node,
};

type QueueItem =
  | {
      type: "Records",
      records: Array<MutationRecord> | Array<Record>,
      recordIndex: number,
      addedNodeIndex: number,
      removedNodeIndex: number,
      childIndex: number,
      children: ?NodeList<HTMLElement>,
      removalsOnly: boolean,
    }
  | {
      type: "ClickableChanged",
      target: EventTarget,
      clickable: boolean,
    }
  | {
      type: "OverflowChanged",
      target: EventTarget,
    };

type MutationType = "added" | "removed" | "changed";

type ShadowRootData = {
  shadowRoot: ShadowRoot,
  mutationObserver: MutationObserver,
  resets: Resets,
  active: boolean,
};

type Deadline = { timeRemaining: () => number, ... };

const infiniteDeadline: Deadline = {
  timeRemaining: () => Infinity,
};

export default class ElementManager {
  onMutationExternal: (Array<MutationRecord>) => mixed;
  queue: Queue<QueueItem> = makeEmptyQueue();
  injectedHasQueue: boolean = false;
  injectedListeners: Map<string, Array<() => mixed>> = new Map();
  elements: Map<HTMLElement, ElementType> = new Map();
  visibleElements: Set<HTMLElement> = new Set();
  visibleFrames: Set<HTMLIFrameElement | HTMLFrameElement> = new Set();
  elementsWithClickListeners: WeakSet<HTMLElement> = new WeakSet();
  elementsWithScrollbars: WeakSet<HTMLElement> = new WeakSet();
  shadowRoots: WeakMap<Element, ShadowRootData> = new WeakMap();
  idleCallbackId: ?IdleCallbackID = undefined;
  bailed: boolean = false;
  secretElementResets: Resets = new Resets();
  resets: Resets = new Resets();

  intersectionObserver: IntersectionObserver = new IntersectionObserver(
    this.onIntersection.bind(this)
  );

  frameIntersectionObserver: IntersectionObserver = new IntersectionObserver(
    this.onFrameIntersection.bind(this)
  );

  mutationObserver: MutationObserver = new MutationObserver(
    this.onMutation.bind(this)
  );

  removalObserver: MutationObserver = new MutationObserver(
    this.onRemoval.bind(this)
  );

  constructor({
    onMutation,
  }: {
    onMutation: (Array<MutationRecord>) => mixed,
  }) {
    this.onMutationExternal = onMutation;

    bind(this, [
      this.onClickableChanged,
      this.onInjectedQueue,
      this.onOverflowChange,
      this.onOpenShadowRootCreated,
      this.onClosedShadowRootCreated,
      this.onRegisterSecretElement,
    ]);
  }

  async start() {
    const { documentElement } = document;
    if (documentElement == null) {
      return;
    }

    // When adding new event listeners, consider also subscribing in
    // `onRegisterSecretElement` and `setShadowRoot`.
    if (BROWSER !== "firefox") {
      this.resets.add(
        addEventListener(
          window,
          CLICKABLE_CHANGED_EVENT,
          this.onClickableChanged
        ),
        addEventListener(window, QUEUE_EVENT, this.onInjectedQueue),
        addEventListener(
          window,
          OPEN_SHADOW_ROOT_CREATED_EVENT,
          this.onOpenShadowRootCreated
        ),
        addEventListener(
          window,
          CLOSED_SHADOW_ROOT_CREATED_1_EVENT,
          this.onClosedShadowRootCreated
        ),
        addEventListener(
          window,
          REGISTER_SECRET_ELEMENT_EVENT,
          this.onRegisterSecretElement
        )
      );
    }
    this.resets.add(
      addEventListener(window, "overflow", this.onOverflowChange),
      addEventListener(window, "underflow", this.onOverflowChange)
    );

    this.injectScript();

    // Wait for tweakable values to load before starting the MutationObserver,
    // in case the user has changed `ATTRIBUTES_MUTATION`. After the
    // MutationObserver has been started, queue all elements and frames added
    // before the observer was running.
    await tMeta.loaded;

    mutationObserve(this.mutationObserver, documentElement);

    // Pick up all elements present in the initial HTML payload. Large HTML
    // pages are usually streamed in chunks. As later chunks arrive and are
    // rendered, each new element will trigger the MutationObserver.
    const records: Array<Record> = [
      {
        addedNodes: [documentElement],
        removedNodes: [],
        attributeName: undefined,
        target: documentElement,
      },
    ];
    this.queueRecords(records);

    for (const frame of document.querySelectorAll("iframe, frame")) {
      this.frameIntersectionObserver.observe(frame);
    }
  }

  stop() {
    if (this.idleCallbackId != null) {
      cancelIdleCallback(this.idleCallbackId);
    }

    this.intersectionObserver.disconnect();
    this.frameIntersectionObserver.disconnect();
    this.mutationObserver.disconnect();
    this.removalObserver.disconnect();
    this.queue = makeEmptyQueue();
    this.injectedHasQueue = false;
    this.injectedListeners = new Map();
    this.elements.clear();
    this.visibleElements.clear();
    this.visibleFrames.clear();
    // `WeakSet`s don’t have a `.clear()` method.
    this.elementsWithClickListeners = new WeakSet();
    this.elementsWithScrollbars = new WeakSet();
    this.shadowRoots = new WeakMap();
    this.idleCallbackId = undefined;
    this.resets.reset();
    this.secretElementResets.reset();
    this.sendInjectedEvent(RESET_EVENT);
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
      t.MAX_INTERSECTION_OBSERVED_ELEMENTS
    );
  }

  injectScript() {
    // Neither Chrome nor Firefox allow inline scripts in the options page. It’s
    // not needed there anyway.
    if (window.location.protocol.endsWith("-extension:")) {
      return;
    }

    if (BROWSER === "firefox") {
      injected(this);
      return;
    }

    const { documentElement } = document;
    if (documentElement == null) {
      return;
    }

    const rawCode = replaceConstants(injected.toString());
    const code = `(${rawCode})()`;
    const script = document.createElement("script");

    // Chrome nicely allows inline scripts inserted by an extension regardless
    // of CSP. I look forward to the day Firefox works this way too. See
    // <bugzil.la/1446231> and <bugzil.la/1267027>.
    script.textContent = code;

    documentElement.append(script);
    script.remove();
  }

  makeStats(durations: Durations): Stats {
    return {
      url: window.location.href,
      numTotalElements: Array.from(this.getAllElements(document)).length,
      numTrackedElements: this.elements.size,
      numVisibleElements: this.visibleElements.size,
      numVisibleFrames: this.visibleFrames.size,
      bailed: this.bailed ? 1 : 0,
      durations,
    };
  }

  *getAllElements(
    node: HTMLElement | Document | ShadowRoot
  ): Generator<HTMLElement, void, void> {
    const children =
      node instanceof ShadowRoot
        ? node.querySelectorAll("*")
        : // This call only takes 0–1 ms even on the single-page HTML
          // specification (which is huge!).
          node.getElementsByTagName("*");

    for (const child of children) {
      yield child;

      const root = this.shadowRoots.get(child);
      if (root != null) {
        yield* this.getAllElements(root.shadowRoot);
      }
    }
  }

  getActiveElement(node: Document | ShadowRoot): ?HTMLElement {
    // $FlowIgnore: Flow doesn’t know about `.activeElement` on `ShadowRoot` yet.
    const { activeElement } = node;
    if (activeElement == null) {
      return undefined;
    }
    const root = this.shadowRoots.get(activeElement);
    if (root != null) {
      return this.getActiveElement(root.shadowRoot);
    }
    return activeElement;
  }

  queueItem(item: QueueItem) {
    this.queue.items.push(item);
    this.requestIdleCallback();
  }

  queueRecords(
    records: Array<MutationRecord> | Array<Record>,
    { removalsOnly = false }: { removalsOnly?: boolean } = {}
  ) {
    if (records.length > 0) {
      this.queueItem({
        type: "Records",
        records,
        recordIndex: 0,
        addedNodeIndex: 0,
        removedNodeIndex: 0,
        childIndex: 0,
        children: undefined,
        removalsOnly,
      });
    }
  }

  requestIdleCallback() {
    if (this.idleCallbackId == null) {
      this.idleCallbackId = requestIdleCallback((deadline) => {
        this.idleCallbackId = undefined;
        this.flushQueue(deadline);
      });
    }
  }

  onIntersection(entries: Array<IntersectionObserverEntry>) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        this.visibleElements.add(entry.target);
      } else {
        this.visibleElements.delete(entry.target);
      }
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
    if (records.length > 0) {
      this.queueRecords(records);
      this.observeRemovals(records);
      this.onMutationExternal(records);
    }
  }

  onRemoval(records: Array<MutationRecord>) {
    this.queueRecords(records, {
      // Ignore added nodes and changed attributes.
      removalsOnly: true,
    });
    this.observeRemovals(records);
  }

  // Imagine this scenario:
  //
  // 1. A grand-parent of a clickable element is removed.
  // 2. This triggers `onMutation`.
  // 3. The page removes the clickable element (or a parent of it) from the
  //    grand-parent for some reason (even though the grand-parent is already
  //    removed from the DOM).
  // 4. This does not trigger `onMutation`, since it listens to changes inside
  //    `documentElement`, but this happens in a detached tree.
  // 5. The queue is flushed. Running `.querySelectorAll("*")` on the
  //    grand-parent now won’t include the clickable element, leaving it behind in
  //    `this.elements` even though it has been removed.
  //
  // For this reason, we have to immediately observe all removed nodes for more
  // removals in their subtree, so that we don’t miss any removed elements.
  // MutationObservers don’t have an `.unobserve` method, so all of these are
  // unsubscribed in bulk when `this.queue` is emptied by calling
  // `.disconnect()`.
  observeRemovals(records: Array<MutationRecord>) {
    for (const record of records) {
      for (const node of record.removedNodes) {
        this.removalObserver.observe(node, {
          childList: true,
          subtree: true,
        });
      }
    }
  }

  onClickableChanged(event: CustomEvent) {
    this.onInjectedMessage({
      type: "ClickableChanged",
      target: getTarget(event),
      clickable: Boolean(event.detail),
    });
  }

  onInjectedQueue(event: CustomEvent) {
    this.onInjectedMessage({ type: "Queue", hasQueue: Boolean(event.detail) });
  }

  onOpenShadowRootCreated(event: CustomEvent) {
    const target = getTarget(event);
    if (target instanceof HTMLElement) {
      const { shadowRoot } = target;
      if (shadowRoot != null) {
        log("log", "ElementManager#onOpenShadowRootCreated", shadowRoot);
        this.onInjectedMessage({ type: "ShadowRootCreated", shadowRoot });
      }
    }
  }

  onClosedShadowRootCreated(event: CustomEvent) {
    const target = getTarget(event);
    if (target instanceof HTMLElement) {
      // Closed shadow roots are reported in two phases. First, a temporary
      // element is created and `CLOSED_SHADOW_ROOT_CREATED_1_EVENT` is
      // dispatched on it. That’s `target` here.
      // Then, the temporary element is moved into the closed shadow root and
      // `CLOSED_SHADOW_ROOT_CREATED_2_EVENT` is dispatched on it. Now we can
      // call `target.getRootNode()` to obtain the closed shadow root.
      // So why are two phases needed? In `CLOSED_SHADOW_ROOT_CREATED_2_EVENT`,
      // we can never get a reference to the temporary element, because that’s
      // how closed shadow roots work. Events from within closed shadow roots
      // appear to come from its host element.
      target.addEventListener(
        CLOSED_SHADOW_ROOT_CREATED_2_EVENT,
        () => {
          // This has to be done immediately (cannot be done when flushing the
          // queue), since `target` is a temporary element that is removed just
          // after this event listener is finished.
          const root = target.getRootNode();
          if (root instanceof ShadowRoot) {
            log("log", "ElementManager#onClosedShadowRootCreated", root);
            this.onInjectedMessage({
              type: "ShadowRootCreated",
              shadowRoot: root,
            });
          }
        },
        { capture: true, passive: true, once: true }
      );
    }
  }

  onRegisterSecretElement(event: CustomEvent) {
    const target = getTarget(event);
    if (target instanceof HTMLElement) {
      log("log", "ElementManager#onRegisterSecretElement", target);
      this.secretElementResets.reset();
      this.secretElementResets.add(
        addEventListener(
          target,
          CLICKABLE_CHANGED_EVENT,
          this.onClickableChanged
        ),
        addEventListener(
          target,
          OPEN_SHADOW_ROOT_CREATED_EVENT,
          this.onOpenShadowRootCreated
        ),
        addEventListener(
          target,
          CLOSED_SHADOW_ROOT_CREATED_1_EVENT,
          this.onClosedShadowRootCreated
        )
      );
    }
  }

  onOverflowChange(event: UIEvent) {
    const target = getTarget(event);
    this.queueItem({ type: "OverflowChanged", target });
  }

  onInjectedMessage(message: FromInjected) {
    switch (message.type) {
      case "ClickableChanged":
        this.queueItem(message);
        break;

      case "ShadowRootCreated":
        this.setShadowRoot(message.shadowRoot);
        break;

      case "Queue":
        this.injectedHasQueue = message.hasQueue;
        break;

      default:
        unreachable(message.type, message);
    }
  }

  addEventListener(eventName: string, fn: () => mixed) {
    const previous = this.injectedListeners.get(eventName) || [];
    this.injectedListeners.set(eventName, previous.concat(fn));
  }

  sendInjectedEvent(eventName: string) {
    if (BROWSER === "firefox") {
      const listeners = this.injectedListeners.get(eventName) || [];
      for (const listener of listeners) {
        listener();
      }
    } else {
      document.dispatchEvent(new CustomEvent(eventName));
    }
  }

  setShadowRoot(shadowRoot: ShadowRoot) {
    // MutationObservers don’t have an `.unobserve` method, so each shadow root
    // has its own MutationObserver, which can be `.disconnect()`:ed when hosts
    // are removed.
    const mutationObserver = new MutationObserver(this.onMutation.bind(this));
    const resets = new Resets();

    mutationObserve(mutationObserver, shadowRoot);

    resets.add(
      addEventListener(shadowRoot, "overflow", this.onOverflowChange),
      addEventListener(shadowRoot, "underflow", this.onOverflowChange)
    );

    this.shadowRoots.set(shadowRoot.host, {
      shadowRoot,
      mutationObserver,
      resets,
      active: true,
    });

    // Note that when shadow roots are brand new (just created by
    // `.attachShadow`), `childNodes` is always empty since the page hasn’t had
    // time to add any nodes to it yet. But if a shadow dom host element is
    // removed from the page and then re-inserted again then there _are_
    // elements in there that need to be queued.
    const { childNodes } = shadowRoot;
    if (childNodes.length > 0) {
      const records: Array<Record> = [
        {
          addedNodes: childNodes,
          removedNodes: [],
          attributeName: undefined,
          target: shadowRoot,
        },
      ];
      this.queueRecords(records);
    }
  }

  // Note that shadow roots are not removed from `this.shadowRoots` when their
  // host elements are removed, in case the host elements are inserted back into
  // the page. If so, we need access to closed shadow roots again. Since
  // `this.shadowRoots` is a `WeakMap`, items should disappear from it
  // automatically as the host elements are garbage collected.
  deactivateShadowRoot(root: ShadowRootData) {
    root.mutationObserver.disconnect();
    root.resets.reset();
    root.active = false;

    const { childNodes } = root.shadowRoot;
    if (childNodes.length > 0) {
      const records: Array<Record> = [
        {
          addedNodes: [],
          removedNodes: childNodes,
          attributeName: undefined,
          target: root.shadowRoot,
        },
      ];
      this.queueRecords(records);
    }
  }

  addOrRemoveElement(mutationType: MutationType, element: HTMLElement) {
    if (
      element instanceof HTMLIFrameElement ||
      element instanceof HTMLFrameElement
    ) {
      switch (mutationType) {
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
          unreachable(mutationType);
      }
      return;
    }

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
      const alreadyIntersectionObserved = this.elements.has(element);
      this.elements.set(element, type);
      if (!alreadyIntersectionObserved && !this.bailed) {
        // We won’t know if this element is visible or not until the next time
        // intersection observers are run. If we enter hints mode before that,
        // we would miss this element. This happens a lot on Gmail. First, the
        // intersection observer fires on the splash screen. Then _a lot_ of DOM
        // nodes appear at once when the inbox renders. The mutation observer
        // fires kind of straight away, but the intersection observer is slow.
        // If hints mode was entered before that, no elements would be found.
        // But the elements are clearly visible on screen! For this reason we
        // consider _all_ new elements as visible until proved otherwise.
        this.visibleElements.add(element);
        this.intersectionObserver.observe(element);
        if (this.elements.size > t.MAX_INTERSECTION_OBSERVED_ELEMENTS.value) {
          this.bail();
        }
      }
    }

    if (mutationType === "added") {
      const root = this.shadowRoots.get(element);
      if (root != null) {
        if (!root.active) {
          // If an element has been removed and then re-inserted again, set up
          // tracking of its shadow root again (if any). However, when
          // `someElement.attachShadow()` is called, `someElement` might
          // already have been in the queue. So if the tracking of the shadow
          // root is already active, there’s no need to do it again.
          this.setShadowRoot(root.shadowRoot);
        }
      } else if (element.shadowRoot != null) {
        // Just after the extension is installed or updated, we might have
        // missed a bunch of `.attachShadow` calls. Luckily, we can still get
        // _open_ shadow roots through the `.shadowRoot` property.
        this.setShadowRoot(element.shadowRoot);
      }
    } else if (mutationType === "removed") {
      const root = this.shadowRoots.get(element);
      if (root != null) {
        this.deactivateShadowRoot(root);
      }
    }
  }

  flushQueue(deadline: Deadline) {
    const startQueueIndex = this.queue.index;

    log(
      "debug",
      "ElementManager#flushQueue",
      { length: this.queue.items.length, index: startQueueIndex },
      { ...this.queue.items[startQueueIndex] }
    );

    for (; this.queue.index < this.queue.items.length; this.queue.index++) {
      if (this.queue.index > startQueueIndex && deadline.timeRemaining() <= 0) {
        this.requestIdleCallback();
        return;
      }

      const item = this.queue.items[this.queue.index];

      switch (item.type) {
        // This case is really tricky as all of the loops need to be able to
        // resume where they were during the last idle callback. That’s why we
        // mutate stuff on the current item, saving the indexes for the next
        // idle callback. Be careful not to cause duplicate work.
        case "Records": {
          const startRecordIndex = item.recordIndex;

          for (; item.recordIndex < item.records.length; item.recordIndex++) {
            if (
              item.recordIndex > startRecordIndex &&
              deadline.timeRemaining() <= 0
            ) {
              this.requestIdleCallback();
              return;
            }

            const record = item.records[item.recordIndex];
            const startAddedNodeIndex = item.addedNodeIndex;
            const startRemovedNodeIndex = item.removedNodeIndex;

            if (!item.removalsOnly) {
              for (
                ;
                item.addedNodeIndex < record.addedNodes.length;
                item.addedNodeIndex++
              ) {
                if (
                  item.addedNodeIndex > startAddedNodeIndex &&
                  deadline.timeRemaining() <= 0
                ) {
                  this.requestIdleCallback();
                  return;
                }

                const element = record.addedNodes[item.addedNodeIndex];
                let { children } = item;

                if (children == null && element instanceof HTMLElement) {
                  // When a streaming HTML chunk arrives, _all_ elements in it
                  // will produce its own MutationRecord, even nested elements.
                  // Parent elements come first. Since we do a
                  // `element.querySelectorAll("*")` below, after processing the
                  // first element we have already gone through that entire
                  // subtree. So the next MutationRecord (for a child of the
                  // first element) will be duplicate work. So if we’ve already
                  // gone through an addition of an element in this queue,
                  // simply skip to the next one.
                  // When inserting elements with JavaScript, the number of
                  // MutationRecords for an insert depends on how the code was
                  // written. Every `.append()` on an element that is in the DOM
                  // causes a record. But `.append()` on a non-yet-inserted
                  // element does not. So we can’t simply skip the
                  // `.querySelectorAll("*")` business.
                  // It should be safe to keep the `.addedElements` set even
                  // though the queue lives over time. If an already gone
                  // through element is changed, that will cause removal or
                  // attribute mutations, which will be run eventually.
                  if (this.queue.addedElements.has(element)) {
                    continue;
                  }

                  // In my testing on the single-page HTML specification (which
                  // is huge!), `.getElementsByTagName("*")` is faster, but it’s
                  // not like `.querySelectorAll("*")` is super slow. We can’t use
                  // the former because it returns a live `HTMLCollection` which
                  // mutates as the DOM mutates. If for example a bunch of nodes
                  // are removed, `item.addedNodeIndex` could now be too far
                  // ahead in the list, missing some added elements.
                  children = element.querySelectorAll("*");
                  item.children = children;

                  this.addOrRemoveElement("added", element);
                  this.queue.addedElements.add(element);

                  if (deadline.timeRemaining() <= 0) {
                    this.requestIdleCallback();
                    return;
                  }
                }

                if (children != null && children.length > 0) {
                  const startChildIndex = item.childIndex;
                  for (; item.childIndex < children.length; item.childIndex++) {
                    if (
                      item.childIndex > startChildIndex &&
                      deadline.timeRemaining() <= 0
                    ) {
                      this.requestIdleCallback();
                      return;
                    }
                    const child = children[item.childIndex];
                    if (!this.queue.addedElements.has(child)) {
                      this.addOrRemoveElement("added", child);
                      this.queue.addedElements.add(child);
                    }
                  }
                }

                item.childIndex = 0;
                item.children = undefined;
              }
            }

            for (
              ;
              item.removedNodeIndex < record.removedNodes.length;
              item.removedNodeIndex++
            ) {
              if (
                item.removedNodeIndex > startRemovedNodeIndex &&
                deadline.timeRemaining() <= 0
              ) {
                this.requestIdleCallback();
                return;
              }

              const element = record.removedNodes[item.removedNodeIndex];
              let { children } = item;

              if (children == null && element instanceof HTMLElement) {
                children = element.querySelectorAll("*");
                item.children = children;
                this.addOrRemoveElement("removed", element);
                this.queue.addedElements.delete(element);
                if (deadline.timeRemaining() <= 0) {
                  this.requestIdleCallback();
                  return;
                }
              }

              if (children != null && children.length > 0) {
                const startChildIndex = item.childIndex;
                for (; item.childIndex < children.length; item.childIndex++) {
                  if (
                    item.childIndex > startChildIndex &&
                    deadline.timeRemaining() <= 0
                  ) {
                    this.requestIdleCallback();
                    return;
                  }
                  const child = children[item.childIndex];
                  this.addOrRemoveElement("removed", child);
                  // The same element might be added, removed and then added
                  // again, all in the same queue. So unmark it as already gone
                  // through so it can be re-added again.
                  this.queue.addedElements.delete(child);
                }
              }

              item.childIndex = 0;
              item.children = undefined;
            }

            item.addedNodeIndex = 0;
            item.removedNodeIndex = 0;

            if (!item.removalsOnly && record.attributeName != null) {
              const element = record.target;
              if (element instanceof HTMLElement) {
                this.addOrRemoveElement("changed", element);
              }
            }
          }
          break;
        }

        case "ClickableChanged": {
          const element = item.target;
          if (element instanceof HTMLElement) {
            if (item.clickable) {
              this.elementsWithClickListeners.add(element);
            } else {
              this.elementsWithClickListeners.delete(element);
            }
            this.addOrRemoveElement("changed", element);
          }
          break;
        }

        case "OverflowChanged": {
          const element = item.target;
          if (element instanceof HTMLElement) {
            // An element might have `overflow-x: hidden; overflow-y: auto;`. The events
            // don't tell which direction changed its overflow, so we must check that
            // ourselves. We're only interested in elements with scrollbars, not with
            // hidden overflow.
            if (isScrollable(element)) {
              if (!this.elementsWithScrollbars.has(element)) {
                this.elementsWithScrollbars.add(element);
                this.addOrRemoveElement("changed", element);
              }
            } else if (this.elementsWithScrollbars.has(element)) {
              this.elementsWithScrollbars.delete(element);
              this.addOrRemoveElement("changed", element);
            }
          }
          break;
        }

        default:
          unreachable(item.type, item);
      }
    }

    this.queue = makeEmptyQueue();
    this.removalObserver.disconnect();
    log("debug", "ElementManager#flushQueue", "Empty queue.");
  }

  getVisibleElements(
    types: ElementTypes,
    viewports: Array<Box>,
    time: TimeTracker,
    passedCandidates?: Array<HTMLElement>
  ): [Array<?VisibleElement>, number] {
    const startTime = Date.now();

    const isUpdate = passedCandidates != null;
    const prefix = `ElementManager#getVisibleElements${
      isUpdate ? " (update)" : ""
    }`;

    time.start("flush queues");

    const injectedNeedsFlush = this.injectedHasQueue;

    if (injectedNeedsFlush) {
      log("log", prefix, "flush injected");
      this.sendInjectedEvent(FLUSH_EVENT);
    }

    this.onMutation(this.mutationObserver.takeRecords());

    // If `injectedNeedsFlush` then `this.queue` will be modified, so check the
    // length _after_ flushing injected.js.
    const needsFlush = this.queue.items.length > 0;

    if (needsFlush) {
      log("log", prefix, "flush queue", this.queue);
      this.flushQueue(infiniteDeadline);
    }

    this.onIntersection(this.intersectionObserver.takeRecords());

    const candidates =
      passedCandidates != null
        ? passedCandidates
        : types === "selectable"
        ? this.getAllElements(document)
        : this.bailed
        ? this.elements.keys()
        : this.visibleElements;
    const range = document.createRange();
    const deduper = new Deduper();

    const maybeResults: Array<VisibleElement | Rejected> = Array.from(
      candidates,
      (element) => {
        time.start("loop:start");

        const duration = Date.now() - startTime;
        if (duration > t.MAX_DURATION.value) {
          return {
            isRejected: true,
            debug: {
              reason: "slow",
              duration,
              max: t.MAX_DURATION.value,
              element,
            },
          };
        }

        const type: ?ElementType =
          types === "selectable"
            ? this.getElementTypeSelectable(element)
            : this.elements.get(element);

        if (type == null) {
          return {
            isRejected: true,
            debug: {
              reason: "no ElementType",
              element,
            },
          };
        }

        if (types !== "selectable" && !types.includes(type)) {
          return {
            isRejected: true,
            debug: {
              reason: "wrong ElementType",
              type,
              types,
              element,
            },
          };
        }

        // Ignore `<label>` elements with no control and no click listeners.
        if (
          type === "label" &&
          element instanceof HTMLLabelElement &&
          element.control == null
        ) {
          return {
            isRejected: true,
            debug: {
              reason: "<label> with no control and no click listeners",
              element,
            },
          };
        }

        time.start("loop:measurements");
        const measurements = getMeasurements(
          element,
          type,
          viewports,
          range,
          time
        );

        if (measurements.isRejected) {
          return {
            isRejected: true,
            debug: {
              reason: "no measurements",
              type,
              element,
              viewports,
              inner: measurements.debug,
            },
          };
        }

        time.start("loop:visibleElement");
        const visibleElement: VisibleElement = {
          element,
          type,
          measurements,
          hasClickListener: this.elementsWithClickListeners.has(element),
        };

        time.start("loop:dedupe");
        // In selectable mode we need to be able to select `<label>` text, and
        // click listeners aren't taken into account at all, so skip the deduping.
        // Also, a paragraph starting with an inline element shouldn't be deduped
        // away – both should be selectable.
        if (types !== "selectable") {
          deduper.add(visibleElement);
        }

        return visibleElement;
      }
    );

    log("log", prefix, "results (including rejected)", maybeResults);

    time.start("check duration");
    const slow = maybeResults.filter(
      (result) => result.isRejected && result.debug.reason === "slow"
    ).length;
    if (slow > 0) {
      log("warn", prefix, `Skipped ${slow} element(s) due to timeout`, {
        duration: Date.now() - startTime,
        max: t.MAX_DURATION.value,
      });
    }

    time.start("filter");
    const results = maybeResults.map((result) =>
      result.isRejected || deduper.rejects(result) ? undefined : result
    );

    const timeLeft = t.MAX_DURATION.value - (Date.now() - startTime);
    return [results, timeLeft];
  }

  getVisibleFrames(
    viewports: Array<Box>
  ): Array<HTMLIFrameElement | HTMLFrameElement> {
    // In theory this might need flushing, but in practice this method is always
    // called _after_ `getVisibleElements`, so everything should already be
    // flushed.
    return Array.from(this.visibleFrames, (element) => {
      if (
        // Needed on reddit.com. There's a Google Ads iframe where
        // `contentWindow` is null.
        element.contentWindow == null
      ) {
        return undefined;
      }

      const box = getVisibleBox(element.getBoundingClientRect(), viewports);

      // Frames are slow to visit. Gmail has ~10 weird frames that are super
      // small. Not sure what they do. But not visiting those saves around ~80ms
      // on my machine.
      if (
        box == null ||
        box.width < t.MIN_SIZE_FRAME.value ||
        box.height < t.MIN_SIZE_FRAME.value
      ) {
        return undefined;
      }

      const elementsAtPoint = getElementsFromPoint(
        element,
        Math.round(box.x + box.width / 2),
        Math.round(box.y + box.height / 2)
      );

      // Make sure that the frame is visible – for example, not `visibility:
      // hidden`. Frames are generally quite large and might be partially
      // covered at different spots, but we can’t know if those spots cover
      // links or not.
      if (!elementsAtPoint.includes(element)) {
        return undefined;
      }

      return element;
    }).filter(Boolean);
  }

  getElementType(element: HTMLElement): ?ElementType {
    if (isDisabled(element)) {
      return undefined;
    }

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
        // Note: For SVG elements, `.contentEditable` is `undefined`.
        if (
          element.contentEditable != null &&
          !t.VALUES_NON_CONTENTEDITABLE.value.has(element.contentEditable)
        ) {
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

        const role = element.getAttribute("role");
        if (role != null && t.ROLES_CLICKABLE.value.has(role)) {
          return "clickable";
        }

        // "clickable-event" matched in the next `if` is the lowest quality and
        // has the biggest risk of false positives. Make sure that some of them
        // don’t get hints.
        if (
          Array.from(t.ATTRIBUTES_NOT_CLICKABLE.value).some((attr) =>
            element.hasAttribute(attr)
          )
        ) {
          return undefined;
        }

        if (
          hasClickListenerProp(element) ||
          this.elementsWithClickListeners.has(element) ||
          Array.from(t.ATTRIBUTES_CLICKABLE.value).some((attr) =>
            element.hasAttribute(attr)
          )
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

  getElementTypeSelectable(element: HTMLElement): ?ElementType {
    // A shadow host element usually has 0 children, but it _can_ have children,
    // although they are never displayed. So it never makes sense to consider
    // shadow hosts selectable.
    if (isDisabled(element) || this.shadowRoots.has(element)) {
      return undefined;
    }

    switch (element.nodeName) {
      // Always consider the following elements as selectable, regardless of their
      // children, since they have special context menu items. A
      // `<canvas><p>fallback</p></canvas>` could be considered a wrapper element
      // and be skipped otherwise. Making frames selectable also allows Chrome
      // users to scroll frames using the arrow keys. It would be convenient to
      // give frames hints during regular click hints mode for that reason, but
      // unfortunately for example Twitter uses iframes for many of its little
      // widgets/embeds which would result in many unnecessary/confusing hints.
      case "A":
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
      case "PRE":
      case "svg": // SVG `.nodeName` is actually lowercase.
        return "selectable";
      default: {
        // If an element has no child _elements_ (but possibly child text nodes),
        // consider it selectable. This allows focusing `<div>`-based "buttons"
        // with only a background image as icon inside. It also catches many
        // elements with text without having to iterate through all child text
        // nodes.
        if (element.childElementCount === 0 && element instanceof HTMLElement) {
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
}

type Queue<T> = {
  items: Array<T>,
  index: number,
  addedElements: Set<HTMLElement>,
};

function makeEmptyQueue<T>(): Queue<T> {
  return {
    items: [],
    index: 0,
    addedElements: new Set(),
  };
}

// Attempt to remove hints that do the same thing as some other element
// (`<label>`–`<input>` pairs) or hints that are most likely false positives
// (`<div>`s with click listeners wrapping a `<button>`).
class Deduper {
  positionMap: Map<string, Array<VisibleElement>> = new Map();
  rejected: Set<HTMLElement> = new Set();

  add(visibleElement: VisibleElement) {
    const { element } = visibleElement;

    // Exclude `<label>` elements whose associated control has a hint.
    const labels = getLabels(element);
    if (labels != null) {
      for (const label of labels) {
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
      t.ELEMENT_TYPES_LOW_QUALITY.value.has(type)
    );

    // If hints are positioned in the exact same spot, reject those of low
    // quality (for example those that only have click listeners and nothing
    // else) since they are likely just noise. Many `<button>`s and `<a>`s on
    // Twitter and Gmail are wrapped in `<div>`s with click listeners. And on
    // GitHub there are dropdown menus near the top where the hint for the
    // `<summary>` elements that open them are covered by the hint for a
    // `<details>` element with a click listener that doesn't do anything when
    // clicked.
    if (bad.length > 0) {
      if (good.length > 0) {
        // If there are high quality elements, reject all low quality ones.
        for (const { element: badElement } of bad) {
          this.rejected.add(badElement);
        }
      } else {
        // Otherwise keep the best of the worst.
        const sorted = bad.slice().sort((a, b) =>
          // Prefer elements with click listeners.
          a.hasClickListener && !b.hasClickListener
            ? -1
            : !a.hasClickListener && b.hasClickListener
            ? 1
            : // Then, prefer elements with higher weight.
              b.measurements.weight - a.measurements.weight
        );
        for (const { element: badElement } of sorted.slice(1)) {
          this.rejected.add(badElement);
        }
      }
    }
  }

  rejects({ element }: VisibleElement): boolean {
    return this.rejected.has(element);
  }
}

function hintPositionKey(measurements: HintMeasurements): string {
  return [
    Math.round(measurements.x).toString(),
    Math.round(measurements.y).toString(),
    measurements.align,
  ].join(",");
}

function getMeasurements(
  element: HTMLElement,
  elementType: ElementType,
  viewports: Array<Box>,
  // The `range` is passed in since it is faster to re-use the same one than
  // creating a new one for every element candidate.
  range: Range,
  time: TimeTracker
): HintMeasurements | Rejected {
  // If an inline `<a>` wraps a block `<div>`, the link gets three rects. The
  // first and last have 0 width. The middle is the "real" one. Remove the
  // "empty" ones, so that the link is considered a "card" and not a
  // line-wrapped text link.
  time.start("measurements:rects");
  const allRects = Array.from(element.getClientRects());
  const filteredRects = allRects.filter(
    (rect) =>
      rect.width >= t.MIN_SIZE_TEXT_RECT.value &&
      rect.height >= t.MIN_SIZE_TEXT_RECT.value
  );
  // For links with only floated children _all_ rects might have 0 width/height.
  // In that case, use the "empty" ones after all. Floated children is handled
  // further below.
  const rects = filteredRects.length > 0 ? filteredRects : allRects;

  // Ignore elements with only click listeners that are really large. These are
  // most likely not clickable, and only used for event delegation.
  time.start("measurements:large-clickable");
  if (elementType === "clickable-event" && rects.length === 1) {
    if (area(rects[0]) > t.MAX_CLICKABLE_EVENT_AREA.value) {
      return {
        isRejected: true,
        debug: {
          reason: "element with only click listeners that is really large",
          rect: rects[0],
          max: t.MAX_CLICKABLE_EVENT_AREA.value,
        },
      };
    }
  }

  time.start("measurements:offsets");
  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

  time.start("measurements:visibleBoxes");
  const visibleBoxes = Array.from(rects, (rect) =>
    getVisibleBox(rect, viewports)
  )
    .filter(Boolean)
    // Remove `offsetX` and `offsetY` to turn `x` and `y` back to the coordinate
    // system of the current frame. This is so we can easily make comparisons
    // with other rects of the frame.
    .map((box) => ({ ...box, x: box.x - offsetX, y: box.y - offsetY }));

  time.start("measurements:noVisibleBoxes");
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
            range,
            time
          );
          if (!measurements.isRejected) {
            return measurements;
          }
        }
      }
    }

    return {
      isRejected: true,
      debug: {
        reason: "no visibleBoxes",
        rects,
      },
    };
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
          time,
        })
      : getMultiRectPoint({ element, visibleBoxes, viewports, range, time });

  const maxX = Math.max(...visibleBoxes.map((box) => box.x + box.width));

  // Check that the element isn’t covered. A little bit expensive, but totally
  // worth it since it makes hints in fixed menus so much easier find.
  // If this runs in a frame, the element can still be covered by something in a
  // parent frame, but it's not worth the trouble to try and check that.
  const nonCoveredPoint = getNonCoveredPoint(element, {
    // Rounding upwards is required in html/tridactyl/index.html.
    x: Math.ceil(hintPoint.x),
    y: Math.round(hintPoint.y),
    maxX,
    time,
  });

  time.start("measurements:noNonCoveredPoint");
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
        range,
        time
      );
      return measurements.isRejected
        ? {
            ...measurements,
            debug: {
              reason: "wrapped file input without nonCoveredPoint",
              inner: measurements.debug,
            },
          }
        : measurements;
    }

    // CodeMirror editor uses a tiny hidden textarea positioned at the caret.
    // Targeting those are the only reliable way of focusing CodeMirror
    // editors, and doing so without moving the caret.
    // <https://codemirror.net/demo/complete.html>
    if (
      !(
        element.nodeName === "TEXTAREA" &&
        // Use `element.clientWidth` instead of `pointBox.width` because the
        // latter includes the width of the borders of the textarea, which are
        // unreliable.
        element.clientWidth <= 1
      )
    ) {
      return {
        isRejected: true,
        debug: {
          reason: "no nonCoveredPoint",
          visibleBoxes,
          hintPoint,
          maxX,
        },
      };
    }
  }

  time.start("measurements:end");
  const { x, y } = nonCoveredPoint == null ? hintPoint : nonCoveredPoint;

  // Where to place the hint and the weight of the element.
  return {
    x: x + offsetX,
    y: y + offsetY,
    align: hintPoint.align,
    maxX: maxX + offsetX,
    weight: hintWeight(elementType, visibleBoxes),
    debug: hintPoint.debug,
  };
}

function getSingleRectPoint({
  element,
  elementType,
  rect,
  visibleBox,
  viewports,
  range,
  time,
}: {
  element: HTMLElement,
  elementType: ElementType,
  rect: ClientRect,
  visibleBox: Box,
  viewports: Array<Box>,
  range: Range,
  time: TimeTracker,
}): Point {
  // Scrollbars are usually on the right side, so put the hint there, making it
  // easier to see that the hint is for scrolling and reducing overlap.
  time.start("getSingleRectPoint:scrollable");
  if (elementType === "scrollable") {
    return {
      ...getXY(visibleBox),
      x: visibleBox.x + visibleBox.width - 1,
      align: "right",
      debug: "getSingleRectPoint scrollable",
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
  time.start("getSingleRectPoint:tall");
  if (
    elementType === "textarea" ||
    (elementType !== "selectable" && rect.height >= t.MIN_HEIGHT_BOX.value)
  ) {
    return {
      ...getXY(visibleBox),
      align: "left",
      debug: `getSingleRectPoint tall (elementType: ${elementType}, height: ${rect.height})`,
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
  // Also, ignore fallback content inside `<canvas>`, `<audio>` and `<video>`.
  time.start("getSingleRectPoint:textPoint");
  if (!SKIP_TEXT_ELEMENTS.has(element.nodeName)) {
    const textPoint = getBestNonEmptyTextPoint({
      element,
      elementRect: rect,
      viewports,
      isAcceptable,
      preferTextStart: elementType === "selectable",
      range,
    });

    if (textPoint != null) {
      return {
        ...textPoint,
        debug: `getSingleRectPoint textPoint: ${textPoint.debug}`,
      };
    }
  }

  // Try to place the hint near an image. Many buttons have just an icon and no
  // (visible) text.
  time.start("getSingleRectPoint:imagePoint");
  const imagePoint = getFirstImagePoint(element, viewports);
  if (
    imagePoint != null &&
    // For images that are taller than the element, allow the point to be
    // outside the rects. It's common to find `p > a > img` where the `<a>` is
    // just a regular inline element with the `<img>` sticking out the top.
    (isAcceptable(imagePoint.point) || rect.height < imagePoint.rect.height)
  ) {
    return {
      ...imagePoint.point,
      debug: `getSingleRectPoint imagePoint: ${imagePoint.point.debug}`,
    };
  }

  // Checkboxes and radio buttons are typically small and we don't want to cover
  // them with the hint.
  time.start("getSingleRectPoint:checkbox/radio");
  if (
    element instanceof HTMLInputElement &&
    (element.type === "checkbox" || element.type === "radio")
  ) {
    return {
      ...getXY(visibleBox),
      align: "right",
      debug: "getSingleRectPoint checkbox/radio",
    };
  }

  // Take border and padding into account. This is nice since it places the hint
  // nearer the placeholder in `<input>` elements and nearer the text in `<input
  // type="button">` and `<select>`.
  time.start("getSingleRectPoint:borderAndPaddingPoint");
  if (element.nodeName === "INPUT" || element.nodeName === "SELECT") {
    const borderAndPaddingPoint = getBorderAndPaddingPoint(
      element,
      rect,
      visibleBox
    );
    if (isAcceptable(borderAndPaddingPoint)) {
      return {
        ...borderAndPaddingPoint,
        debug: `getSingleRectPoint borderAndPaddingPoint (nodeName: ${element.nodeName}): ${borderAndPaddingPoint.debug}`,
      };
    }
  }

  time.start("getSingleRectPoint:default");
  return {
    ...getXY(visibleBox),
    align: "left",
    debug: "getSingleRectPoint default",
  };
}

function getMultiRectPoint({
  element,
  visibleBoxes,
  viewports,
  range,
  time,
}: {
  element: HTMLElement,
  visibleBoxes: Array<Box>,
  viewports: Array<Box>,
  range: Range,
  time: TimeTracker,
}): Point {
  function isAcceptable(point: Point): boolean {
    return visibleBoxes.some((box) => isWithin(point, box));
  }

  time.start("getMultiRectPoint:textPoint");
  const textPoint = getBestNonEmptyTextPoint({
    element,
    elementRect: element.getBoundingClientRect(),
    viewports,
    isAcceptable,
    preferTextStart: true,
    range,
  });
  if (textPoint != null) {
    return {
      ...textPoint,
      debug: `getMultiRectPoint textPoint: ${textPoint.debug}`,
    };
  }

  time.start("getMultiRectPoint:default");
  const minY = Math.min(...visibleBoxes.map((box) => box.y));
  const maxY = Math.max(...visibleBoxes.map((box) => box.y + box.height));

  return {
    x: Math.min(...visibleBoxes.map((box) => box.x)),
    y: (minY + maxY) / 2,
    align: "right",
    debug: "getMultiRectPoint default",
  };
}

function getFirstImagePoint(
  element: HTMLElement,
  viewports: Array<Box>
): ?{ point: Point, rect: ClientRect } {
  const images = [
    // First try to find an image _child._ For example, <button
    // class="icon-button"><img></button>`. (This button should get the hint at
    // the image, not at the edge of the button.)
    ...element.querySelectorAll(t.SELECTOR_IMAGE.value),
    // Then, see if the element itself is an image. For example, `<button
    // class="Icon Icon-search"></button>`. The element itself can also be an
    // `<img>` due to the `float` case in `getMeasurements`.
    ...(element.matches(t.SELECTOR_IMAGE.value) ? [element] : []),
  ];

  // Some buttons on Twitter have two icons inside – one shown, one hidden (and
  // it toggles between them based on if the button is active or not). At least
  // for now we just pick the first image (in DOM order) that gets a
  // `visibleBox`, but there might be a more clever way of doing it.
  for (const image of images) {
    const rect = image.getBoundingClientRect();
    const visibleBox = getVisibleBox(rect, viewports);

    if (visibleBox != null) {
      const borderAndPaddingPoint = getBorderAndPaddingPoint(
        image,
        rect,
        visibleBox
      );
      return {
        point: {
          // The image might have padding around it.
          ...borderAndPaddingPoint,
          align: rect.height >= t.MIN_HEIGHT_BOX.value ? "left" : "right",
          debug: `getFirstImagePoint borderAndPaddingPoint: ${borderAndPaddingPoint.debug}`,
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
    parseFloat(computedStyle.getPropertyValue("padding-left")) +
    parseFloat(computedStyle.getPropertyValue("text-indent"));

  return {
    ...getXY(visibleBox),
    x: rect.left + left,
    align:
      element instanceof HTMLInputElement &&
      (element.type === "file" ||
        (element.type === "image" && element.src !== ""))
        ? "left"
        : "right",
    debug: `getBorderAndPaddingPoint default/only (left: ${left})`,
  };
}

function getNonCoveredPoint(
  element: HTMLElement,
  {
    x,
    y,
    maxX,
    time,
  }: { x: number, y: number, maxX: number, time: TimeTracker }
): ?{ x: number, y: number } {
  time.start("getNonCoveredPoint:getElementFromPoint");
  const elementAtPoint = getElementFromPoint(element, x, y);

  // (x, y) is off-screen.
  if (elementAtPoint == null) {
    return undefined;
  }

  // `.contains` also checks `element === elementAtPoint`.
  time.start("getNonCoveredPoint:contains");
  if (element.contains(elementAtPoint)) {
    return { x, y };
  }

  time.start("getNonCoveredPoint:getBoundingClientRect");
  // If we found something inside an SVG but not looking for an SVG element,
  // then look to the right of the actual SVG container (such as an icon),
  // rather than at the right of some random path inside the SVG.
  const parent =
    element instanceof HTMLElement &&
    elementAtPoint instanceof SVGElement &&
    elementAtPoint.ownerSVGElement != null
      ? elementAtPoint.ownerSVGElement
      : elementAtPoint;
  const rect = parent.getBoundingClientRect();

  // `.getBoundingClientRect()` does not include pseudo-elements that are
  // absolutely positioned so that they go outside of the element, but calling
  // `.elementFromPoint()` on the pseudo-element _does_ return the element. For
  // `/###\`-looking tabs, which overlap each other slightly, the slanted parts
  // are often made using pseudo-elements. When trying to position a hint for
  // tab 2, `.elementFromPoint()` might return tab 1. So if we get a nonsensical
  // rect (one that does not cover (x, y)) for the "covering" element it's
  // better to treat (x, y) as non-covered.
  // This also happens for Bootstrap v4 checkboxes. They are constructed as
  // follows: A `<div>` has a bit of `padding-left`. In that padding, the
  // `<input type="checkbox">` is placed with `label::before` and `label::after`
  // stacked on top, all using `position: absolute;`. The `<input>` is hidden
  // via `z-index: -1;` and the pseudo elements are styled as a checkbox and
  // positioned _outside_ the `<label>` element. So running
  // `.getElementFromPoint()` where the checkbox looks to be returns the
  // `<label>` element. Treating the checkbox as non-covered means that the hint
  // will end up next to the checkbox rather than next to the label text.
  if (rect.left > x || rect.right <= x || rect.top > y || rect.bottom <= y) {
    return { x, y };
  }

  time.start("getNonCoveredPoint:attempt2");
  const newX = Math.round(rect.right + 1);

  // Try once to the right of the covering element (if it doesn't cover all the
  // way to the right of `element`). For example, there could be an absolutely
  // positioned search icon at the left of an `<input>`. Just trying once to the
  // right seemed to be a good tradeoff between correctness and performance in
  // the VimFx add-on.
  if (newX > x && newX <= maxX) {
    const elementAtPoint2 = getElementFromPoint(element, newX, y);

    if (elementAtPoint2 != null && element.contains(elementAtPoint2)) {
      return { x: newX, y };
    }
  }

  return undefined;
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
}: {
  element: HTMLElement,
  elementRect: ClientRect,
  viewports: Array<Box>,
  isAcceptable: (Point) => boolean,
  preferTextStart: boolean,
  range: Range,
}): ?Point {
  const align = "right";

  // This goes through _all_ text nodes inside the element. That sounds
  // expensive, but in reality I have not noticed this to slow things down. Note
  // that `range.selectNodeContents(element); range.getClientRects()` might seem
  // easier to use, but it takes padding and such of child elements into
  // account. Also, it would count leading visible whitespace as the first
  // character.
  const rects = [];
  for (const textNode of walkTextNodes(element)) {
    const start = textNode.data.search(NON_WHITESPACE);
    const end = textNode.data.search(LAST_NON_WHITESPACE);
    if (start >= 0 && end >= 0) {
      range.setStart(textNode, start);
      range.setEnd(textNode, end + 1);
      for (const rect of range.getClientRects()) {
        const point: Point = {
          ...getXY(rect),
          align,
          debug: "getBestNonEmptyTextPoint intermediate",
        };
        // Make sure that the text is inside the element.
        if (rect.height > 0 && isAcceptable(point)) {
          rects.push(rect);
        }
      }
    }
  }

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
    return {
      ...getXY(leftMostRect),
      align,
      debug: "getBestNonEmptyTextPoint preferTextStart",
    };
  }

  // Prefer the tallest one. In case of a tie, prefer the left-most one.
  const largestRect = rects.reduce((a, b) =>
    b.height > a.height ? b : b.height === a.height && b.left < a.left ? b : a
  );

  // There could be smaller text just to the left of the tallest text. It feels
  // more natural to be looking for the tallest _line_ rather than the tallest
  // piece of text and place the hint at the beginning of the line.
  const sameLineRects = rects.filter(
    (rect) => rect.top < largestRect.bottom && rect.bottom > largestRect.top
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
  if (
    isSingleLine &&
    // There’s space for an image to the left.
    leftMostRect.left >= elementRect.left + t.MIN_SIZE_ICON.value
  ) {
    const imagePoint = getFirstImagePoint(element, viewports);
    if (
      imagePoint != null &&
      // The image is further to the left than the text.
      imagePoint.point.x < leftMostRect.left &&
      // The image is on the same line as the text.
      imagePoint.rect.top < leftMostRect.bottom &&
      imagePoint.rect.bottom > leftMostRect.top &&
      isAcceptable(imagePoint.point)
    ) {
      return {
        ...imagePoint.point,
        debug: `getBestNonEmptyTextPoint imagePoint: ${imagePoint.point.debug}`,
      };
    }
  }

  return {
    ...getXY(leftMostRect),
    align,
    debug: "getBestNonEmptyTextPoint default",
  };
}

function isWithin(point: Point, box: Box): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width * t.MAX_HINT_X_PERCENTAGE_OF_WIDTH.value &&
    point.y >= box.y &&
    // Use `<`, not `<=`, since a point at `box.y + box.height` is located at
    // the first pixel _below_ the box.
    point.y < box.y + box.height
  );
}

function replaceConstants(code: string): string {
  const regex = RegExp(`\\b(${Object.keys(constants).join("|")})\\b`, "g");
  return code.replace(regex, (name) => constants[name]);
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
      (t.VALUES_SCROLLABLE_OVERFLOW.value.has(
        computedStyle.getPropertyValue("overflow-x")
      ) ||
        element === document.scrollingElement)) ||
    // $FlowIgnore: See above.
    (element.scrollTopMax > 0 &&
      (t.VALUES_SCROLLABLE_OVERFLOW.value.has(
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
  return CLICKABLE_EVENT_PROPS.some((prop) =>
    BROWSER === "chrome"
      ? element.hasAttribute(prop)
      : // $FlowIgnore: I _do_ want to dynamically read properties here.
        typeof element[prop] === "function"
  );
}

function getXY(box: Box | ClientRect): { x: number, y: number } {
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
      Math.max(...visibleBoxes.map((box) => box.width)),
      Math.max(...visibleBoxes.map((box) => box.height))
    )
  );

  // Use logarithms too make the difference between small and large elements
  // smaller. Instead of an “image card” being 10 times heavier than a
  // navigation link, it’ll only be about 3 times heavier. Give worse hints to
  // some types, such as scrollable elements, by using a logarithm with a higher
  // base. A tall scrollable element (1080px) gets a weight slightly smaller
  // than that of a small link (12px high).
  const lg = t.ELEMENT_TYPES_WORSE.value.has(elementType)
    ? Math.log10
    : Math.log2;

  return Math.max(1, lg(weight));
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
      t.PROTOCOLS_LINK.value.has(element.protocol)
      ? "link"
      : "clickable"
  );
}

function isDisabled(element: HTMLElement): boolean {
  // $FlowIgnore: Not all HTMLElements have the `disabled` property, but for performance we don’t check.
  return element.disabled === true;
}

// If `event` originates from an open shadow root, `event.target` is the same as
// `shadowRoot.host`, while `event.composedPath()[0]` is the actual element that
// the event came from.
function getTarget(event: Event): EventTarget {
  // $FlowIgnore: Flow doesn’t know about `.composedPath()` yet.
  const path = event.composedPath();
  return path.length > 0 ? path[0] : event.target;
}

function mutationObserve(mutationObserver: MutationObserver, node: Node) {
  mutationObserver.observe(node, {
    childList: true,
    subtree: true,
    attributeFilter: Array.from(t.ATTRIBUTES_MUTATION.value),
  });
}
