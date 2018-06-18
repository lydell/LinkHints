// @flow

// Example: `window.__loaded__2018-06-17T12:19:03.657Z`.
// Used to detect if content scripts have been loaded or not.
export const LOADED_KEY = `__loaded__${BUILD_TIME}`;

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
        async (...args: Array<any>): Promise<void> => {
          const prefix = `${object.constructor.name}#${method.name}`;
          if (shouldLog) {
            log("log", prefix, ...args);
          }
          if (shouldCatch) {
            try {
              await method.apply(object, args);
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
