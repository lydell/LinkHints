// @flow strict-local

import type { JSX as PreactJSX } from "preact";

export function h(
  tag: string,
  props: Record<string, string | undefined> | null | undefined,
  ...children: Array<HTMLElement | boolean | string | null | undefined>
): HTMLElement {
  const element = document.createElement(tag);

  if (props != null) {
    const { className, onClick, ...rest } = props;

    if (className != null) {
      element.className = className;
    }

    if (onClick != null) {
      // @ts-expect-error This must be a function. Difficult to type.
      element.onclick = onClick;
    }

    for (const key of Object.keys(rest)) {
      const value = rest[key];
      if (value != null) {
        element.setAttribute(key, value);
      }
    }
  }

  for (const child of children) {
    if (child != null && typeof child !== "boolean") {
      element.append(
        typeof child === "string" ? document.createTextNode(child) : child
      );
    }
  }

  return element;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace h {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type IntrinsicElements = PreactJSX.IntrinsicElements;
    type Element = HTMLElement;
  }
}
