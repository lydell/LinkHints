import type { JSX as PreactJSX } from "preact";

export function h(
  tag: string,
  props: Record<string, string | undefined> | null | undefined,
  ...children: Array<HTMLElement | boolean | string | null | undefined>
): HTMLElement {
  const element = document.createElement(tag);

  if (props !== null && props !== undefined) {
    const { className, onClick, ...rest } = props;

    if (className !== undefined) {
      element.className = className;
    }

    if (typeof onClick === "function") {
      element.onclick = onClick;
    }

    for (const key of Object.keys(rest)) {
      const value = rest[key];
      if (value !== undefined) {
        element.setAttribute(key, value);
      }
    }
  }

  for (const child of children) {
    if (child !== null && child !== undefined && typeof child !== "boolean") {
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
