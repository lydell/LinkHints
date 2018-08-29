// @flow

import { Resets, addEventListener, bind, log } from "../shared/main";

import injected from "./injected";

export type ElementType =
  | "link"
  | "clickable"
  | "clickable-event"
  | "scrollable"
  | "label";

type ElementData = {|
  type: ElementType,
|};

export type Box = {|
  x: number,
  y: number,
  width: number,
  height: number,
|};

export type HintMeasurements = {|
  x: number,
  y: number,
  area: number,
  align: "left" | "right",
|};

export type VisibleElement = {|
  element: HTMLElement,
  data: ElementData,
  measurements: HintMeasurements,
|};

type QueueItem = {|
  mutationType: MutationType,
  element: HTMLElement,
|};

type MutationType = "added" | "removed" | "changed";

// Elements this many pixels high or taller always get their hint placed at the
// very left edge.
const BOX_MIN_HEIGHT = 110; // px

const LINK_PROTOCOLS = new Set(["http:", "https:", "ftp:", "file:"]);

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

const SCROLLABLE_OVERFLOW_VALUES = new Set(["auto", "scroll"]);

const FRAME_MIN_SIZE = 6; // px
const TEXT_RECT_MIN_SIZE = 2; // px

// This value is replaced in by Rollup; only refer to it once.
const clickableEventNames = CLICKABLE_EVENT_NAMES;
const clickableEventProps = clickableEventNames.map(
  eventName => `on${eventName}`
);

const CLICKABLE_ATTRIBUTES = [
  // Bootstrap.
  "data-dismiss",
  // Twitter
  "data-permalink-path",
];

const MUTATION_ATTRIBUTES = [
  "href",
  "role",
  ...clickableEventProps,
  ...CLICKABLE_ATTRIBUTES,
];

const infiniteDeadline = {
  timeRemaining: () => Infinity,
};

export default class ElementManager {
  maxIntersectionObservedElements: number;
  queue: Array<QueueItem>;
  elements: Map<HTMLElement, ElementData>;
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

  constructor({
    maxIntersectionObservedElements,
  }: {|
    maxIntersectionObservedElements: number,
  |}) {
    this.maxIntersectionObservedElements = maxIntersectionObservedElements;

    this.queue = [];
    this.elements = new Map();
    this.visibleElements = new Set();
    this.visibleFrames = new Set();
    this.elementsWithClickListeners = new WeakSet();
    this.elementsWithScrollbars = new WeakSet();

    this.intersectionObserver = new IntersectionObserver(
      this.onIntersection.bind(this),
      {}
    );

    this.frameIntersectionObserver = new IntersectionObserver(
      this.onFrameIntersection.bind(this),
      {}
    );

    this.mutationObserver = new MutationObserver(this.onMutation.bind(this));

    this.idleCallbackId = undefined;
    this.bailed = false;
    this.resets = new Resets();

    bind(this, [
      this.onClickableElements,
      this.onUnclickableElements,
      this.onOverflowChange,
    ]);
  }

  start() {
    const { documentElement } = document;
    if (documentElement != null) {
      this.queueItemAndChildren({
        mutationType: "added",
        element: documentElement,
      });
      this.mutationObserver.observe(documentElement, {
        childList: true,
        subtree: true,
        attributeFilter: MUTATION_ATTRIBUTES,
      });
      this.resets.add(
        addEventListener(
          window,
          INJECTED_CLICKABLE_EVENT,
          this.onClickableElements
        ),
        addEventListener(
          window,
          INJECTED_UNCLICKABLE_EVENT,
          this.onUnclickableElements
        ),
        addEventListener(window, "overflow", this.onOverflowChange),
        addEventListener(window, "underflow", this.onOverflowChange)
      );
      injectScript();
    }
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
    window.postMessage(INJECTED_RESET, "*");
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
      this.queueItem({ mutationType: item.mutationType, element });
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
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (
          node instanceof HTMLIFrameElement ||
          node instanceof HTMLFrameElement
        ) {
          // In theory, this can lead to more than
          // `maxIntersectionObservedElements` frames being tracked by the
          // intersection observer, but in practice there are never that many
          // frames. YAGNI.
          this.frameIntersectionObserver.observe(node);
        } else if (node instanceof HTMLElement) {
          this.queueItemAndChildren({ mutationType: "added", element: node });
        }
      }

      for (const node of record.removedNodes) {
        if (
          node instanceof HTMLIFrameElement ||
          node instanceof HTMLFrameElement
        ) {
          this.frameIntersectionObserver.unobserve(node);
          this.visibleFrames.delete(node); // Just to be sure.
        } else if (node instanceof HTMLElement) {
          this.queueItemAndChildren({ mutationType: "removed", element: node });
        }
      }

