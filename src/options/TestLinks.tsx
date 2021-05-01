// @flow strict-local

import * as React from "preact";
import { useState } from "preact/hooks";

import TestLink from "./TestLink";

export default function TestLinks() {
  const [keys, setKeys] = useState<Array<string>>([]);

  return (
    <div
      className="TestLinks SpacedVertical TextSmall"
      onKeyDown={(event: SyntheticKeyboardEvent<HTMLDivElement>) => {
        if (event.key.length === 1) {
          setKeys(keys.concat(event.key));
        }
      }}
      onBlurCapture={() => {
        setKeys([]);
      }}
    >
      <div className="TestLinks-grid">
        <TestLink text="Alfa" />
        <TestLink text="Bravo" />
        <TestLink text="Charlie" />
        <TestLink text="Delta" />
        <TestLink text="Echo" />
        <TestLink text="Foxtrot" />
        <TestLink text="Golf" />
        <TestLink text="Hotel" />
        <TestLink text="India" />
        <TestLink text="Juliett" />
        <TestLink text="Kilo" />
        <TestLink text="Lima" />
        <TestLink text="Mike" />
        <TestLink text="November" />
        <TestLink text="Oscar" />
        <TestLink text="Papa" />
        <TestLink text="Quebec" />
        <TestLink text="Romeo" />
        <TestLink text="Sierra" />
        <TestLink text="Tango" />
        <TestLink text="Uniform" />
        <TestLink text="Victor" />
        <TestLink text="Whiskey" />
        <TestLink text="X-ray" />
        <TestLink text="Yankee" />
        <TestLink text="Zulu" />
        <TestLink text="$199" />
      </div>

      <p className="TestLinks-pagination Spaced">
        <TestLink text="Previous" />
        {Array.from({ length: 12 }, (_, index) => (
          <TestLink text={(index + 1).toString()} />
        ))}
        <TestLink text="Next" />
      </p>

      {keys.length > 0 && (
        <div>
          <p className="TinyLabel">Potentially over-typed keys:</p>
          <div>{keys.join(" ")}</div>
        </div>
      )}
    </div>
  );
}
