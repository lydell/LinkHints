// @flow strict-local

const React = {
  createElement(
    tag: string,
    attributes: ?{
      className?: ?string,
      onClick?: ?(MouseEvent<HTMLElement>) => mixed,
      [string]: ?string,
      ...
    },
    ...children: Array<?(string | HTMLElement | boolean)>
  ): HTMLElement {
    const element = document.createElement(tag);

    if (attributes != null) {
      const { className, onClick, ...rest } = attributes;

      if (className != null) {
        element.className = className;
      }

      if (onClick != null) {
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
  },
};

export default React;
