// @flow strict-local

declare module "tiny-decoders" {
  declare export function boolean(value: mixed): boolean;

  declare export function number(value: mixed): number;

  declare export function string(value: mixed): string;

  declare export function mixedArray(value: mixed): $ReadOnlyArray<mixed>;

  declare export function mixedDict(value: mixed): {| +[string]: mixed |};

  declare export function constant<T: boolean | number | string | void | null>(
    constantValue: T
  ): mixed => T;

  declare export function array<T>(decoder: (mixed) => T): mixed => Array<T>;

  declare export function dict<T>(
    decoder: (mixed) => T
  ): mixed => {| [string]: T |};

  declare type ExtractDecoderType = <T, U>((mixed) => T | U) => T | U;

  declare export function group<T: { ... }>(
    mapping: T
  ): mixed => $ObjMap<T, ExtractDecoderType>;

  declare export function record<T: { ... }>(
    mapping: T
  ): mixed => $ObjMap<T, ExtractDecoderType>;

  declare export function field<T>(
    key: string | number,
    decoder: (mixed) => T
  ): mixed => T;

  declare export function fieldDeep<T>(
    keys: Array<string | number>,
    decoder: (mixed) => T
  ): mixed => T;

  declare export function optional<T, U>(
    decoder: (mixed) => T,
    defaultValue: U
  ): mixed => T | U;

  declare export function map<T, U>(
    decoder: (mixed) => T,
    fn: (T) => U
  ): mixed => U;

  declare export function andThen<T, U>(
    decoder: (mixed) => T,
    fn: (T) => mixed => U
  ): mixed => U;

  declare export function fieldAndThen<T, U>(
    key: string | number,
    decoder: (mixed) => T,
    fn: (T) => mixed => U
  ): mixed => U;

  declare export function either<T, U>(
    decoder1: (mixed) => T,
    decoder2: (mixed) => U
  ): mixed => T | U;

  declare export function lazy<T>(fn: () => mixed => T): mixed => T;

  declare export function repr(
    value: mixed,
    options?: {|
      key?: string | number,
      recurse?: boolean,
      maxArrayChildren?: number,
      maxObjectChildren?: number,
    |}
  ): string;
}
