// @flow

declare module "n-ary-huffman" {
  declare class BranchPoint<T> {
    constructor: (Array<T>, number) => BranchPoint<T>;
    children: Array<T>;
    weight: number;
    assignCodeWords: (string, (T, string) => void, prefix?: string) => void;
  }

  declare module.exports: {
    createTree: <T: { weight: number }>(
      Array<T>,
      number,
      options?: {| sorted?: boolean, compare?: (T, T) => number |}
    ) => BranchPoint<T>,
    BranchPoint: typeof BranchPoint,
  };
}
