// @flow strict-local

declare module "mkdirp" {
  declare module.exports: {
    sync: string => void,
  };
}
