// @flow

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
