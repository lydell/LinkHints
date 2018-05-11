// @flow

declare module "mkdirp" {
  declare module.exports: {
    sync: string => void,
  };
}
