// @flow strict-local

import * as React from "preact";
import { useState } from "preact/hooks";

import { classlist } from "../shared/main";

const params = new URLSearchParams(window.location.search);

export default function TestLink({ text }: { text: string }) {
  const [clicked, setClicked] = useState<boolean>(false);

  const id = text.toLowerCase().replace(/\W+/g, "-");

  return (
    <a
      href={`?test=${id}`}
      tabIndex="-1"
      className={classlist("TestLink", { "is-clicked": clicked })}
      onClick={(event) => {
        event.preventDefault();
        setClicked(true);
      }}
      onBlur={() => {
        setClicked(false);
      }}
    >
      {text}
      {params.get("test") === id ? "\u00a0✅" : ""}
    </a>
  );
}
