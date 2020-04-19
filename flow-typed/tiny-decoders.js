// @flow strict-local

declare module "tiny-decoders" {
  declare export type Decoder<T> = (value: mixed, errors?: Array<string>) => T;

  declare export function boolean(value: mixed): boolean;

  declare export function number(value: mixed): number;

  declare export function string(value: mixed): string;

  declare export function constant<T: boolean | number | string | void | null>(
    constantValue: T
  ): (value: mixed) => T;

  declare export function array<T, U>(
    decoder: Decoder<T>,
    mode?: "throw" | "skip" | {| default: U |}
  ): Decoder<Array<T | U>>;

  declare export function dict<T, U>(
    decoder: Decoder<T>,
    mode?: "throw" | "skip" | {| default: U |}
  ): Decoder<{ [key: string]: T | U, ... }>;

  declare export function fields<T>(
    callback: (
      field: <U, V>(
        key: string | number,
        decoder: Decoder<U>,
        mode?: "throw" | {| default: V |}
      ) => U | V,
      fieldError: (key: string | number, message: string) => TypeError,
      obj: { +[string]: mixed, ... },
      errors?: Array<string>
    ) => T
  ): Decoder<T>;

  declare export function pair<T1, T2>(
    decoder1: Decoder<T1>,
    decoder2: Decoder<T2>
  ): Decoder<[T1, T2]>;

  declare export function triple<T1, T2, T3>(
    decoder1: Decoder<T1>,
    decoder2: Decoder<T2>,
    decoder3: Decoder<T3>
  ): Decoder<[T1, T2, T3]>;

  declare type DecoderType = <T, U>(Decoder<T | U>) => T | U;

  declare export function autoRecord<T: { ... }>(
    mapping: T
  ): Decoder<$ObjMap<T, DecoderType>>;

  declare export function deep<T>(
    path: Array<string | number>,
    decoder: Decoder<T>
  ): Decoder<T>;

  declare export function optional<T, U>(
    decoder: Decoder<T>,
    defaultValue: U
  ): Decoder<T | U>;

  declare export function map<T, U>(
    decoder: Decoder<T>,
    fn: (value: T, errors?: Array<string>) => U
  ): Decoder<U>;

  declare export function either<T, U>(
    decoder1: Decoder<T>,
    decoder2: Decoder<U>
  ): Decoder<T | U>;

  declare export function lazy<T>(callback: () => Decoder<T>): Decoder<T>;

  declare export function repr(
    value: any,
    options?: {|
      key?: string | number,
      recurse?: boolean,
      maxArrayChildren?: number,
      maxObjectChildren?: number,
    |}
  ): string;
}
