// @flow

declare module "fs-extra" {
  declare module.exports: {|
    copySync(string, string): void,
    outputFileSync(string, string): void,
    removeSync(string): void,
  |};
}
