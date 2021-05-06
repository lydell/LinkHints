// @flow

import {
  chain,
  Decoder,
  DecoderError,
  number,
  stringUnion,
} from "tiny-decoders";

// It's tempting to put a random number or something in the ID, but in case
// something goes wrong and a rogue container is left behind it's always
// possible to find and remove it if the ID is known. Also, RendererProgram and
// ElementManager might not get the same random number.
export const CONTAINER_ID = `__${META_SLUG}WebExt`;

export type LogLevel = ReturnType<typeof LogLevel>;
export const LogLevel = stringUnion({
  error: null,
  warn: null,
  log: null,
  debug: null,
});

export const LOG_LEVELS: { [key in LogLevel]: number } = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
};

export const DEFAULT_LOG_LEVEL: LogLevel = PROD
  ? "warn"
  : LogLevel(DEFAULT_LOG_LEVEL_CONFIG);

export function log(level: LogLevel, ...args: Array<unknown>): void {
  if (LOG_LEVELS[level] > LOG_LEVELS[log.level]) {
    return;
  }

  const method = getLogMethod(level);
  method.call(
    console,
    `[${META_SLUG}]`,
    formatDate(new Date()),
    window.location.protocol.endsWith("-extension:")
      ? "extension page"
      : window.location.href,
    "\n ",
    ...args.map((arg) => (arg instanceof DecoderError ? arg.format() : arg))
  );
}

// The main `Program` for each entrypoint modifies this property. A little ugly,
// but very convenient.
log.level = DEFAULT_LOG_LEVEL;

function formatDate(date: Date): string {
  const pad = (num: number, length: number = 2): string =>
    num.toString().padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}.${pad(date.getMilliseconds(), 3)}`;
}

/* eslint-disable no-console */
function getLogMethod(level: LogLevel): AnyFunction {
  switch (level) {
    case "error":
      return console.error;

    case "warn":
      return console.warn;

    case "log":
      return console.log;

    case "debug":
      return console.debug;
  }
}
/* eslint-enable no-console */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Method = (...args: Array<any>) => Promise<void> | void;

/*
Binds class methods to the instance, so you can do `foo(this.method)` instead
of `foo(this.method.bind(this))`.

Optionally enable auto-logging and/or auto-catching plus logging of errors.
Only works with methods returning `void` or `Promise<void>` for now.

Example:

    class Example {
      constructor() {
        bind(this, [this.method1, [this.method2, { log: true, catch: true }]]);
      }
      method1() {}
      method2() {}
    }
*/
export function bind(
  object: unknown,
  methods: Array<Method | [Method, { log?: boolean; catch?: boolean }]>
): void {
  for (const item of methods) {
    const [method, options] = Array.isArray(item) ? item : [item, {}];
    const { log: shouldLog = false, catch: shouldCatch = false } = options;

    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value: Object.defineProperty(
        (...args: Array<unknown>) => {
          const prefix = `${
            (object as { constructor: AnyFunction }).constructor.name
          }#${method.name}`;
          if (shouldLog) {
            log("log", prefix, ...args);
          }
          if (shouldCatch) {
            try {
              const result = method.apply(object, args);
              if (result != null && typeof result.then === "function") {
                result.then(undefined, (error) => {
                  log("error", prefix, error, ...args);
                });
              }
              return result;
            } catch (error) {
              log("error", prefix, error, ...args);
            }
          } else {
            method.apply(object, args);
          }
          return undefined;
        },
        "name",
        { value: method.name }
      ),
    });
  }
}

export function unreachable(value: never, ...args: Array<unknown>): never {
  const message = `Unreachable: ${value as string}\n${JSON.stringify(
    args,
    undefined,
    2
  )}`;
  throw new Error(message);
}

export function addEventListener(
  target: EventTarget,
  eventName: string,
  listener: AnyFunction,
  options: { capture?: boolean; passive?: boolean } = {}
): () => void {
  const fullOptions = { capture: true, passive: true, ...options };
  target.addEventListener(eventName, listener, fullOptions);
  return () => {
    target.removeEventListener(eventName, listener, fullOptions);
  };
}

export function addListener<Listener, Options>(
  target: {
    addListener: (listener: Listener, options?: Options) => void;
    removeListener: (listener: Listener) => void;
  },
  listener: Listener,
  options?: Options
): () => void {
  if (options == null) {
    target.addListener(listener);
  } else {
    target.addListener(listener, options);
  }
  return () => {
    target.removeListener(listener);
  };
}

export function timeout(duration: number, callback: () => unknown): () => void {
  const timeoutId = setTimeout(callback, duration);
  return () => {
    clearTimeout(timeoutId);
  };
}

export class Resets {
  _callbacks: Array<() => unknown> = [];

  add(...callbacks: Array<() => unknown>): void {
    this._callbacks.push(...callbacks);
  }

  reset(): void {
    for (const callback of this._callbacks) {
      callback();
    }
    this._callbacks = [];
  }
}

