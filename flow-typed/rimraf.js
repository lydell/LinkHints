// @flow strict-local

declare module "rimraf" {
  declare module.exports: {
    sync: string => void,
  };
}
