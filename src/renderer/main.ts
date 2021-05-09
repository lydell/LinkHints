import { fireAndForget } from "../shared/main";
import RendererProgram from "./Program";

const program = new RendererProgram();
fireAndForget(program.start(), "main->RendererProgram#start");
