// @flow

import { Resets, addEventListener, bind, log } from "../shared/main";

import injected from "./injected";

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

export type VisibleElement = {|
  element: HTMLElement,
  data: ElementData,
  measurements: HintMeasurements,
|};

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
  "separator",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
  // Omitted since they don’t seem useful to click:
  // "progressbar",
  // "scrollbar",
  // "slider",
  // "tabpanel",
]);

export default class ElementManager {
  maxTrackedElements: number;
  elements: Map<HTMLElement, ElementData>;
  visibleElements: Set<HTMLElement>;
  elementsWithClickListeners: Set<HTMLElement>;
  intersectionObserver: IntersectionObserver;
  mutationObserver: MutationObserver;
  bailed: boolean;
  resets: Resets;

  constructor({ maxTrackedElements }: {| maxTrackedElements: number |}) {
    this.maxTrackedElements = maxTrackedElements;

    this.elements = new Map();
    this.visibleElements = new Set();
    this.elementsWithClickListeners = new Set();

    this.intersectionObserver = new IntersectionObserver(
      this.onIntersection.bind(this),
      {}
    );

    this.mutationObserver = new MutationObserver(this.onMutation.bind(this));
    this.bailed = false;

    this.resets = new Resets();

    bind(this, [this.onClickableElement, this.onUnclickableElement]);
  }

  start() {
    const { documentElement } = document;
    if (documentElement != null) {
      this.addElements(documentElement);
      this.mutationObserver.observe(documentElement, {
        childList: true,
        subtree: true,
        attributeFilter: ["href", "role", "onclick"],
      });
      this.resets.add(
        addEventListener(
          window,
          INJECTED_CLICKABLE_EVENT,
          this.onClickableElement
        ),
        addEventListener(
          window,
          INJECTED_UNCLICKABLE_EVENT,
          this.onUnclickableElement
        )
      );
      injectScript();
    }
  }

  stop() {
    this.intersectionObserver.disconnect();
    this.mutationObserver.disconnect();
    this.elements.clear();
    this.visibleElements.clear();
    this.elementsWithClickListeners.clear();
    this.resets.reset();
    window.postMessage(INJECTED_RESET, "*");
  }

  // Stop tracking everything except frames (up to `maxTrackedElements` of them).
  bail() {
    if (this.bailed) {
      return;
    }

    const { size } = this.elements;

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

    log("warn", "ElementManager#bail", size, this.maxTrackedElements);
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

      if (record.attributeName != null) {
        const element = record.target;
        if (element instanceof HTMLElement) {
          this.checkElement(element);
        }
      }
    }
  }

  onClickableElement(event: CustomEvent) {
    const { element } = event.detail;
    if (element instanceof HTMLElement) {
      this.elementsWithClickListeners.add(element);
      this.checkElement(element);
    }
  }

  onUnclickableElement(event: CustomEvent) {
    const { element } = event.detail;
    if (element instanceof HTMLElement) {
      this.elementsWithClickListeners.delete(element);
      this.checkElement(element);
    }
  }

  checkElement(element: HTMLElement) {
    const data = this.getElementData(element);
    if (data == null) {
      if (this.elements.has(element)) {
        this.elements.delete(element);
        this.intersectionObserver.unobserve(element);
      }
    } else if (!this.bailed) {
      this.elements.set(element, data);
      this.intersectionObserver.observe(element);
      if (this.elements.size > this.maxTrackedElements) {
        this.bail();
      }
    }
  }

  addElements(parent: HTMLElement) {
    let { size } = this.elements;
    const elements = [parent, ...parent.querySelectorAll("*")];
    for (const element of elements) {
      const data = this.getElementData(element);
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
        this.elementsWithClickListeners.delete(element);
        this.intersectionObserver.unobserve(element);
      }
    }
  }

  getVisibleElements(
    types: Set<ElementType>,
    viewports: Array<Box>
  ): Array<VisibleElement> {
    const candidates = this.bailed
      ? document.documentElement == null
        ? []
        : document.documentElement.querySelectorAll("*")
      : this.visibleElements;

    const range = document.createRange();

    return Array.from(candidates, element => {
      const data = this.bailed
        ? this.getElementData(element)
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
      default: {
        const document = element.ownerDocument;

        // `<html>` and `<body>` might have click listeners or role attributes
        // etc. but we never want hints for them.
        if (element === document.documentElement || element === document.body) {
          return undefined;
        }

        const roleAttr = element.getAttribute("role");
        if (
          CLICKABLE_ROLES.has(roleAttr) ||
          typeof element.onclick === "function" ||
          this.elementsWithClickListeners.has(element)
        ) {
          return "clickable";
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
  range: Range
): ?HintMeasurements {
  const rects = element.getClientRects();

  const visibleBoxes = Array.from(rects, rect =>
    getVisibleBox(rect, viewports)
  ).filter(Boolean);

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
  const pointBox = visibleTextBox == null ? visibleBoxes[0] : visibleTextBox;

  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

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

  // The coordinates at which to place the hint and the area of the element.
  return { x, y, area };
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
