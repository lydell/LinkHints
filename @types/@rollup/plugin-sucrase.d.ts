declare module "@rollup/plugin-sucrase" {
  import type { Options } from "sucrase";

  export default function sucrase(
    options: Options & {
      include?: Array<string>;
      exclude?: Array<string>;
    }
  );
}
