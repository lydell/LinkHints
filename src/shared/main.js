// @flow

export type LogLevel = $Keys<typeof LOG_LEVELS>;

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
};

export function log(level: LogLevel, ...args: Array<any>) {
  if (LOG_LEVELS[level] > LOG_LEVELS[log.level]) {
    return;
  }

  const method = getLogMethod(level);
  method.call(
    console,
    "[synth]",
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
log.level = ((PROD ? "error" : "log"): LogLevel);

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
  object: Object,
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
                result.catch(error => {
                  log("error", prefix, error, ...args);
                });
              }
            } catch (error) {
              log("error", prefix, error, ...args);
            }
          } else {
            method.apply(object, args);
          }
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
  options: Object = {}
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
  _callbacks: Array<() => any>;

  constructor() {
    this._callbacks = [];
  }

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

export function stableSort<T>(array: Array<T>, fn: (T, T) => number): Array<T> {
  if (BROWSER === "firefox") {
    // Firefox’s `Array.prototype.sort` is already stable.
    return array.slice().sort(fn);
  }

  return array
    .map((item, index) => ({ item, index }))
    .sort((a, b) => fn(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
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

export function getTitle(element: HTMLElement): ?string {
  const { title } = element;

  // `.title` is undefined for SVG elements.
  if (title == null) {
    return undefined;
  }

  const trimmed = title.trim();
  return trimmed === "" ? undefined : trimmed;
}
