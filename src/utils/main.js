// @flow

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
