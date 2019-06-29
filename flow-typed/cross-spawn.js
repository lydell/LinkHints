// @flow

declare module "cross-spawn" {
  import typeof childProcess from "child_process";

  declare module.exports: {|
    sync: $PropertyType<childProcess, "spawnSync">,
  |};
}
