// @flow

declare module "readdirp" {
  declare module.exports: {|
    promise(string): Promise<Array<{| fullPath: string |}>>,
  |};
}
