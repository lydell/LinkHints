import { fireAndForget } from "../shared/main";
import WorkerProgram from "./Program";

const program = new WorkerProgram();
fireAndForget(program.start(), "main->WorkerProgram#start");
