// @flow strict-local

import React from "preact";

type Props = {
  label: React.Node,
  children: React.Node,
  // ...restProps
};

export default function ExtraLabel({ label, children, ...restProps }: Props) {
  return (
    <span {...restProps} className="ExtraLabel">
      <span className="ExtraLabel-label">{label}</span>
      {children}
    </span>
  );
}
