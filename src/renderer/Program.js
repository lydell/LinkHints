// @flow strict-local

import {
  type Box,
  CONTAINER_ID,
  Resets,
  addEventListener,
  addListener,
  bind,
  getViewport,
  log,
  setStyles,
  unreachable,
  waitForPaint,
} from "../shared/main";
import { TimeTracker } from "../shared/perf";
import type {
  ElementWithHint,
  HintMeasurements,
  HintUpdate,
} from "../shared/hints";
import type {
  FromBackground,
  FromRenderer,
  ToBackground,
} from "../shared/messages";

import { type Rule, applyStyles, parseCSS } from "./css";

type HintSize = {|
  widthBase: number,
  widthPerLetter: number,
  height: number,
|};

const ROOT_CLASS = "root";
const HINT_CLASS = "hint";
const HIGHLIGHTED_HINT_CLASS = "highlighted";
const MATCHED_CHARS_CLASS = "matchedChars";
const TEXT_RECT_CLASS = "matchedText";
const TITLE_CLASS = "title";
const PEEK_CLASS = "peek";
const HIDDEN_CLASS = "hidden";

const MAX_IMMEDIATE_HINT_MOVEMENTS = 50;

// The minimum and maximum z-index browsers support.
const MIN_Z_INDEX = -2147483648;
const MAX_Z_INDEX = 2147483647;

const CONTAINER_STYLES = {
  all: "unset",
  position: "fixed",
  "z-index": String(MAX_Z_INDEX),
  "pointer-events": "none",
  overflow: "hidden",
};

const font = BROWSER === "firefox" ? "font: menu;" : "font-family: system-ui;";

const CSS = `
.${ROOT_CLASS} {
  ${font}
}

.${HINT_CLASS} {
  position: absolute;
  box-sizing: border-box;
  padding: 2px;
  border: solid 1px rgba(0, 0, 0, 0.5);
  ${
    "" // This is the yellow used in Chrome for findbar matches.
  }
  background-color: #f6ff00;
  color: black;
  font-size: 12px;
  line-height: 1;
  font-weight: bold;
  white-space: nowrap;
  text-align: center;
  text-transform: uppercase;
}

.${HIGHLIGHTED_HINT_CLASS} {
  background-color: lime;
}

.${MATCHED_CHARS_CLASS} {
  opacity: 0.3;
}

.${TEXT_RECT_CLASS} {
  position: absolute;
  z-index: ${MIN_Z_INDEX};
  box-sizing: border-box;
  ${
    "" // This is the purple used in Firefox for findbar "Highlight all" matches.
  }
  border-bottom: 2px solid #ef0fff;
}

.${TITLE_CLASS} {
  box-sizing: border-box;
  position: absolute;
  z-index: ${MAX_Z_INDEX};
  bottom: 0;
  right: 0;
  max-width: 100%;
  padding: 4px 6px;
  box-shadow: 0 0 1px 0 rgba(255, 255, 255, 0.5);
  background-color: black;
  color: white;
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${PEEK_CLASS} {
  opacity: 0.2;
}

.${HIDDEN_CLASS} {
  opacity: 0;
}
`.trim();

export default class RendererProgram {
  css: string;
  parsedCSS: ?Array<Rule>;
  hints: Array<HTMLElement>;
  rects: Map<HTMLElement, ClientRect>;
  enteredTextChars: string;
  resets: Resets;
  shruggieElement: HTMLElement;
  titleElement: HTMLElement;
  titleText: Text;
  hintSize: HintSize;
  container: {|
    element: HTMLElement,
    root: HTMLElement,
    shadowRoot: ShadowRoot,
    resets: Resets,
    intersectionObserver: IntersectionObserver,
  |};

