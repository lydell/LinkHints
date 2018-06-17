// @flow

// Example: `window.__loaded__2018-06-17T12:19:03.657Z`.
// Used to detect if content scripts have been loaded or not.
export const LOADED_KEY = `__loaded__${BUILD_TIME}`;

export function bind(object: Object, methods: Array<Function>) {
  for (const method of methods) {
    Object.defineProperty(object, method.name, {
      writable: true,
      enumerable: false,
      configurable: true,
      value: method.bind(object),
    });
  }
}

export function catchRejections(
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
            console.error(
              `${object.constructor.name}#${method.name} failed`,
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
  const message = `Unreachable: ${value}`;

  if (args.length > 0) {
    console.warn(message, ...args);
  }

  throw new Error(message);
}
