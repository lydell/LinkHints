// @flow strict-local

import React from "preact";

type Props = {
  label: React.Node,
  children: React.Node,
};

export default function ExtraLabel({ label, children }: Props) {
  return (
    <span className="ExtraLabel">
      <span className="ExtraLabel-label">{label}</span>
      {children}
    </span>
  );
}
