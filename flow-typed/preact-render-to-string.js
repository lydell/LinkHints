// @flow

declare module "preact-render-to-string" {
  declare module.exports: (
    Object,
    context?: void,
    options?: {| xml?: boolean |}
  ) => string;
}
