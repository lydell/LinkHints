// @flow

export function unreachable(value: empty, ...args: Array<any>) {
  const message = `Unreachable: ${value}`;

  if (args.length > 0) {
    console.warn(message, ...args);
  }

  throw new Error(message);
}