  constructor() {
    this.css = CSS;
    this.parsedCSS = undefined;
    this.hints = [];
    this.rects = new Map();
    this.enteredTextChars = "";
    this.resets = new Resets();

    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { catch: true }],
      [this.stop, { log: true, catch: true }],
      [this.render, { catch: true }],
      this.onIntersection,
      this.onResize,
    ]);

    this.shruggieElement = createHintElement("¯\\_(ツ)_/¯");
    this.shruggieElement.classList.add(HIDDEN_CLASS);
    setStyles(this.shruggieElement, {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      "z-index": String(MAX_Z_INDEX),
    });

    this.titleElement = document.createElement("div");
    this.titleElement.classList.add(TITLE_CLASS, HIDDEN_CLASS);
    this.titleText = document.createTextNode("");
    this.titleElement.append(this.titleText);

    this.hintSize = {
      widthBase: 0,
      widthPerLetter: 0,
      height: 0,
    };

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    setStyles(container, CONTAINER_STYLES);

    // Using `mode: "closed"` is tempting, but then Firefox does not seem to
    // allow inspecting the elements inside in its devtools. That's important
    // for people who want to customize the styling of the hints.
    const shadowRoot = container.attachShadow({ mode: "open" });

    const root = document.createElement("div");
    root.className = ROOT_CLASS;

    this.container = {
      element: container,
      root,
      shadowRoot,
      resets: new Resets(),
      intersectionObserver: new IntersectionObserver(this.onIntersection, {
        // Make sure the container stays within the viewport.
        threshold: 1,
      }),
    };
  }

  async start(): Promise<void> {
    // This is useful during development. If reloading the extension during
    // hints mode, the old hints will be removed as soon as the new version
    // starts.
    this.unrender();

    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    try {
      // Don’t use `this.sendMessage` since it automatically catches and logs
      // errors.
      await browser.runtime.sendMessage(
        wrapMessage({ type: "RendererScriptAdded" })
      );
    } catch (_error) {
      // In Firefox, content scripts are loaded automatically in already
      // existing tabs. (Chrome only automatically loads content scripts into
      // _new_ tabs.) The content scripts run before the background scripts, so
      // this message can fail since there’s nobody listening on the other end.
      // Instead, the background script will send the "FirefoxWorkaround"
      // message to all existing tabs when it starts, allowing us to retry
      // sending "RendererScriptAdded" at that point. See: <bugzil.la/1474727>

      // Don’t set up the port below, since it will just immediately disconnect
      // (since the background script isn’t ready to connect yet). That would
      // cause `this.stop()` to be called, but we actually want to continue
      // running. As mentioned below, WebExtensions can’t really run any cleanup
      // logic in Firefox anyway.
      return;
    }

    // In Chrome, content scripts continue to live after the extension has been
    // disabled, uninstalled or reloaded. A way to detect this is to make a
    // `Port` and listen for `onDisconnect`. Then one can run some cleanup to
    // make the effectively disable the script.
    // In Firefox, content scripts are nuked when uninstalling. `onDisconnect`
    // never runs. Hopefully this changes some day, since we’d ideally want to
    // clean up injected.js. There does not seem to be any good way of running
    // cleanups when a WebExtension is disabled in Firefox. See:
    // <bugzil.la/1223425>
    browser.runtime.connect().onDisconnect.addListener(() => {
      this.stop();
    });
  }

  stop() {
    this.resets.reset();
    this.unrender();
  }

  async sendMessage(message: FromRenderer): Promise<void> {
    log("log", "RendererProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
  }

  onMessage(wrappedMessage: FromBackground) {
    // As mentioned in `this.start`, re-send the "RendererScriptAdded" message
    // in Firefox as a workaround for its content script loading quirks.
    if (wrappedMessage.type === "FirefoxWorkaround") {
      this.sendMessage({ type: "RendererScriptAdded" });
      return;
    }

    if (wrappedMessage.type !== "ToRenderer") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "RendererProgram#onMessage", message.type, message);

    switch (message.type) {
      case "StateSync":
        log.level = message.logLevel;
        break;

      case "Render":
        this.render(message.elements);
        break;

      case "UpdateHints":
        this.updateHints(message.updates, message.enteredTextChars);
        break;

      case "RotateHints":
        this.rotateHints({ forward: message.forward });
        break;

      case "RenderTextRects":
        this.unrenderTextRects(message.frameId);
        this.renderTextRects(message.rects, message.frameId);
        break;

      case "SetTitle":
        this.setTitle(message.title);
        break;

      case "Peek":
        this.togglePeek({ peek: true });
        break;

      case "Unpeek":
        this.togglePeek({ peek: false });
        break;

      case "Unrender":
        if (message.keepTitle && this.titleText.data !== "") {
          this.unrenderHintsOnly();
        } else {
          this.unrender();
        }
        break;

      default:
        unreachable(message.type, message);
    }
  }

  onIntersection(entries: Array<IntersectionObserverEntry>) {
    // There will only be one entry.
    const entry = entries[0];
    if (entry.intersectionRatio !== 1) {
      requestAnimationFrame(() => {
        this.updateContainer(
          // `entry.rootBounds` is supposed to be the viewport size, but I've
          // noticed it being way larger in Chrome sometimes, so calculate it
          // manually there.
          BROWSER === "chrome" ? getViewport() : entry.rootBounds
        );
      });
    }
  }

  onResize() {
    this.updateContainer(getViewport());
  }

  updateContainer(viewport: { width: number, height: number }) {
    const container = this.container.element;

    setStyles(container, {
      left: "0",
      top: "0",
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
    });

    // If the `<html>` element has `transform: translate(...);` (some sites push
    // the entire page to the side when opening a sidebar menu using this
    // technique) we need to take that into account.
    const rect = container.getBoundingClientRect();
    if (rect.left !== 0) {
      setStyles(container, { left: `${-rect.left}px` });
    }
    if (rect.top !== 0) {
      setStyles(container, { top: `${-rect.top}px` });
    }
  }

  updateHintSize() {
    // Note: This requires that the container has been placed into the DOM.
    const { root } = this.container;

    // "W" is usually (one of) the widest character(s). This is surprisingly
    // cheap to calculate.
    const probe1 = createHintElement("W");
    const probe2 = createHintElement("WW");
    root.append(probe1);
    root.append(probe2);
    this.maybeApplyStyles(probe1);
    this.maybeApplyStyles(probe2);

    const rect1 = probe1.getBoundingClientRect();
    const rect2 = probe2.getBoundingClientRect();
    const widthPerLetter = rect2.width - rect1.width;
    const widthBase = rect1.width - widthPerLetter;
    const { height } = rect1;

    probe1.remove();
    probe2.remove();

    this.hintSize = {
      widthBase,
      widthPerLetter,
      height,
    };
  }

  async render(elements: Array<ElementWithHint>): Promise<void> {
    const { documentElement } = document;
    if (documentElement == null) {
      return;
    }

    const time = new TimeTracker();

    time.start("prepare");
    this.unrender();
    const viewport = getViewport();
    const { root, shadowRoot } = this.container;

    // `style.sheet` below is only available after the container has been
    // inserted into the DOM.
    documentElement.append(this.container.element);

    if (this.parsedCSS == null) {
      // Inserting a `<style>` element is way faster than doing
      // `element.style.setProperty()` on every element.
      const style = document.createElement("style");
      style.append(document.createTextNode(this.css));
      shadowRoot.append(style);

      // Chrome nicely allows inline styles inserted by an extension regardless
      // of CSP. I look forward to the day Firefox works this way too. See
      // <bugzil.la/1267027>. If `style.sheet` is null in Firefox (it is always
      // available in Chrome), it means that the style tag was blocked by CSP.
      // Unlike the case with the script tag in ElementManager.js, a data URI
      // (`<link rel="stylesheet" href="data:text/css;utf8,...">`) does not work
      // here (it causes no CSP warning in the console, but no styles are
      // applied). The only workaround I could find was manually parsing and
      // applying the CSS.
      if (BROWSER === "firefox" && style.sheet == null) {
        log("log", "RendererProgram#render", "parsing CSS due to CSP");
        this.parsedCSS = parseCSS(this.css);
      }
    }

    root.append(this.shruggieElement);
    root.append(this.titleElement);
    shadowRoot.append(root);
    this.maybeApplyStyles(root);
    this.updateContainer(viewport);
    this.updateHintSize();
    this.container.intersectionObserver.observe(this.container.element);
    this.container.resets.add(
      addEventListener(window, "resize", this.onResize),
      addEventListener(window, "underflow", this.onResize)
    );

    if (elements.length === 0) {
      this.toggleShruggie({ visible: true });
      return;
    }

    const edgeElements = [];
    const restElements = [];
    let numEdgeElements = 0;

    time.start("loop");
    for (const [index, { hintMeasurements, hint }] of elements.entries()) {
      const element = createHintElement(hint);

      const { styles, maybeOutsideHorizontally } = getHintPosition({
        hintSize: this.hintSize,
        hint,
        hintMeasurements,
        viewport,
      });
      setStyles(element, {
        ...styles,
        // Remove 1 so that all hints stay below the title.
        "z-index": String(MAX_Z_INDEX - index - 1),
      });

      root.append(element);
      this.hints.push(element);

      this.maybeApplyStyles(element);

      if (
        numEdgeElements < MAX_IMMEDIATE_HINT_MOVEMENTS &&
        maybeOutsideHorizontally
      ) {
        numEdgeElements = edgeElements.push(element);
      } else {
        restElements.push(element);
      }
    }

    // Most hints are already correctly positioned, but some near the edges
    // might need to be moved a tiny bit to avoid being partially off-screen.
    // Do this in a separate animation frame if there are a lot of hints so
    // that the hints appear on screen as quickly as possible. Adjusting
    // positions is just a tweak – that can be delayed a little bit.
    time.start("move inside 1");
    if (numEdgeElements > 0) {
      this.moveInsideViewport(edgeElements, viewport);
    }

    time.start("paint 1");
    await waitForPaint();

    const firstPaintTimestamp = performance.now();

    time.start("move inside 2");
    const moved = this.moveInsideViewport(restElements, viewport);

    // Only measure the next paint if we actually moved any hints inside the
    // viewport during the second round. This makes the performance report more
    // relevant.
    time.start("paint 2");
    if (moved) {
      await waitForPaint();
    }

    this.sendMessage({
      type: "Rendered",
      firstPaintTimestamp,
      durations: time.export(),
    });
  }

  updateHints(updates: Array<HintUpdate>, enteredTextChars: string) {
    const viewport = getViewport();
    const maybeNeedsMoveInsideViewport = [];

    for (const update of updates) {
      const child = this.hints[update.index];

      if (child == null) {
        log("error", "RendererProgram#updateHints: missing child", update);
        continue;
      }

      // Remember that `HIDDEN_CLASS` just sets `opacity: 0`, so rects will
      // still be available. If that opacity is customized, the chars and
      // position should still be correct.
      switch (update.type) {
        case "Hide":
          child.classList.add(HIDDEN_CLASS);
          break;

        case "UpdateContent": {
          emptyNode(child);

          child.classList.toggle(HIDDEN_CLASS, update.hidden);
          child.classList.toggle(HIGHLIGHTED_HINT_CLASS, update.highlighted);

          if (update.matchedChars !== "") {
            const matched = document.createElement("span");
            matched.className = MATCHED_CHARS_CLASS;
            matched.append(document.createTextNode(update.matchedChars));
            child.append(matched);
            this.maybeApplyStyles(matched);
          }

          if (enteredTextChars !== this.enteredTextChars) {
            setStyles(child, {
              // Only update `z-index` when the entered text chars have changed
              // (that's the only time `z-index` _needs_ updating), to avoid
              // hints rotating back when entering hint chars.
              "z-index": String(MAX_Z_INDEX - update.order),
              // Reset margins for `this.moveInsideViewport`.
              "margin-right": "",
            });
            // If the entered text chars have changed, the hints might have
            // changed as well and might not fit inside the viewport.
            maybeNeedsMoveInsideViewport.push(child);
          }

          child.append(document.createTextNode(update.restChars));

          break;
        }

        case "UpdatePosition": {
          child.classList.toggle(HIDDEN_CLASS, update.hidden);
          child.classList.toggle(HIGHLIGHTED_HINT_CLASS, update.highlighted);
          const { styles } = getHintPosition({
            hintSize: this.hintSize,
            hint: update.hint,
            hintMeasurements: update.hintMeasurements,
            viewport,
          });
          const needsUpdate = Object.entries(styles).some(
            ([property, value]) =>
              child.style.getPropertyValue(property) !== value
          );
          if (needsUpdate) {
            // `update.order` could be used to update the z-index, but that is
            // currently unused due to the hints rotation feature.
            setStyles(child, styles);
            maybeNeedsMoveInsideViewport.push(child);
          }
          break;
        }

        default:
          unreachable(update.type, update);
      }

      this.maybeApplyStyles(child);
    }

    const allHidden =
      updates.filter(update => update.hidden).length === this.hints.length;
    this.toggleShruggie({ visible: allHidden });

    this.setTitle(enteredTextChars.replace(/\s/g, "\u00a0"));

    if (maybeNeedsMoveInsideViewport.length > 0) {
      this.moveInsideViewport(maybeNeedsMoveInsideViewport, viewport);
    }

    this.enteredTextChars = enteredTextChars;
  }

  rotateHints({ forward }: {| forward: boolean |}) {
    const sign = forward ? 1 : -1;
    const stacks = getStacks(this.hints, this.rects);
    for (const stack of stacks) {
      if (stack.length >= 2) {
        // All `z-index`:es are unique, so there’s no need for a stable sort.
        stack.sort(
          (a, b) => (Number(a.style.zIndex) - Number(b.style.zIndex)) * sign
        );
        const [first, ...rest] = stack.map(element => element.style.zIndex);
        const zIndexes = [...rest, first];
        for (const [index, element] of stack.entries()) {
          setStyles(element, { "z-index": zIndexes[index] });
        }
      }
    }
  }

  renderTextRects(rects: Array<Box>, frameId: number) {
    const { root } = this.container;
    for (const rect of rects) {
      const element = document.createElement("div");
      element.className = TEXT_RECT_CLASS;
      element.setAttribute("data-frame-id", String(frameId));
      setStyles(element, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      root.append(element);
    }
  }

  toggleShruggie({ visible }: {| visible: boolean |}) {
    this.shruggieElement.classList.toggle(HIDDEN_CLASS, !visible);
    this.maybeApplyStyles(this.shruggieElement);
  }

  setTitle(title: string) {
    // Avoid unnecessary flashing in the devtools when inspecting the hints.
    if (this.titleText.data !== title) {
      this.titleText.data = title;
    }
    this.titleElement.classList.toggle(HIDDEN_CLASS, title === "");
    this.maybeApplyStyles(this.titleElement);
  }

  togglePeek({ peek }: {| peek: boolean |}) {
    const { root } = this.container;
    root.classList.toggle(PEEK_CLASS, peek);
    this.maybeApplyStyles(root);
  }

  unrender() {
    this.hints = [];
    this.rects.clear();

    this.container.element.remove();
    this.container.root.classList.remove(PEEK_CLASS);
    this.toggleShruggie({ visible: false });
    this.setTitle("");
    emptyNode(this.container.root);
    emptyNode(this.container.shadowRoot);
    this.container.resets.reset();
    this.container.intersectionObserver.disconnect();

    // In theory there can be several left-over elements with `id=CONTAINER_ID`.
    // `querySelectorAll` finds them all.
    const containers = document.querySelectorAll(`#${CONTAINER_ID}`);
    for (const container of containers) {
      container.remove();
    }
  }

  unrenderHintsOnly() {
    for (const element of this.hints) {
      element.remove();
    }
    this.unrenderTextRects();
    this.hints = [];
    this.rects.clear();
  }

  unrenderTextRects(frameId?: number) {
    const selector =
      frameId == null
        ? `.${TEXT_RECT_CLASS}`
        : `.${TEXT_RECT_CLASS}[data-frame-id="${frameId}"]`;
    for (const element of this.container.root.querySelectorAll(selector)) {
      element.remove();
    }
  }

  // It’s important to use `setStyles` instead of `.style.foo =` in this file,
  // since `applyStyles` could override inline styles otherwise.
  maybeApplyStyles(element: HTMLElement) {
    if (BROWSER === "firefox" && this.parsedCSS != null) {
      applyStyles(element, this.parsedCSS);
    }
  }

  moveInsideViewport(elements: Array<HTMLElement>, viewport: Box): boolean {
    let moved = false;

    for (const element of elements) {
      const rect = element.getBoundingClientRect();

      // Save the rect for `rotateHints`.
      this.rects.set(element, rect);

      // The hints are always inside the viewport vertically, so only check
      // horizontally.
      if (rect.left < 0) {
        setStyles(element, { "margin-right": `${Math.round(rect.left)}px` });
        moved = true;
      }
      if (rect.right > viewport.width) {
        setStyles(element, {
          "margin-right": `${Math.round(rect.right - viewport.width)}px`,
        });
        moved = true;
      }
    }

    return moved;
  }
}

