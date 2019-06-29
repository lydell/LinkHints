// @flow

declare module "yazl" {
  import typeof EventEmitter from "events";
  import type { ReadStream } from "fs";

  declare class ZipFile {
    outputStream: ReadStream;
    addBuffer(Buffer, string): void;
    addFile(string, string): void;
    end(): void;
    on(string, Function): void;
  }

  declare module.exports: {|
    ZipFile: typeof ZipFile,
  |};
}
