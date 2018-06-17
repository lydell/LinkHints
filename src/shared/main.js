// @flow

// Example: `window.__loaded__2018-06-17T12:19:03.657Z`.
// Used to detect if content scripts have been loaded or not.
export const LOADED_KEY = `__loaded__${BUILD_TIME}`;

export type LogLevel = $Keys<typeof LOG_LEVELS>;

export type Logger = (LogLevel, ...args: Array<any>) => void;

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  log: 2,
  debug: 3,
};

export const DEFAULT_LOG_LEVEL: LogLevel = PROD ? "error" : "log";

export function log(
  level: LogLevel,
  enabledLevel: LogLevel,
  ...args: Array<any>
) {
  if (LOG_LEVELS[level] > LOG_LEVELS[enabledLevel]) {
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

export function autoLog(
  logger: Logger,
  object: Object,
  methods: Array<Function>
) {
  for (const method of methods) {
    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      value: Object.defineProperty(
        function(...args: Array<any>): any {
          logger("log", `${object.constructor.name}#${method.name}`, ...args);
          // eslint-disable-next-line no-invalid-this
          return method.apply(this, args);
        },
        "name",
        { value: method.name }
      ),
    });
  }
}

export function bind(object: Object, methods: Array<Function>) {
  for (const method of methods) {
    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      value: Object.defineProperty(method.bind(object), "name", {
        value: method.name,
      }),
    });
  }
}

export function catchRejections(
  logger: Logger,
  object: Object,
  methods: Array<(...args: Array<any>) => Promise<void> | void>
) {
  for (const method of methods) {
    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      value: Object.defineProperty(
        async function(...args: Array<any>): Promise<void> {
          try {
            // eslint-disable-next-line no-invalid-this
            await method.apply(this, args);
          } catch (error) {
            logger(
              "error",
              `${object.constructor.name}#${method.name}`,
              error,
              ...args
            );
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
