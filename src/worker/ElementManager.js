// @flow

export type ElementType = "link" | "frame";

type ElementData = {|
  type: ElementType,
|};

export type Offsets = {|
  offsetX: number,
  offsetY: number,
|};

export type Viewport = {|
  left: number,
  right: number,
  top: number,
  bottom: number,
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
    offsets: Offsets,
    viewport: Viewport
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

      const measurements = getMeasurements(element, offsets, viewport);

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
  offsets: Offsets,
  viewport: Viewport
): ?HintMeasurements {
  const rect = element.getBoundingClientRect();

  const visibleRect = {
    left: Math.max(offsets.offsetX + rect.left, viewport.left),
    right: Math.min(offsets.offsetX + rect.right, viewport.right),
    top: Math.max(offsets.offsetY + rect.top, viewport.top),
    bottom: Math.min(offsets.offsetY + rect.bottom, viewport.bottom),
  };

  const height = visibleRect.bottom - visibleRect.top;
  const width = visibleRect.right - visibleRect.left;

  return height <= 0 || width <= 0
    ? undefined
    : {
        x: visibleRect.left,
        y: visibleRect.top + height / 2,
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
    case "FRAME":
    case "IFRAME":
      return "frame";
    default:
      return undefined;
  }
}
