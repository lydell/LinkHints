declare module "crx3" {
  import type { ReadStream } from "fs";

  export default function crx3(
    readStream: ReadStream,
    options: {
      keyPath: string;
      crxPath: string;
    }
  ): Promise<void>;
}
