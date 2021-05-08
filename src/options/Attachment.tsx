import { ComponentChildren, h, JSX, VNode } from "preact";

import { classlist } from "../shared/main";

export default function Attachment({
  label,
  contents,
  children,
  ...restProps
}: JSX.HTMLAttributes<HTMLLabelElement> &
  JSX.HTMLAttributes<HTMLSpanElement> & {
    label?: VNode | string;
    contents?: VNode;
    children: ComponentChildren;
  }): VNode {
  const Tag = label !== undefined ? "label" : "span";
  return (
    <Tag {...restProps} className="Attachment">
      <span
        className={classlist("Attachment-content", {
          TinyLabel: label !== undefined,
        })}
      >
        {label !== undefined ? label : contents}
      </span>
      {children}
    </Tag>
  );
}
