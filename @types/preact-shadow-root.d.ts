declare module "preact-shadow-root" {
  import type { ComponentChildren, VNode } from "preact";

  export default function Shadow(props: { children: ComponentChildren }): VNode;
}
