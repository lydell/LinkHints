// @flow

declare module "preact" {
  declare module.exports: {
    ...$Exports<"react">,
    ...$Exports<"react-dom">,
  };
}
