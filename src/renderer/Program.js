// @flow strict-local

import {
  CONTAINER_STYLES,
  CSS,
  HAS_MATCHED_CHARS_CLASS,
  HIDDEN_CLASS,
  HIGHLIGHTED_HINT_CLASS,
  HINT_CLASS,
  MATCHED_CHARS_CLASS,
  MAX_Z_INDEX,
  MIN_Z_INDEX,
  MIXED_CASE_CLASS,
  PEEK_CLASS,
  ROOT_CLASS,
  SHRUGGIE,
  SHRUGGIE_CLASS,
  STATUS_CLASS,
  TEXT_RECT_CLASS,
} from "../shared/css";
import type {
  ElementRender,
  HintMeasurements,
  HintUpdate,
} from "../shared/hints";
import {
  type Box,
  addEventListener,
  addListener,
  bind,
  CONTAINER_ID,
  getViewport,
  log,
  partition,
  Resets,
  setStyles,
  unreachable,
} from "../shared/main";
import type {
  FromBackground,
  FromRenderer,
  ToBackground,
} from "../shared/messages";
import { TimeTracker } from "../shared/perf";
import { tweakable, unsignedInt } from "../shared/tweakable";
import { type Rule, applyStyles, parseCSS } from "./css";

type HintSize = {
  widthBase: number,
  widthPerLetter: number,
  height: number,
};

export const t = {
  MAX_IMMEDIATE_HINT_MOVEMENTS: unsignedInt(50),
};

export const tMeta = tweakable("Renderer", t);

export default class RendererProgram {
  hints: Array<HTMLElement> = [];
  rects: Map<HTMLElement, ClientRect> = new Map();
  enteredText: string = "";
  resets: Resets = new Resets();
  shruggieElement: HTMLElement;
  statusElement: HTMLElement;
  statusText: Text;
  hintSize: HintSize;
  container: {
    element: HTMLElement,
    root: HTMLElement,
    shadowRoot: ShadowRoot,
    resets: Resets,
    intersectionObserver: IntersectionObserver,
  };

  css: {
    text: string,
    parsed: ?Array<Rule>,
  } = {
    text: CSS,
    parsed: undefined,
  };

