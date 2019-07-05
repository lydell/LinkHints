// @flow

import { type Decoder, map, number, repr } from "tiny-decoders";

// It's tempting to put a random number or something in the ID, but in case
// something goes wrong and a rogue container is left behind it's always
// possible to find and remove it if the ID is known. Also, RendererProgram and
// ElementManager might not get the same random number.
export const CONTAINER_ID = `__${META_SLUG}WebExt`;

export type LogLevel = $Keys<typeof LOG_LEVELS>;

export function decodeLogLevel(logLevel: mixed): LogLevel {
  switch (logLevel) {
    case "error":
    case "warn":
    case "log":
    case "debug":
      return logLevel;
    default:
      throw new TypeError(`Invalid LogLevel: ${repr(logLevel)}`);
  }
}

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
};

export const DEFAULT_LOG_LEVEL: LogLevel = PROD
  ? "error"
  : decodeLogLevel(DEFAULT_LOG_LEVEL_CONFIG);

export function log(level: LogLevel, ...args: Array<any>) {
  if (LOG_LEVELS[level] > LOG_LEVELS[log.level]) {
    return;
  }

  const method = getLogMethod(level);
  method.call(
    console,
    `[${META_SLUG}]`,
    new Date().toISOString(),
    window.location.protocol.endsWith("-extension:")
      ? ""
      : window.location.href,
    "\n ",
    ...args
  );
}

// The main `Program` for each entrypoint modifies this property. A little ugly,
// but very convenient.
log.level = DEFAULT_LOG_LEVEL;

/* eslint-disable no-console */
function getLogMethod(level: LogLevel): Function {
  switch (level) {
    case "error":
      return console.error;

    case "warn":
      return console.warn;

    case "log":
      return console.log;

    case "debug":
      return console.debug;

    default:
      return unreachable(level);
  }
}
/* eslint-enable no-console */