/**
 * Divides `array` into two arrays, `left`, and `right`, using `fn`. If
 * `fn(item)` returns `true`, `item` is placed in `left`, otherwise in `right`.
 */
export function partition<T>(
  array: Array<T>,
  fn: (item: T, index: number, array: Array<T>) => boolean
): [Array<T>, Array<T>] {
  const left: Array<T> = [];
  const right: Array<T> = [];

  array.forEach((item, index) => {
    if (fn(item, index, array)) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  return [left, right];
}

export function makeRandomToken(): string {
  const array = new Uint32Array(3);
  window.crypto.getRandomValues(array);
  return array.join("");
}

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type IntermediateRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// Turn a `ClientRect` into a `Box` using the coordinates of the topmost
// viewport. Only the part of the `ClientRect` visible through all viewports end
// up in the `Box`.
export function getVisibleBox(
  passedRect: ClientRect,
  viewports: Array<Box>
): Box | undefined {
  // No shortcuts (such as summing up viewport x:s and y:s) can be taken here,
  // since each viewport (frame) clips the visible area. We have to loop them
  // all through.
  const visibleRect = viewports.reduceRight<IntermediateRect>(
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

  // If `visibleRect` has a nonsensical width or height it means it is not
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

export function getViewport(): Box {
  // In `<frameset>` documents `.scrollingElement` is null so fall back to
  // `.documentElement`.
  const scrollingElement =
    document.scrollingElement ?? document.documentElement;

  // `scrollingElement.client{Width,Height}` is the size of the viewport without
  // scrollbars (unlike `window.inner{Width,Height}` which include the
  // scrollbars). This works in both Firefox and Chrome, quirks and non-quirks
  // mode and with strange styling like setting a width on `<html>`.
  return {
    x: 0,
    y: 0,
    width: scrollingElement.clientWidth,
    height: scrollingElement.clientHeight,
  };
}

export function setStyles(
  element: HTMLElement,
  styles: { [key: string]: string }
): void {
  for (const [property, value] of Object.entries(styles)) {
    // $FlowIgnore: Flow thinks that `value` is `unknown` here, but it is a `string`.
    element.style.setProperty(property, value, "important");
  }
}

export const NON_WHITESPACE = /\S/;
export const LAST_NON_WHITESPACE = /\S\s*$/;

export const SKIP_TEXT_ELEMENTS: Set<string> = new Set([
  // Ignore the default text in the HTML of `<textarea>` (if any), which is not
  // updated as the user types.
  "TEXTAREA",
  // Ignore the text of `<option>`s inside `<select>` and `<datalist>`, most
  // of which are not visible.
  "SELECT",
  "DATALIST",
  // Ignore fallback content inside `<canvas>`, `<audio>` and `<video>`.
  "CANVAS",
  "AUDIO",
  "VIDEO",
  // Google has `<style>` elements inside some `<div>`s with click listeners.
  "STYLE",
  // If we ignore `<style>` we could just as well ignore `<script>` too.
  "SCRIPT",
  // Finally, ignore the two elements with the most text of all. They aren’t
  // useful and cause performance issues.
  "HTML",
  "BODY",
]);

function shouldSkipElementText(element: HTMLElement): boolean {
  return (
    // Checking `.nodeName` is ~3x faster than `instanceof` in the link monster
    // demo.
    SKIP_TEXT_ELEMENTS.has(element.nodeName) ||
    // Shadow hosts _can_ have text that is never displayed. Ideally we should
    // catch closed shadow roots as well, but it’s unclear if it’s worth the
    // trouble.
    element.shadowRoot != null
  );
}

export function* walkTextNodes(
  element: HTMLElement
): Generator<Text, void, void> {
  let ignoreText = false;

  if (!shouldSkipElementText(element)) {
    for (const node of element.childNodes) {
      if (node instanceof Text) {
        if (!ignoreText) {
          // Detect 1px elements with `overflow: hidden;` used to visually hide
          // screen reader text. One has to measure the _element_ – because the
          // (clipped) _text_ still has a reasonable size!
          const parentRect = element.getBoundingClientRect();
          const isScreenReaderOnly =
            parentRect.width <= 1 && parentRect.height <= 1;
          if (isScreenReaderOnly) {
            ignoreText = true;
          } else {
            yield node;
          }
        }
      } else if (node instanceof HTMLElement) {
        yield* walkTextNodes(node);
      }
    }
  }
}

// This is like `element.textContent`, except it skips the content of some
// elements (see `walkTextNodes`). This does not seem to be slower than
// `.textContent`.
export function extractText(element: HTMLElement): string {
  if (shouldSkipElementText(element)) {
    return "";
  }
  const onlyChild =
    element.childNodes.length === 1 ? element.childNodes[0] : undefined;
  return onlyChild != null && onlyChild instanceof Text
    ? onlyChild.data
    : // This line is sufficient by itself. The above is just a performance
      // optimization for a common case (a single text node child).
      Array.from(walkTextNodes(element), (node) => node.data).join("");
}

export function getTextRects({
  element,
  viewports,
  words,
  checkElementAtPoint = true,
}: {
  element: HTMLElement;
  viewports: Array<Box>;
  words: Set<string>;
  checkElementAtPoint?: boolean;
}): Array<Box> {
  const text = extractText(element).toLowerCase();

  const ranges = [];

  for (const word of words) {
    let index = -1;
    while ((index = text.indexOf(word, index + 1)) >= 0) {
      ranges.push({
        start: index,
        end: index + word.length,
        range: document.createRange(),
      });
    }
  }

  if (ranges.length === 0) {
    return [];
  }

  let index = 0;

  for (const node of walkTextNodes(element)) {
    const nextIndex = index + node.length;

    for (const { start, end, range } of ranges) {
      if (start >= index && start < nextIndex) {
        range.setStart(node, start - index);
      }
      if (end >= index && end <= nextIndex) {
        range.setEnd(node, end - index);
      }
    }

    index = nextIndex;
  }

  const [offsetX, offsetY] = viewports.reduceRight(
    ([x, y], viewport) => [x + viewport.x, y + viewport.y],
    [0, 0]
  );

  return ranges.flatMap(({ range }) => {
    const rects = range.getClientRects();
    return Array.from(rects, (rect) => {
      const box = getVisibleBox(rect, viewports);
      if (box == null) {
        return [];
      }
      if (!checkElementAtPoint) {
        return box;
      }
      const elementAtPoint = getElementFromPoint(
        element,
        Math.round(box.x + box.width / 2 - offsetX),
        Math.round(box.y + box.height / 2 - offsetY)
      );
      return elementAtPoint != null && element.contains(elementAtPoint)
        ? box
        : [];
    }).flat();
  });
}

export function getElementFromPoint(
  element: HTMLElement,
  x: number,
  y: number
): HTMLElement | undefined {
  const root = element.getRootNode();
  const doc =
    root instanceof Document || root instanceof ShadowRoot ? root : document;
  const elementFromPoint = doc.elementFromPoint(x, y);
  return elementFromPoint === null
    ? undefined
    : (elementFromPoint as HTMLElement);
}

export function getElementsFromPoint(
  element: HTMLElement,
  x: number,
  y: number
): Array<HTMLElement> {
  const root = element.getRootNode();
  const doc =
    root instanceof Document || root instanceof ShadowRoot ? root : document;
  return doc.elementsFromPoint(x, y) as Array<HTMLElement>;
}

export function getLabels(
  element: HTMLElement
): NodeListOf<HTMLLabelElement> | undefined {
  // @ts-expect-error Only some types of elements have `.labels`, and I'm not going to `instanceof` check them all.
  const labels: unknown = element.labels; // eslint-disable-line prefer-destructuring
  return labels instanceof NodeList
    ? (labels as NodeListOf<HTMLLabelElement>)
    : undefined;
}

export function classlist(
  ...args: Array<string | { [key: string]: boolean }>
): string {
  return args
    .flatMap((arg) =>
      typeof arg === "string"
        ? arg
        : Object.entries(arg)
            .filter(([, enabled]) => enabled)
            .map(([className]) => className)
    )
    .join(" ");
}

export function isMixedCase(string: string): boolean {
  return string.toLowerCase() !== string && string.toUpperCase() !== string;
}

export function splitEnteredText(enteredText: string): Array<string> {
  return enteredText.split(" ").filter((word) => word !== "");
}

// Deep equal for JSON data.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }

    for (let index = a.length - 1; index >= 0; index--) {
      if (!deepEqual(a[index], b[index])) {
        return false;
      }
    }

    return true;
  }

  if (
    typeof a === "object" &&
    a != null &&
    typeof b === "object" &&
    b != null
  ) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    const keys = new Set(keysA.concat(keysB));

    for (const key of keys) {
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      ) {
        return false;
      }
    }

    return true;
  }

  return false;
}

export const UnsignedInt: Decoder<number> = chain(number, (value) => {
  if (!(Number.isFinite(value) && value >= 0 && Number.isInteger(value))) {
    throw new DecoderError({
      message: `Expected an unsigned finite integer`,
      value,
    });
  }
  return value;
});

export function normalizeUnsignedInt(
  value: string,
  defaultValue: number
): string {
  const parsed = parseFloat(value);
  const defaulted =
    Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed)
      ? parsed
      : defaultValue;
  return defaulted.toString();
}

export const UnsignedFloat: Decoder<number> = chain(number, (value) => {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new DecoderError({
      message: "Expected an unsigned finite float",
      value,
    });
  }
  return value;
});

export function normalizeUnsignedFloat(
  value: string,
  defaultValue: number
): string {
  const parsed = parseFloat(value);
  const defaulted =
    Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
  return defaulted.toString();
}