  constructor() {
    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { catch: true }],
      [this.stop, { log: true, catch: true }],
      [this.render, { catch: true }],
      this.onIntersection,
      this.onPageShow,
      this.onResize,
    ]);

    this.shruggieElement = createHintElement(SHRUGGIE);
    this.shruggieElement.classList.add(SHRUGGIE_CLASS);
    setStyles(this.shruggieElement, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      "z-index": MAX_Z_INDEX.toString(),
    });

    this.statusElement = document.createElement("div");
    this.statusElement.classList.add(STATUS_CLASS);
    this.statusText = document.createTextNode("");
    this.statusElement.append(this.statusText);
    setStyles(this.statusElement, {
      position: "absolute",
      "z-index": MAX_Z_INDEX.toString(),
    });

    this.hintSize = {
      widthBase: 0,
      widthPerLetter: 0,
      height: 0,
    };

    const container = document.createElement("div");
    container.id = CONTAINER_ID;
    setStyles(container, CONTAINER_STYLES);

    // Using `mode: "closed"` means that ElementManager won’t be able to get
    // into this shadow root, which is a small optimization. (The override of
    // `.attachShadow` in injected.js does not apply to code running in the
    // extension context, only in the page context).
    const shadowRoot = container.attachShadow({ mode: "closed" });

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

  async start() {
    // This is useful during development. If reloading the extension during
    // hints mode, the old hints will be removed as soon as the new version
    // starts.
    this.unrender();

    this.resets.add(
      addListener(browser.runtime.onMessage, this.onMessage),
      addEventListener(window, "pageshow", this.onPageShow)
    );

    try {
      // Don’t use `this.sendMessage` since it automatically catches and logs
      // errors.
      await browser.runtime.sendMessage(
        wrapMessage({ type: "RendererScriptAdded" })
      );
    } catch {
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

  async sendMessage(message: FromRenderer) {
    log("log", "RendererProgram#sendMessage", message.type, message, this);
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

    log("log", "RendererProgram#onMessage", message.type, message, this);

    switch (message.type) {
      case "StateSync": {
        const newCSS = `${CSS}\n\n${message.css}`;
        const changedCSS = this.css.text !== newCSS;
        this.css.text = newCSS;
        log.level = message.logLevel;
        if (BROWSER === "firefox" && this.css.parsed != null && changedCSS) {
          this.css.parsed = parseCSS(this.css.text);
        }
        break;
      }

      case "Render":
        this.render(message.elements, { mixedCase: message.mixedCase });
        break;

      case "UpdateHints":
        this.updateHints(message.updates, message.enteredText);
        break;

      case "RotateHints":
        this.rotateHints({ forward: message.forward });
        break;

      case "RenderTextRects":
        this.unrenderTextRects(message.frameId);
        this.renderTextRects(message.rects, message.frameId);
        break;

      case "Peek":
        this.togglePeek({ peek: true });
        break;

      case "Unpeek":
        this.togglePeek({ peek: false });
        break;

      case "Unrender":
        this.unrender();
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

  // When coming back to a page via the back button in Firefox, there might be
  // left-over hints on screen that never got a chance to be unrendered. This
  // happens if the user clicks a link while hints mode is active, or if
  // clicking a link to a JSON file using hints. So always unrender when we
  // return to the page via the back/forward buttons.
  // `BackgroundProgram` also gets events when this happens from
  // `WorkerProgram`, so we _could_ do this in response to a message from
  // `BackgroundProgram` instead. However, by having our own listener we can
  // unrender faster, to avoid old hints flashing by on screen.
  onPageShow(event: Event) {
    // $FlowIgnore: Flow doesn't know about `PageTransitionEvent` yet.
    if (event.persisted) {
      this.unrender();
    }
  }

  updateContainer(viewport: { +width: number, +height: number, ... }) {
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
    setStyles(probe1, { position: "absolute" });
    setStyles(probe2, { position: "absolute" });
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

  async render(
    elements: Array<ElementRender>,
    { mixedCase }: { mixedCase: boolean }
  ) {
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

    if (this.css.parsed == null) {
      // Inserting a `<style>` element is way faster than doing
      // `element.style.setProperty()` on every element.
      const style = document.createElement("style");
      style.append(document.createTextNode(this.css.text));
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
        this.css.parsed = parseCSS(this.css.text);
      }
    }

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
      root.append(this.shruggieElement);
      this.maybeApplyStyles(this.shruggieElement);
      return;
    }

    const edgeElements = [];
    const restElements = [];
    let numEdgeElements = 0;

    for (const {
      hintMeasurements,
      hint,
      highlighted,
      invertedZIndex,
    } of elements) {
      time.start("loop:create");
      const element = createHintElement(hint);
      element.classList.toggle(HIGHLIGHTED_HINT_CLASS, highlighted);
      if (mixedCase) {
        element.classList.add(MIXED_CASE_CLASS);
      }

      time.start("loop:position");
      const { styles, maybeOutsideHorizontally } = getHintPosition({
        hintSize: this.hintSize,
        hint,
        hintMeasurements,
        viewport,
      });
      setStyles(element, {
        ...styles,
        // Remove 1 so that all hints stay below the status.
        "z-index": (MAX_Z_INDEX - invertedZIndex - 1).toString(),
      });

      time.start("loop:append");
      root.append(element);
      this.hints.push(element);

      this.maybeApplyStyles(element);

      if (
        numEdgeElements < t.MAX_IMMEDIATE_HINT_MOVEMENTS.value &&
        maybeOutsideHorizontally
      ) {
        numEdgeElements = edgeElements.push(element);
      } else {
        restElements.push(element);
      }
    }

    // This are appended last, so that the shruggie can be shown based on if
    // there are any non-hidden hints before it using CSS selectors.
    root.append(this.shruggieElement);
    root.append(this.statusElement);
    this.maybeApplyStyles(this.shruggieElement);
    this.maybeApplyStyles(this.statusElement);

    // Most hints are already correctly positioned, but some near the edges
    // might need to be moved a tiny bit to avoid being partially off-screen.
    // Do this in a separate animation frame if there are a lot of hints so
    // that the hints appear on screen as quickly as possible. Adjusting
    // positions is just a tweak – that can be delayed a little bit.
    time.start("move inside 1");
    if (numEdgeElements > 0) {
      this.moveInsideViewport(edgeElements, viewport);
    }

    time.start("waitUntilBeforeNextRepaint 1");
    await waitUntilBeforeNextRepaint();
    const firstPaintTimestamp = Date.now();

    time.start("move inside 2");
    // We just waited until just before the next repaint. Wait just a little bit
    // more (but not a full ~16ms frame) to let the hints appear on screen
    // before moving the remaining hints.
    await wait0();
    const moved = this.moveInsideViewport(restElements, viewport);

    // Only measure the next paint if we actually moved any hints inside the
    // viewport during the second round. This makes the performance report more
    // relevant.
    time.start("waitUntilBeforeNextRepaint 2");
    if (moved) {
      await waitUntilBeforeNextRepaint();
    }

    const lastPaintTimestamp = Date.now();

    this.sendMessage({
      type: "Rendered",
      firstPaintTimestamp,
      lastPaintTimestamp,
      durations: time.export(),
    });
  }

  updateHints(updates: Array<HintUpdate>, enteredText: string) {
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
          // Avoid unnecessary flashing in the devtools when inspecting the hints.
          const zeroWidthSpace = "\u200B";
          const needsTextUpdate =
            child.textContent !==
            `${update.matchedChars}${zeroWidthSpace}${update.restChars}`;

          if (needsTextUpdate) {
            emptyNode(child);
          }

          const hasMatchedChars = update.matchedChars !== "";

          child.classList.toggle(HIDDEN_CLASS, update.hidden);
          child.classList.toggle(HAS_MATCHED_CHARS_CLASS, hasMatchedChars);
          child.classList.toggle(HIGHLIGHTED_HINT_CLASS, update.highlighted);

          if (hasMatchedChars && needsTextUpdate) {
            const matched = document.createElement("span");
            matched.className = MATCHED_CHARS_CLASS;
            matched.append(document.createTextNode(update.matchedChars));
            child.append(matched);
            this.maybeApplyStyles(matched);
          }

          if (enteredText !== this.enteredText) {
            setStyles(child, {
              // Only update `z-index` when the entered text chars have changed
              // (that's the only time `z-index` _needs_ updating), to avoid
              // hints rotating back when entering hint chars.
              "z-index": (MAX_Z_INDEX - update.order).toString(),
            });
            // If the entered text chars have changed, the hints might have
            // changed as well and might not fit inside the viewport.
            maybeNeedsMoveInsideViewport.push(child);
          }

          if (needsTextUpdate) {
            child.append(
              document.createTextNode(`${zeroWidthSpace}${update.restChars}`)
            );
          }

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

      // Hidden hints get negative z-index so that visible hints are always
      // shown on top.
      const zIndex = Number(child.style.zIndex);
      const zIndexNeedsUpdate = child.classList.contains(HIDDEN_CLASS)
        ? zIndex > 0
        : zIndex < 0;
      if (zIndexNeedsUpdate) {
        setStyles(child, { "z-index": (-zIndex).toString() });
      }

      this.maybeApplyStyles(child);
    }

    this.maybeApplyStyles(this.shruggieElement);

    this.setStatus(enteredText.replace(/\s/g, "\u00a0"));

    if (maybeNeedsMoveInsideViewport.length > 0) {
      this.moveInsideViewport(maybeNeedsMoveInsideViewport, viewport);
    }

    this.enteredText = enteredText;
  }

  rotateHints({ forward }: { forward: boolean }) {
    const sign = forward ? 1 : -1;
    const stacks = getStacks(this.hints, this.rects);
    for (const stack of stacks) {
      if (stack.length >= 2) {
        // Hidden hints are rotated separately.
        const groups = partition(stack, (element) =>
          element.classList.contains(HIDDEN_CLASS)
        );
        for (const group of groups) {
          // All `z-index`:es are unique, so there’s no need for a stable sort.
          group.sort(
            (a, b) => (Number(a.style.zIndex) - Number(b.style.zIndex)) * sign
          );
          const [first, ...rest] = group.map((element) => element.style.zIndex);
          const zIndexes = [...rest, first];
          for (const [index, element] of group.entries()) {
            setStyles(element, { "z-index": zIndexes[index] });
          }
        }
      }
    }
  }

  renderTextRects(rects: Array<Box>, frameId: number) {
    const { root } = this.container;
    for (const rect of rects) {
      const element = document.createElement("div");
      element.className = TEXT_RECT_CLASS;
      element.setAttribute("data-frame-id", frameId.toString());
      setStyles(element, {
        position: "absolute",
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        "z-index": MIN_Z_INDEX.toString(),
      });
      root.append(element);
    }
  }

  setStatus(status: string) {
    // Avoid unnecessary flashing in the devtools when inspecting the hints.
    if (this.statusText.data !== status) {
      this.statusText.data = status;
    }
    this.maybeApplyStyles(this.statusElement);
  }

  togglePeek({ peek }: { peek: boolean }) {
    const { root } = this.container;
    root.classList.toggle(PEEK_CLASS, peek);
    this.maybeApplyStyles(root);
  }

  unrender() {
    this.hints = [];
    this.rects.clear();

    this.container.element.remove();
    this.container.root.classList.remove(PEEK_CLASS);
    this.maybeApplyStyles(this.shruggieElement);
    this.setStatus("");
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
    if (BROWSER === "firefox" && this.css.parsed != null) {
      applyStyles(element, this.css.parsed);
    }
  }

  moveInsideViewport(elements: Array<HTMLElement>, viewport: Box): boolean {
    let moved = false;

    for (const element of elements) {
      // Reset `margin-right` before measuring. That’s the easiest way, and does
      // not seem to be expensive performance wise.
      setStyles(element, { "margin-right": "" });

      const rect = element.getBoundingClientRect();

      // Save the rect for `rotateHints`.
      this.rects.set(element, rect);

      // The hints are always inside the viewport vertically, so only check
      // horizontally. Note that the width of the hints will be a fractional
      // number in Chrome.

      const left = Math.round(rect.left);
      if (left < 0) {
        setStyles(element, { "margin-right": `${left}px` });
        moved = true;
      }

      const right = Math.round(rect.right - viewport.width);
      if (right > 0) {
        setStyles(element, {
          "margin-right": `${right}px`,
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
}: {
  hintSize: HintSize,
  hint: string,
  hintMeasurements: HintMeasurements,
  viewport: Box,
}): {
  styles: { [string]: string, ... },
  maybeOutsideHorizontally: boolean,
} {
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
      position: "absolute",
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

function waitUntilBeforeNextRepaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function wait0(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