function wrapMessage(message: FromRenderer): ToBackground {
  return {
    type: "FromRenderer",
    message,
  };
}

function emptyNode(node: Node) {
  while (node.firstChild != null) {
    node.removeChild(node.firstChild);
  }
}

function createHintElement(hint: string): HTMLElement {
  const element = document.createElement("div");
  element.className = HINT_CLASS;
  element.append(document.createTextNode(hint));
  return element;
}

function getStacks(
  originalElements: Array<HTMLElement>,
  rects: Map<HTMLElement, ClientRect>
): Array<Array<HTMLElement>> {
  // `elements` will be mutated and eventually empty.
  const elements = originalElements.slice();
  const stacks = [];

  while (elements.length > 0) {
    stacks.push(getStackFor(elements.pop(), elements, rects));
  }

  return stacks;
}

// Get an array containing `element` and all elements that overlap `element`, if
// any, which is called a "stack". All elements in the returned stack are spliced
// out from `elements`, thus mutating it.
function getStackFor(
  element: HTMLElement,
  elements: Array<HTMLElement>,
  rects: Map<HTMLElement, ClientRect>
): Array<HTMLElement> {
  const stack = [element];

  let index = 0;
  while (index < elements.length) {
    const nextElement = elements[index];

    // In practice, `rects` will already contain all rects needed (since all
    // hint elements are run through `moveInsideViewport`), so
    // `.getBoundingClientRect()` never hits here. That is a major performance
    // boost.
    const rect = rects.get(element) || element.getBoundingClientRect();
    const nextRect =
      rects.get(nextElement) || nextElement.getBoundingClientRect();

    if (overlaps(nextRect, rect)) {
      // Also get all elements overlapping this one.
      elements.splice(index, 1);
      stack.push(...getStackFor(nextElement, elements, rects));
    } else {
      // Continue the search.
      index += 1;
    }
  }

  return stack;
}

