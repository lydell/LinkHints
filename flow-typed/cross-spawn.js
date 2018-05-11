// @flow

declare module "cross-spawn" {
  declare module.exports: {
    sync: (string, Array<string>, Object) => void,
  };
}
