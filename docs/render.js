// @flow

const renderToString = require("preact-render-to-string");

export default function render(node: any) {
  return `<!DOCTYPE html>${renderToString(node)}`;
}
