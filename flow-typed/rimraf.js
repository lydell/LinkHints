// @flow

declare module "rimraf" {
  declare module.exports: {
    sync: string => void,
  };
}
