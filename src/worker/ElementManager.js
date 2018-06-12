// @flow

export type ElementType = "link" | "clickable" | "frame";

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
|};

export default class ElementManager {
  maxTrackedElements: number;
  elements: Map<HTMLElement, ElementData>;
  visibleElements: Set<HTMLElement>;
  intersectionObserver: IntersectionObserver;
  mutationObserver: MutationObserver;
  bailed: boolean;

  constructor({ maxTrackedElements }: {| maxTrackedElements: number |}) {
    this.maxTrackedElements = maxTrackedElements;

    this.elements = new Map();
    this.visibleElements = new Set();

    this.intersectionObserver = new IntersectionObserver(
      this.onIntersection.bind(this),
      {}
    );

    this.mutationObserver = new MutationObserver(this.onMutation.bind(this));
    this.bailed = false;
  }

  start() {
    const { documentElement } = document;
    if (documentElement != null) {
      this.addElements(documentElement);
      this.mutationObserver.observe(documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  stop() {
    this.intersectionObserver.disconnect();
    this.mutationObserver.disconnect();
    this.elements.clear();
    this.visibleElements.clear();
  }

  // Stop tracking everything except frames (up to `maxTrackedElements` of them).
  bail() {
    if (this.bailed) {
      return;
    }

    this.intersectionObserver.disconnect();
    this.elements.clear();
    this.visibleElements.clear();
    this.bailed = true;

    const { documentElement } = document;
    if (documentElement != null) {
      const frames = document.querySelectorAll("iframe, frame");
      for (const frame of frames) {
        this.addElements(frame);
      }
    }

    console.log("bailed", this);
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

  onMutation(records: Array<MutationRecord>) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) {
          this.addElements(node);
          if (this.bailed) {
            return;
          }
        }
      }

      for (const node of record.removedNodes) {
        if (node instanceof HTMLElement) {
          this.removeElements(node);
        }
      }
    }
  }

  addElements(parent: HTMLElement) {
    let { size } = this.elements;
    const elements = [parent, ...parent.querySelectorAll("*")];
    for (const element of elements) {
      const data = getElementData(element);
      if (data != null && (!this.bailed || data.type === "frame")) {
        this.elements.set(element, data);
        this.intersectionObserver.observe(element);
        size++;
        if (size > this.maxTrackedElements) {
          this.bail();
          break;
        }
      }
    }
  }

  removeElements(parent: HTMLElement) {
    const elements = [parent, ...parent.querySelectorAll("*")];
    for (const element of elements) {
      if (this.elements.has(element)) {
        this.elements.delete(element);
        this.intersectionObserver.unobserve(element);
      }
    }
  }

  getVisibleElements(
    types: Set<ElementType>,
    viewports: Array<Box>
  ): Array<{|
    element: HTMLElement,
    data: ElementData,
    measurements: HintMeasurements,
  |}> {
    const candidates = this.bailed
      ? document.documentElement == null
        ? []
        : document.documentElement.querySelectorAll("*")
      : this.visibleElements;

    const range = document.createRange();

    return Array.from(candidates, element => {
      const data = this.bailed
        ? getElementData(element)
        : this.elements.get(element);

      if (data == null) {
        return undefined;
      }

      if (!types.has(data.type)) {
        return undefined;
      }

      const measurements = getMeasurements(element, viewports, range);

      if (measurements == null) {
        return undefined;
      }

      return {
        element,
        data,
        measurements,
      };
    }).filter(Boolean);
  }

  getVisibleFrames(): Array<HTMLIFrameElement | HTMLFrameElement> {
    return Array.from(
      this.visibleElements,
      element =>
        (element instanceof HTMLIFrameElement ||
          element instanceof HTMLFrameElement) &&
        // Needed on reddit.com. There's a Google Ads iframe without `src` where
        // `contentWindow` is null.
        element.contentWindow != null
          ? element
          : undefined
    ).filter(Boolean);
  }
}

