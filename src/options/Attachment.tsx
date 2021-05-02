// @flow strict-local

import { ComponentChildren, h, JSX, VNode } from "preact";

import { classlist } from "../shared/main";

export default function Attachment({
  label,
  content,
  children,
  ...restProps
}: JSX.HTMLAttributes<HTMLLabelElement> &
  JSX.HTMLAttributes<HTMLSpanElement> & {
    label?: VNode | string;
    content?: VNode;
    children: ComponentChildren;
  }) {
  const Tag = label != null ? "label" : "span";
  return (
    <Tag {...restProps} className="Attachment">
      <span
        className={classlist("Attachment-content", {
          TinyLabel: label != null,
        })}
      >
        {label != null ? label : content}
      </span>
      {children}
    </Tag>
  );
}
