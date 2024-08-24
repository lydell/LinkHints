// import { fireAndForget } from "../shared/main";
// import RendererProgram from "./Program";

// const program = new RendererProgram();
// fireAndForget(program.start(), "main->RendererProgram#start");

console.log(
  "Hello from renderer/main.ts (to be the top-level-only script)",
  window.location.href,
  chrome
);
