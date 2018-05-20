// @flow

type ElementType = "link";

type ElementData = {|
  type: ElementType,
|};

type Viewport = {|
  top: number,
  bottom: number,
  left: number,
  right: number,
|};

type HintMeasurements = {|
  x: number,
  y: number,
  area: number,
|};

const MIN = 2; // px

export default class ElementManager {
  elements: Map<HTMLElement, ElementData>;
  visibleElements: Set<HTMLElement>;
  intersectionObserver: IntersectionObserver;
  mutationObserver: MutationObserver;

  constructor() {
    this.elements = new Map();
    this.visibleElements = new Set();

    this.intersectionObserver = new IntersectionObserver(
      this.onIntersection.bind(this),
      {}
    );

    this.mutationObserver = new MutationObserver(this.onMutation.bind(this));
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
    const elements = [parent, ...parent.querySelectorAll("*")];
    for (const element of elements) {
      if (element.nodeName === "A") {
        this.elements.set(element, { type: "link" });
        this.intersectionObserver.observe(element);
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
    viewport: Viewport
  ): Array<{|
    element: HTMLElement,
    data: ElementData,
    measurements: HintMeasurements,
  |}> {
    return Array.from(this.visibleElements, element => {
      const data = this.elements.get(element);

      if (data == null) {
        return undefined;
      }

      if (!types.has(data.type)) {
        return undefined;
      }

      const measurements = getMeasurements(element, viewport);

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
}

function getMeasurements(
  element: HTMLElement,
  viewport: Viewport
): ?HintMeasurements {
  const rawRect = element.getBoundingClientRect();

  const rect = {
    top: Math.min(rawRect.top, viewport.bottom),
    bottom: Math.max(rawRect.bottom, viewport.top),
    left: Math.min(rawRect.left, viewport.right),
    right: Math.max(rawRect.right, viewport.left),
  };

  const height = rect.bottom - rect.top;
  const width = rect.right - rect.left;

  // Skip elements that are fully or almost fully outside the viewport, because
  // of the IntersectionObserver misreporting, frames being partially off-screen
  // or elements just being very close to the edge.
  return height < MIN || width < MIN
    ? undefined
    : {
        x: rect.left,
        y: rect.top + height / 2,
        area: width * height,
      };
}
