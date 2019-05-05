// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  summary: React.Node,
  open: boolean,
  onChange: boolean => void,
  children: React.Node,
|};

export default function Details({ summary, open, onChange, children }: Props) {
  return (
    <div>
      <button
        type="button"
        className={classlist("Details-button Toggle", { "is-open": open })}
        onClick={() => {
          onChange(!open);
        }}
      >
        {summary}
      </button>
      {open && children}
    </div>
  );
}
