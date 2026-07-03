import { fireAndForget } from "../shared/main";
import RendererProgram from "./Program";

const PROGRAM_KEY = `__${META_SLUG}WebExt_${BUILD_ID}_RendererProgram`;
const global = globalThis as typeof globalThis &
  Record<string, (() => void) | undefined>;

global[PROGRAM_KEY]?.();

const program = new RendererProgram();
global[PROGRAM_KEY] = () => {
  program.stop();
  global[PROGRAM_KEY] = undefined;
};

fireAndForget(program.start(), "main->RendererProgram#start");
