// @flow

export type ElementType = "link" | "clickable" | "frame";

type ElementData = {|
  type: ElementType,
|};

export type Viewport = {|
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
    viewports: Array<Viewport>
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
  viewports: Array<Viewport>,
  // The `range` is passed in since it is faster to re-use the same one than
  // creating a new one for every element candidate.
  range: Range
): ?HintMeasurements {
  range.selectNodeContents(element);
  const elementRect = range.getBoundingClientRect();

  const visibleRect = viewports.reduceRight(
    (rect, viewport) => ({
      left: viewport.x + Math.max(rect.left, 0),
      right: viewport.x + Math.min(rect.right, viewport.width),
      top: viewport.y + Math.max(rect.top, 0),
      bottom: viewport.y + Math.min(rect.bottom, viewport.height),
    }),
    elementRect
  );

  const height = visibleRect.bottom - visibleRect.top;
  const width = visibleRect.right - visibleRect.left;

  if (height <= 0 || width <= 0) {
    return undefined;
  }

  const x = visibleRect.left;
  const y = visibleRect.top + height / 2;

  const elementAtPoint = document.elementFromPoint(x + 1, y);

  if (!element.contains(elementAtPoint)) {
    return undefined;
  }

  return {
    x,
    y,
    area: width * height,
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
