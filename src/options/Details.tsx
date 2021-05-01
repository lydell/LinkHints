// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

export default function Details({
  summary,
  open,
  onChange,
  children,
}: {
  summary: React.Node,
  open: boolean,
  onChange: (boolean) => void,
  children: React.Node,
}) {
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
