// import { fireAndForget } from "../shared/main";
// import BackgroundProgram from "./Program";

// const program = new BackgroundProgram();

// fireAndForget(program.start(), "main->BackgroundProgram#start");

// // Attach the instance to the background page's `window` for debugging. This
// // means one can type `program` in the console opened from `about:debugging` or
// // `chrome://extensions` to look at the current state of things.
// // @ts-expect-error This is for debugging only, and should never be accessed in the code.
// window.program = program;

console.log("Hello from background script!", chrome);
export {};
