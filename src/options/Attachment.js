// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {
  label?: React.Node,
  content?: React.Node,
  children: React.Node,
  // ...restProps
};

export default function Attachment({
  label,
  content,
  children,
  ...restProps
}: Props) {
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