type Method = (...args: Array<any>) => void | Promise<void>;

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
  object: { [string]: mixed, ... },
  methods: Array<Method | [Method, {| log?: boolean, catch?: boolean |}]>
) {
  for (const item of methods) {
    const [method, options] = Array.isArray(item) ? item : [item, {}];
    const { log: shouldLog = false, catch: shouldCatch = false } = options;

    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      value: Object.defineProperty(
        (...args: Array<any>) => {
          const prefix = `${object.constructor.name}#${method.name}`;
          if (shouldLog) {
            log("log", prefix, ...args);
          }
          if (shouldCatch) {
            try {
              const result = method.apply(object, args);
              if (result != null && typeof result.then === "function") {
                result.then(undefined, error => {
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

export function unreachable(value: empty, ...args: Array<any>) {
  const message = `Unreachable: ${value}\n${JSON.stringify(
    args,
    undefined,
    2
  )}`;
  throw new Error(message);
}

export function addEventListener(
  target: EventTarget,
  eventName: string,
  listener: Function,
  options: { [string]: mixed, ... } = {}
): () => void {
  const fullOptions = { capture: true, passive: true, ...options };
  target.addEventListener(eventName, listener, fullOptions);
  return () => {
    target.removeEventListener(eventName, listener, fullOptions);
  };
}

export function addListener<Listener, Options>(
  target: {
    addListener: (Listener, options?: Options) => void,
    removeListener: Listener => void,
    ...
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

export class Resets {
  _callbacks: Array<() => any> = [];

  add(...callbacks: Array<() => any>) {
    this._callbacks.push(...callbacks);
  }

  reset() {
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
  fn: (T, number, Array<T>) => boolean
): [Array<T>, Array<T>] {
  const left = [];
  const right = [];

  array.forEach((item, index) => {
    if (fn(item, index, array)) {
      left.push(item);
    } else {
      right.push(item);
    }
  });

  return [left, right];
}

// Using double `requestAnimationFrame` since they run before paint.
// See: https://youtu.be/cCOL7MC4Pl0?t=20m29s
export function waitForPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

export function makeRandomToken(): string {
  const array = new Uint32Array(3);
  window.crypto.getRandomValues(array);
  return array.join("");
}

export type Box = {|
  +x: number,
  +y: number,
  +width: number,
  +height: number,
|};

// Turn a `ClientRect` into a `Box` using the coordinates of the topmost
// viewport. Only the part of the `ClientRect` visible through all viewports end
// up in the `Box`.
export function getVisibleBox(
  passedRect: ClientRect,
  viewports: Array<Box>
): ?Box {
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

export function getViewport(): Box {
  // In `<frameset>` documents `.scrollingElement` is null so fall back to
  // `.documentElement`.
  const scrollingElement =
    document.scrollingElement || document.documentElement;

  if (scrollingElement == null) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

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
  styles: { [string]: string, ... }
) {
  for (const [property, value] of Object.entries(styles)) {
    // $FlowIgnore: Flow thinks that `value` is `mixed` here, but it is a `string`.
    element.style.setProperty(property, value, "important");
  }
}

export function* walkTextNodes(
  element: HTMLElement
): Generator<Text, void, void> {
  for (const node of element.childNodes) {
    if (node instanceof Text) {
      yield node;
    } else if (node instanceof HTMLElement) {
      yield* walkTextNodes(node);
    }
  }
}

export function getTextRects({
  element,
  viewports,
  words,
  checkElementAtPoint = true,
}: {|
  element: HTMLElement,
  viewports: Array<Box>,
  words: Set<string>,
  checkElementAtPoint?: boolean,
|}): Array<Box> {
  const text =
    // Ignore text inside `<textarea>`, `<select>` and `<canvas>`, as explained
    // in `extractText` in `worker/Program.js`.
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? ""
      : element.textContent.toLowerCase();

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

  return [].concat(
    ...ranges.map(({ range }) => {
      const rects = range.getClientRects();
      return Array.from(rects, rect => {
        const box = getVisibleBox(rect, viewports);
        if (box == null) {
          return undefined;
        }
        if (!checkElementAtPoint) {
          return box;
        }
        const elementAtPoint = document.elementFromPoint(
          Math.round(box.x + box.width / 2 - offsetX),
          Math.round(box.y + box.height / 2 - offsetY)
        );
        return elementAtPoint != null && element.contains(elementAtPoint)
          ? box
          : undefined;
      }).filter(Boolean);
    })
  );
}

export function classlist(
  ...args: Array<string | { [string]: boolean, ... }>
): string {
  return []
    .concat(
      ...args.map(arg =>
        typeof arg === "string"
          ? arg
          : Object.entries(arg)
              .filter(([, enabled]) => enabled)
              .map(([className]) => className)
      )
    )
    .join(" ");
}

export function isMixedCase(string: string): boolean {
  return string.toLowerCase() !== string && string.toUpperCase() !== string;
}

export function splitEnteredText(enteredText: string): Array<string> {
  return enteredText.split(" ").filter(word => word !== "");
}

// Deep equal for JSON data.
export function deepEqual(a: mixed, b: mixed): boolean {
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
      if (!deepEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

export const decodeUnsignedInt: Decoder<number> = map(number, value => {
  if (!(Number.isFinite(value) && value >= 0 && Number.isInteger(value))) {
    throw new TypeError(
      `Expected an unsigned finite integer, but got: ${repr(value)}`
    );
  }
  return value;
});

export function normalizeUnsignedInt(
  value: string,
  defaultValue: number
): string {
  const parsed = parseFloat(value);
  return String(
    Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed)
      ? parsed
      : defaultValue
  );
}

export const decodeUnsignedFloat: Decoder<number> = map(number, value => {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new TypeError(
      `Expected an unsigned finite float, but got: ${repr(value)}`
    );
  }
  return value;
});

export function normalizeUnsignedFloat(
  value: string,
  defaultValue: number
): string {
  const parsed = parseFloat(value);
  return String(Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue);
}
