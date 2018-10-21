// @flow strict-local

declare module "preact" {
  declare module.exports: {
    ...$Exports<"react">,
    ...$Exports<"react-dom">,
  };
}
