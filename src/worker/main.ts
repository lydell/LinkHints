import { fireAndForget } from "../shared/main";
import WorkerProgram from "./Program";

const PROGRAM_KEY = `__${META_SLUG}WebExt_${BUILD_ID}_WorkerProgram`;
const global = globalThis as Record<string, (() => void) | undefined> &
  typeof globalThis;

// In Firefox, `match_about_blank: true` triggers even if you visit
// `about:blank` directly, not just blank iframes and `window.open()`.
// It makes no sense doing anything in a completely blank page.
if (!(window.location.href === "about:blank" && window.top === window)) {
  global[PROGRAM_KEY]?.();

  const program = new WorkerProgram();
  global[PROGRAM_KEY] = () => {
    program.stop();
    global[PROGRAM_KEY] = undefined;
  };

  fireAndForget(program.start(), "main->WorkerProgram#start");
}
