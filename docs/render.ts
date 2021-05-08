import type { VNode } from "preact";
import renderToString from "preact-render-to-string";

export default function render(node: VNode): string {
  return `<!DOCTYPE html>${renderToString(node)}`;
}