function overlaps(rectA: ClientRect, rectB: ClientRect): boolean {
  return (
    rectA.right >= rectB.left &&
    rectA.left <= rectB.right &&
    rectA.bottom >= rectB.top &&
    rectA.top <= rectB.bottom
  );
}

function getHintPosition({
  hintSize,
  hint,
  hintMeasurements,
  viewport,
}: {|
  hintSize: HintSize,
  hint: string,
  hintMeasurements: HintMeasurements,
  viewport: Box,
|}): {| styles: { [string]: string }, maybeOutsideHorizontally: boolean |} {
  const width = Math.ceil(
    hintSize.widthBase + hintSize.widthPerLetter * hint.length
  );

  const alignLeft =
    hintMeasurements.align === "left" &&
    // If the hint would end up covering the element, align right instead.
    // This is useful for the tiny voting arrows on hackernews.
    hintMeasurements.x + width < hintMeasurements.maxX;

  const left = Math.round(hintMeasurements.x);
  const right = Math.round(viewport.width - hintMeasurements.x);
  const top = Math.max(
    0,
    Math.min(
      Math.floor(viewport.height - hintSize.height),
      Math.round(hintMeasurements.y - hintSize.height / 2)
    )
  );

  const maybeOutsideHorizontally = alignLeft
    ? left + width >= viewport.width
    : right + width >= viewport.width;

  return {
    styles: {
      left: alignLeft ? `${left}px` : "",
      // This could also be done using `left` and
      // `transform: translateX(-100%)`, but that results in blurry hints in
      // Chrome due to Chrome making the widths of the hints non-integer based
      // on the font.
      right: alignLeft ? "" : `${right}px`,
      top: `${top}px`,
    },
    maybeOutsideHorizontally,
  };
}
