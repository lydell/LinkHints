// @flow strict-local

import BackgroundProgram from "./Program";

const program = new BackgroundProgram();

program.start();

// Attach the instance to the background page's `window` for debugging. This
// means one can type `program` in the console opened from `about:debugging` or
// `chrome://extensions` to look at the current state of things.
window.program = program;
