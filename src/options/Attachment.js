// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

export default function Attachment({
  label,
  content,
  children,
  ...restProps
}: {
  label?: React.Node,
  content?: React.Node,
  children: React.Node,
  ...
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