      if (record.attributeName != null) {
        const element = record.target;
        if (element instanceof HTMLElement) {
          this.queueItem({ mutationType: "changed", element });
        }
      }
    }
  }

  onClickableElements(event: CustomEvent) {
    const elements =
      event.detail == null ? [event.target] : event.detail.elements;
    for (const element of elements) {
      if (element instanceof HTMLElement) {
        this.elementsWithClickListeners.add(element);
        this.queueItem({ mutationType: "changed", element });
      }
    }
  }

  onUnclickableElements(event: CustomEvent) {
    const elements =
      event.detail == null ? [event.target] : event.detail.elements;
    for (const element of elements) {
      if (element instanceof HTMLElement) {
        this.elementsWithClickListeners.delete(element);
        this.queueItem({ mutationType: "changed", element });
      }
    }
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
      const data =
        mutationType === "removed" ? undefined : this.getElementData(element);
      if (data == null) {
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
        this.elements.set(element, data);
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
        break;
      }
    }

    this.queue = [];
  }

  getVisibleElements(
    types: Set<ElementType>,
    viewports: Array<Box>
  ): Array<VisibleElement> {
    const needsFlush = this.queue.length > 0;
    console.log("NEEDS FLUSH?", needsFlush);

    if (needsFlush) {
      // This won't flush the queue in injected.js, but is better than nothing.
      // Maybe we could send a message to injected.js, asking it to flush.
      this.flushQueue(infiniteDeadline);
    }

    // Maybe we should wait for paint (two animation frames) so that
    // `this.visibleElements` can be used even in the `needsFlush` case.
    const candidates =
      needsFlush || this.bailed ? this.elements.keys() : this.visibleElements;

    const range = document.createRange();

    const labels = new Set();

    return (
      Array.from(candidates, element => {
        const data = this.elements.get(element);

        if (data == null) {
          return undefined;
        }

        if (!types.has(data.type)) {
          return undefined;
        }

        // Ignore `<label>` elements with no control and no click listeners.
        // $FlowIgnore: Flow can't know, but `element` _is_ a `<label>` here.
        if (data.type === "label" && element.control == null) {
          return undefined;
        }

        const measurements = getMeasurements(element, viewports, range, {
          lookForText: data.type !== "scrollable",
        });

        if (measurements == null) {
          return undefined;
        }

        // $FlowIgnore: Only some types of elements have `.labels`, and I'm not going to `instanceof` check them all.
        if (element.labels instanceof NodeList) {
          for (const label of element.labels) {
            labels.add(label);
          }
        }

        return {
          element,
          data,
          measurements,
        };
      })
        .filter(Boolean)
        // Exclude `<label>` elements whose associated control has a hint.
        // One _could_ shuffle things around to avoid calculating `measurements`
        // at all for such labels, but I don't think it's worth it. Pages
        // usually don't have that many labels.
        .filter(result => !labels.has(result.element))
    );
  }

  getVisibleFrames(
    viewports: Array<Box>
  ): Array<HTMLIFrameElement | HTMLFrameElement> {
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

  getElementData(element: HTMLElement): ?{| type: ElementType |} {
    const type = this.getElementType(element);
    return type == null ? undefined : { type };
  }

  getElementType(element: HTMLElement): ?ElementType {
    switch (element.nodeName) {
      case "A": {
        const hrefAttr = element.getAttribute("href");
        return (
          // Exclude `<a>` tags used as buttons.
          typeof hrefAttr === "string" &&
            hrefAttr !== "" &&
            hrefAttr !== "#" &&
            // Exclude `javascript:`, `mailto:`, `tel:` and other protocols that
            // don’t make sense to open in a new tab.
            // $FlowIgnore: Flow can't know, but `.protocol` _does_ exist here.
            LINK_PROTOCOLS.has(element.protocol)
            ? "link"
            : "clickable"
        );
      }
      case "BUTTON":
      case "SELECT":
      case "SUMMARY":
      case "TEXTAREA":
        return "clickable";
      case "INPUT":
        // $FlowIgnore: Flow can't know, but `.type` _does_ exist here.
        return element.type === "hidden" ? undefined : "clickable";
      default: {
        const document = element.ownerDocument;

        // `<html>` and `<body>` might have click listeners or role attributes
        // etc. but we never want hints for them.
        if (element === document.documentElement || element === document.body) {
          return undefined;
        }

        if (this.elementsWithScrollbars.has(element)) {
          return "scrollable";
        }

        const roleAttr = element.getAttribute("role");
        if (CLICKABLE_ROLES.has(roleAttr)) {
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

function getMeasurements(
  element: HTMLElement,
  viewports: Array<Box>,
  // The `range` is passed in since it is faster to re-use the same one than
  // creating a new one for every element candidate.
  range: Range,
  { lookForText: passedLookForText = true }: {| lookForText: boolean |} = {}
): ?HintMeasurements {
  const rects = element.getClientRects();

  const isBox = rects.length === 1 && rects[0].height >= BOX_MIN_HEIGHT;
  const lookForText = passedLookForText && !isBox;

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
    // If there’s only one rect and that rect has a height but not a width it
    // means that all children are floated or absolutely positioned (and that
    // `element` hasn’t been made to “contain” the floats). For example, a link
    // in a menu could contain a span of text floated to the left and an icon
    // floated to the right. Those are still clickable. So return the
    // measurements of one of the children instead. For now we just pick the
    // first (in DOM order), but there might be a more clever way of doing it.
    if (rects.length === 1) {
      const rect = rects[0];
      if (rect.width === 0 && rect.height > 0) {
        for (const child of element.children) {
          const measurements = getMeasurements(child, viewports, range);
          if (measurements != null) {
            return measurements;
          }
        }
      }
    }

    return undefined;
  }

  // Try to place the hint just before the first letter inside `element`, if
  // any. If the first letter is off-screen, don’t bother with any fancy
  // placement and just place the hint in the middle of `visibleBoxes`. The
  // first non-empty text node is assumed to come first. That’s not necessarily
  // true due to CSS, but YAGNI until that’s found in the wild. One would think
  // that `range.selectNodeContents(element)` would do essentially the same
  // thing here, but it takes padding and such of child elements into account.
  // Also, it would count leading visible whitespace as the first character.
  // Finally, don’t try to look for text nodes in `<select>` elements. There
  // _are_ text nodes inside the `<option>` elements and their rects _can_ be
  // measured, but if the dropdown opens _upwards_ the `elementAtPoint` check
  // will fail. An example is the signup form at <https://www.facebook.com/>.
  // For scrollable elements it also doesn't make sense to look for text to
  // place the hint at. That's what the `lookForText` option is for.
  const textRect =
    !lookForText || element instanceof HTMLSelectElement
      ? undefined
      : getFirstNonEmptyTextRect(element, visibleBoxes, range);
  const visibleTextBox = textRect == null ? undefined : rectToBox(textRect);

  // The box used to choose the position of the hint.
  const pointBox =
    visibleTextBox == null
      ? lookForText
        ? adjustTextlessBox(element, rects, visibleBoxes[0])
        : visibleBoxes[0]
      : visibleTextBox;

  const { x } = pointBox;
  const y = pointBox.y + pointBox.height / 2;

  // It’s easy to think that one could optimize by calculating the area from
  // `pointBox` and potentially skip `element.getClientRects()` for most
  // elements, but remember that `pointBox` most likely just refers to (part of)
  // one text node of the element, not the entire visible area of the element
  // (as `visibleBoxes` does).
  const area = visibleBoxes.reduce(
    (sum, box) => sum + box.width * box.height,
    0
  );

  // Check that the element isn’t covered. A little bit expensive, but totally
  // worth it since it makes link hints in fixed menus so much easier find.
  const nonCoveredPoint = getNonCoveredPoint(element, {
    x,
    y,
    maxX: visibleBoxes[0].x + visibleBoxes[0].width - 1,
  });

  if (nonCoveredPoint == null) {
    // Putting a large `<input type="file">` inside a smaller wrapper element
    // with `overflow: hidden;` seems to be a common pattern, used both on
    // addons.mozilla.org and <https://blueimp.github.io/jQuery-File-Upload/>.
    if (
      element instanceof HTMLInputElement &&
      element.type === "file" &&
      element.parentNode instanceof HTMLElement
    ) {
      const measurements = getMeasurements(
        element.parentNode,
        viewports,
        range
      );
      return measurements != null && measurements.area < area
        ? measurements
        : undefined;
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

  // TODO: Reference comparing to the first visibleBox is a hack.
  const align = pointBox === visibleBoxes[0] ? "left" : "right";

  // The coordinates at which to place the hint and the area of the element.
  return nonCoveredPoint == null
    ? { x: x + offsetX, y: y + offsetY, area, align }
    : {
        x: nonCoveredPoint.x + offsetX,
        y: nonCoveredPoint.y + offsetY,
        area,
        align,
      };
}

function adjustTextlessBox(
  element: HTMLElement,
  rects: Array<ClientRect>,
  visibleBox: Box
): Box {
  // If the element has only one rect and no text we can try to position it
  // somewhat better than at the edge of the element.
  if (rects.length === 1) {
    const selector = "img, svg";
    // Due to the float case in `getMeasurements` the element itself can be an
    // image.
    const image = element.matches(selector)
      ? element
      : element.querySelector(selector);

    // First try to place it near and image. Many buttons have just an icon and
    // no text.
    if (image != null) {
      const imageRect = image.getBoundingClientRect();
      const x = imageRect.left;

      if (x >= visibleBox.x && x < visibleBox.x + visibleBox.width) {
        return { ...visibleBox, x };
      }
    }

    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
    ) {
      // TODO: Super ugly reference checking hack...
      return { ...visibleBox };
    }

    // Try to place the hint nearer the placeholder in `<input>` elements and
    // nearer the text in `<input type="button">` and `<select>` by taking
    // border and padding into account.
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement
    ) {
      const computedStyle = window.getComputedStyle(element);
      const left =
        parseFloat(computedStyle.getPropertyValue("border-left-width")) +
        parseFloat(computedStyle.getPropertyValue("padding-left"));
      const x = rects[0].left + left;

      if (x >= visibleBox.x && x < visibleBox.x + visibleBox.width) {
        return { ...visibleBox, x };
      }
    }
  }

  return visibleBox;
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
function getVisibleBox(passedRect: ClientRect, viewports: Array<Box>): ?Box {
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

function getFirstNonEmptyTextRect(
  element: HTMLElement,
  visibleBoxes: Array<Box>,
  range: Range
): ?ClientRect {
  const elementRect = element.getBoundingClientRect();
  if (
    // Exclude screen reader only text.
    elementRect.width < TEXT_RECT_MIN_SIZE &&
    elementRect.height < TEXT_RECT_MIN_SIZE
  ) {
    return undefined;
  }

  for (const node of element.childNodes) {
    if (node instanceof Text) {
      const index = node.data.search(/\S/);
      if (index >= 0) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();

        if (
          // Exclude screen reader only text.
          rect.width >= TEXT_RECT_MIN_SIZE &&
          rect.height >= TEXT_RECT_MIN_SIZE &&
          // Make sure that the text is inside the element.
          // eslint-disable-next-line no-loop-func
          visibleBoxes.some(visibleBox => isWithin(visibleBox, rect))
        ) {
          return rect;
        }
      }
    } else if (node instanceof HTMLElement) {
      const result = getFirstNonEmptyTextRect(node, visibleBoxes, range);
      if (result != null) {
        return result;
      }
    }
  }
  return undefined;
}

function isWithin(box: Box, rect: ClientRect): boolean {
  return (
    rect.left >= box.x &&
    rect.right <= box.x + box.width &&
    rect.top + rect.height / 2 >= box.y &&
    rect.top + rect.height / 2 <= box.y + box.height
  );
}

function injectScript() {
  const { documentElement } = document;

  if (documentElement == null) {
    return;
  }

  const code = `(${injected.toString()})()`;

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
    } catch (_error) {
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

function isScrollable(element: HTMLElement): boolean {
  const computedStyle = window.getComputedStyle(element);

  // `.scrollLeftMax` and `.scrollTopMax` are Firefox-only, but this function is
  // only called from the "overflow" and "underflow" event listeners, and those
  // are Firefox-only as well. Those properties are the easiest way to check if
  // an element overflows in either the X or Y direction.
  return (
    // $FlowIgnore: See above.
    (element.scrollLeftMax > 0 &&
      SCROLLABLE_OVERFLOW_VALUES.has(
        computedStyle.getPropertyValue("overflow-x")
      )) ||
    // $FlowIgnore: See above.
    (element.scrollTopMax > 0 &&
      SCROLLABLE_OVERFLOW_VALUES.has(
        computedStyle.getPropertyValue("overflow-y")
      ))
  );
}

function hasClickListenerProp(element: HTMLElement): boolean {
  // Adding a `onclick="..."` attribute in HTML automatically sets
  // `.onclick` of the element to a function. But in Chrome, `.onclick`
  // is `undefined` when inspected from a content script, so we need to
  // use `.hasAttribute` instead. That works, except in rare edge cases
  // where `.onclick = null` is set afterwards (the attribute string
  // will remain but the listener will be gone).
  return clickableEventProps.some(
    prop =>
      BROWSER === "chrome"
        ? element.hasAttribute(prop)
        : // $FlowIgnore: I _do_ want to dynamically read properties here.
          typeof element[prop] === "function"
  );
}

function rectToBox(rect: ClientRect): Box {
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
