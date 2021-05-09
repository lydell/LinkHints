import { fireAndForget } from "../shared/main";
import PopupProgram from "./Program";

const program = new PopupProgram();
fireAndForget(program.start(), "main->PopupProgram#start");
