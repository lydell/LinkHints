// @flow

// Example: `window.__loaded__2018-06-17T12:19:03.657Z`.
// Used to detect if content scripts have been loaded or not.
export const LOADED_KEY = `__loaded__${BUILD_TIME}`;

export function bind(object: Object, methods: Array<string>) {
  for (const method of methods) {
    object[method] = object[method].bind(object);
  }
}

export function unreachable(value: empty, ...args: Array<any>) {
  const message = `Unreachable: ${value}`;

  if (args.length > 0) {
    console.warn(message, ...args);
  }

  throw new Error(message);
}
