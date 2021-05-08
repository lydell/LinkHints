import { h, render } from "preact";

import OptionsProgram from "./Program";

function start(): void {
  render(
    <OptionsProgram
      ref={(program: OptionsProgram | null) => {
        // Attach the instance to `window` for debugging in the regular Web
        // Console.
        // @ts-expect-error Only for debugging use.
        window.optionsProgram = program;
      }}
    />,
    document.body
  );
}

start();
