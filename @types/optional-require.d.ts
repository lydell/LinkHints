declare module "optional-require" {
  declare function optionalRequire(
    passedRequire: typeof require
  ): typeof require;

  export = optionalRequire;
}
