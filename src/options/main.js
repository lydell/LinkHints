// @flow

// Content scripts don’t run here, but we can run them manually.
// eslint-disable-next-line import/no-restricted-paths
import RendererProgram from "../renderer/Program";
// eslint-disable-next-line import/no-restricted-paths
import WorkerProgram from "../worker/Program";

const rendererProgram = new RendererProgram();
const workerProgram = new WorkerProgram();

rendererProgram.start();
workerProgram.start();

function test() {
  const container = document.createElement("div");

  const label = document.createElement("label");
  label.appendChild(document.createTextNode("Test: "));

  const input = document.createElement("input");
  label.append(input);

  container.append(label);

  if (document.body != null) {
    document.body.append(container);
  }
}

test();