function getMeasurements(
  element: HTMLElement,
  viewports: Array<Box>,
  // The `range` is passed in since it is faster to re-use the same one than
  // creating a new one for every element candidate.
  range: Range
): ?HintMeasurements {
  const rect = element.getBoundingClientRect();
  const visibleBox = getVisibleBox(rect, viewports);

  if (visibleBox == null) {
    return undefined;
  }

  // Try to place the hint just before the first letter inside `element`, if
  // any. If the first letter is off-screen, don’t bother with any fancy
  // placement and just place the hint in the middle of `visibleBox`. The first
  // non-empty text node is assumed to come first. That’s not necessarily true
  // due to CSS, but YAGNI until that’s found in the wild. One would think that
  // `range.selectNodeContents(element)` would do essentially the same thing
  // here, but it takes padding and such of child elements into account. Also,
  // it would count leading visible whitespace as the first character.
  let textRect = undefined;
  const first = getFirstNonEmptyTextNode(element);
  if (first != null) {
    range.setStart(first.node, first.index);
    range.setEnd(first.node, first.index + 1);
    textRect = range.getBoundingClientRect();
  }
  const visibleTextBox =
    textRect == null ? undefined : getVisibleBox(textRect, viewports);

  // The box used to choose the position of the hint.
  const pointBox = visibleTextBox == null ? visibleBox : visibleTextBox;

  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

  const { x } = pointBox;
  const y = pointBox.y + pointBox.height / 2;

  // Check that the element isn’t covered. A little bit expensive, but totally
  // worth it since it makes link hints in fixed menus so much easier find.
  // Even if some other part than `(x, y)` is visible, don’t bother if `(x, y)`
  // isn’t visible. Too much work for too little gain. Finally, add 1px to `x`.
  // It feels safer to test 1px into the element rather than at the very edge.
  // `getVisibleBox` guarantees the box to be at least 1px wide. Remove
  // `offsetX` and `offsetY` to turn `x` and `y` back to the coordinate system
  // of the current frame.
  const elementAtPoint = document.elementFromPoint(
    x - offsetX + 1,
    y - offsetY
  );

  // `.contains` also checks `element === elementAtPoint`.
  if (!element.contains(elementAtPoint)) {
    return undefined;
  }

  return {
    // The coordinates at which to place the hint.
    x,
    y,
    // It’s easy to think that one could optimize by calculating the area from
    // `pointBox` and potentially skip `element.getBoundingClientRect()` for
    // most elements, but remember that `pointBox` most likely just refers to
    // (part of) one text node of the element, not the entire visible area of
    // the element (as `visibleBox` does).
    area: getArea(element, visibleBox),
  };
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

function getElementData(element: HTMLElement): ?{| type: ElementType |} {
  const type = getElementType(element);
  return type == null ? undefined : { type };
}

function getElementType(element: HTMLElement): ?ElementType {
  switch (element.nodeName) {
    case "A":
      return "link";
    case "BUTTON":
    case "LABEL":
    case "SELECT":
    case "SUMMARY":
    case "TEXTAREA":
      return "clickable";
    case "INPUT":
      // $FlowIgnore: Flow can't know, but `.type` _does_ exist here.
      return element.type === "hidden" ? undefined : "clickable";
    case "FRAME":
    case "IFRAME":
      return "frame";
    default:
      return undefined;
  }
}

function getFirstNonEmptyTextNode(
  element: HTMLElement
): ?{| node: Text, index: number |} {
  for (const node of element.childNodes) {
    if (node instanceof Text) {
      const index = node.data.search(/\S/);
      if (index >= 0) {
        return { node, index };
      }
    } else if (node instanceof HTMLElement) {
      const result = getFirstNonEmptyTextNode(node);
      if (result != null) {
        return result;
      }
    }
  }
  return undefined;
}

function getArea(element: HTMLElement, visibleBox: Box): number {
  const rects = element.getClientRects();
  let area = 0;
  for (const rect of rects) {
    const visible = {
      left: Math.max(rect.left, visibleBox.x),
      right: Math.min(rect.right, visibleBox.x + visibleBox.width),
      top: Math.max(rect.top, visibleBox.y),
      bottom: Math.min(rect.bottom, visibleBox.y + visibleBox.height),
    };
    const width = visible.right - visible.left;
    const height = visible.bottom - visible.top;
    if (width > 0 && height > 0) {
      area += width * height;
    }
  }
  return area;
}
