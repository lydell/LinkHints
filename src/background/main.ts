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

type MessageInfo = {
  tabId: number;
  frameId: number;
  url: string | undefined;
};

// TODO: This disconnects when the service worker goes to sleep.
// Apparently, we used it to find iframes removed during hinting (in addition to detecting shutdown).
// chrome.runtime.onConnect.addListener((port) => {
//   port.onDisconnect.addListener(({ sender }) => {
//     const info = sender === undefined ? undefined : makeMessageInfo(sender);
//     if (info !== undefined) {
//       // A frame was removed. If in hints mode, hide all hints for elements in
//       // that frame.
//       console.log("this.hideElements", info);
//     }
//   });
// });

function makeMessageInfo(
  sender: chrome.runtime.MessageSender
): MessageInfo | undefined {
  return sender.tab?.id !== undefined && sender.frameId !== undefined
    ? { tabId: sender.tab.id, frameId: sender.frameId, url: sender.url }
    : undefined;
}
