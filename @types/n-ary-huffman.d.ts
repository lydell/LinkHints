declare module "n-ary-huffman" {
  export class BranchPoint<T> {
    children: Array<T>;

    weight: number;

    constructor(children: Array<T>, weight: number);

    assignCodeWords(
      alphabet: string,
      callback: (node: T, codeWord: string) => void,
      prefix?: string
    ): void;
  }

  export function createTree<T extends { weight: number }>(
    elements: Array<T>,
    numBranches: number,
    options?: { sorted?: boolean }
  ): BranchPoint<T>;
}
