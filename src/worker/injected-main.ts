import injected, { RESET_EVENT } from "./injected";

const PROGRAM_KEY = `__${META_SLUG}WebExt_${BUILD_ID}_InjectedMain`;
const global = window as unknown as Record<string, (() => void) | undefined> &
  Window;

global[PROGRAM_KEY]?.();
injected();
global[PROGRAM_KEY] = () => {
  document.dispatchEvent(new CustomEvent(RESET_EVENT));
  global[PROGRAM_KEY] = undefined;
};
