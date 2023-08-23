// There are some things that cannot be implemented without `any`.
// No `any` “leaks” when _using_ the library, though.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Codec<
  Decoded,
  Encoded = unknown,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Meta extends CodecMeta = {}
> = Meta & {
  decoder: (value: unknown) => DecoderResult<Decoded>;
  encoder: (value: Decoded) => Encoded;
};

export type CodecMeta = {
  encodedFieldName?: string;
  optional?: boolean;
  tag?: { decoded: string; encoded: string } | undefined;
};

export type DecoderResult<Decoded> =
  | {
      tag: "DecoderError";
      errors: [DecoderError, ...Array<DecoderError>];
    }
  | {
      tag: "Valid";
      value: Decoded;
    };

type MergeMeta<A extends CodecMeta, B extends CodecMeta> = Expand<A & B>;

// Make VSCode show `{ a: string; b?: number }` instead of `{ a: string } & { b?: number }`.
// https://stackoverflow.com/a/57683652/2010616
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type Infer<T extends Codec<any>> = Extract<
  ReturnType<T["decoder"]>,
  { tag: "Valid" }
>["value"];

export type InferEncoded<T extends Codec<any>> = ReturnType<T["encoder"]>;

function isNonEmptyArray<T>(arr: Array<T>): arr is [T, ...Array<T>] {
  return arr.length >= 1;
}

export function parse<Decoded>(
  codec: Codec<Decoded>,
  jsonString: string
): DecoderResult<Decoded> {
  let json: unknown;
  try {
    json = JSON.parse(jsonString);
  } catch (error) {
    return {
      tag: "DecoderError",
      errors: [
        {
          tag: "custom",
          message: error instanceof Error ? error.message : String(error),
          got: jsonString,
          path: [],
        },
      ],
    };
  }
  return codec.decoder(json);
}

export function stringify<Decoded, Encoded>(
  codec: Codec<Decoded, Encoded>,
  value: Decoded,
  space?: number | string
): string {
  return JSON.stringify(codec.encoder(value), null, space);
}

export const parseWithoutCodec: (
  text: string,
  reviver?: (this: unknown, key: string, value: unknown) => unknown
) => unknown = JSON.parse;

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const stringifyWithoutCodec: {
  (
    // eslint-disable-next-line @typescript-eslint/ban-types
    value: Function | symbol | undefined,
    replacer?: Array<number | string> | null,
    space?: number | string
  ): undefined;
  (
    value: unknown,
    replacer?: Array<number | string> | null,
    space?: number | string
  ): string;
  (
    value: unknown,
    replacer: (this: unknown, key: string, value: unknown) => unknown,
    space?: number | string
  ): string | undefined;
} = JSON.stringify as any;

function identity<T>(value: T): T {
  return value;
}

export const unknown: Codec<unknown> = {
  decoder: (value) => ({ tag: "Valid", value }),
  encoder: identity,
};

export const boolean: Codec<boolean, boolean> = {
  decoder: (value) =>
    typeof value === "boolean"
      ? { tag: "Valid", value }
      : {
          tag: "DecoderError",
          errors: [{ tag: "boolean", got: value, path: [] }],
        },
  encoder: identity,
};

export const number: Codec<number, number> = {
  decoder: (value) =>
    typeof value === "number"
      ? { tag: "Valid", value }
      : {
          tag: "DecoderError",
          errors: [{ tag: "number", got: value, path: [] }],
        },
  encoder: identity,
};

export const string: Codec<string, string> = {
  decoder: (value) =>
    typeof value === "string"
      ? { tag: "Valid", value }
      : {
          tag: "DecoderError",
          errors: [{ tag: "string", got: value, path: [] }],
        },
  encoder: identity,
};

export function stringUnion<Variants extends ReadonlyArray<string>>(
  variants: Variants[number] extends never
    ? "stringUnion must have at least one variant"
    : readonly [...Variants]
): Codec<Variants[number], Variants[number]> {
  return {
    decoder: (value) => {
      const stringResult = string.decoder(value);
      if (stringResult.tag === "DecoderError") {
        return stringResult;
      }
      const str = stringResult.value;
      return variants.includes(str)
        ? { tag: "Valid", value: str }
        : {
            tag: "DecoderError",
            errors: [
              {
                tag: "unknown stringUnion variant",
                knownVariants: variants as unknown as Array<string>,
                got: str,
                path: [],
              },
            ],
          };
    },
    encoder: identity,
  };
}

function unknownArray(value: unknown): DecoderResult<Array<unknown>> {
  return Array.isArray(value)
    ? { tag: "Valid", value }
    : {
        tag: "DecoderError",
        errors: [{ tag: "array", got: value, path: [] }],
      };
}

function unknownRecord(value: unknown): DecoderResult<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { tag: "Valid", value: value as Record<string, unknown> }
    : {
        tag: "DecoderError",
        errors: [{ tag: "object", got: value, path: [] }],
      };
}

export function array<DecodedItem, EncodedItem>(
  codec: Codec<DecodedItem, EncodedItem>
): Codec<Array<DecodedItem>, Array<EncodedItem>> {
  return {
    decoder: (value) => {
      const arrResult = unknownArray(value);
      if (arrResult.tag === "DecoderError") {
        return arrResult;
      }
      const arr = arrResult.value;
      const result = [];
      const errors: Array<DecoderError> = [];
      for (let index = 0; index < arr.length; index++) {
        const decoderResult = codec.decoder(arr[index]);
        switch (decoderResult.tag) {
          case "DecoderError":
            for (const error of decoderResult.errors) {
              errors.push({ ...error, path: [index, ...error.path] });
            }
            break;
          case "Valid":
            result.push(decoderResult.value);
            break;
        }
      }
      return isNonEmptyArray(errors)
        ? { tag: "DecoderError", errors }
        : { tag: "Valid", value: result };
    },
    encoder: (arr) => {
      const result = [];
      for (const item of arr) {
        result.push(codec.encoder(item));
      }
      return result;
    },
  };
}

export function record<DecodedValue, EncodedValue>(
  codec: Codec<DecodedValue, EncodedValue>
): Codec<Record<string, DecodedValue>, Record<string, EncodedValue>> {
  return {
    decoder: (value) => {
      const objectResult = unknownRecord(value);
      if (objectResult.tag === "DecoderError") {
        return objectResult;
      }
      const object = objectResult.value;
      const keys = Object.keys(object);
      const result: Record<string, DecodedValue> = {};
      const errors: Array<DecoderError> = [];

      for (const key of keys) {
        if (key === "__proto__") {
          continue;
        }
        const decoderResult = codec.decoder(object[key]);
        switch (decoderResult.tag) {
          case "DecoderError":
            for (const error of decoderResult.errors) {
              errors.push({ ...error, path: [key, ...error.path] });
            }
            break;
          case "Valid":
            result[key] = decoderResult.value;
            break;
        }
      }

      return isNonEmptyArray(errors)
        ? { tag: "DecoderError", errors }
        : { tag: "Valid", value: result };
    },
    encoder: (object) => {
      const result: Record<string, EncodedValue> = {};
      for (const [key, value] of Object.entries(object)) {
        if (key === "__proto__") {
          continue;
        }
        result[key] = codec.encoder(value);
      }
      return result;
    },
  };
}

type FieldsMapping = Record<string, Codec<any, any, CodecMeta>>;

type InferFields<Mapping extends FieldsMapping> = Expand<
  {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? Key
      : never]?: Infer<Mapping[Key]>;
  } & {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? never
      : Key]: Infer<Mapping[Key]>;
  }
>;

type InferEncodedFields<Mapping extends FieldsMapping> = Expand<
  {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? Mapping[Key] extends { encodedFieldName: infer Name }
        ? Name extends string
          ? Name
          : Key
        : Key
      : never]?: InferEncoded<Mapping[Key]>;
  } & {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? never
      : Mapping[Key] extends { encodedFieldName: infer Name }
      ? Name extends string
        ? Name
        : Key
      : Key]: InferEncoded<Mapping[Key]>;
  }
>;

export function fields<Mapping extends FieldsMapping>(
  mapping: Mapping,
  { disallowExtraFields = false }: { disallowExtraFields?: boolean } = {}
): Codec<InferFields<Mapping>, InferEncodedFields<Mapping>> {
  return {
    decoder: (value) => {
      const objectResult = unknownRecord(value);
      if (objectResult.tag === "DecoderError") {
        return objectResult;
      }
      const object = objectResult.value;
      const keys = Object.keys(mapping);
      const knownFields = new Set<string>();
      const result: Record<string, unknown> = {};
      const errors: Array<DecoderError> = [];

      for (const key of keys) {
        if (key === "__proto__") {
          continue;
        }
        const {
          decoder,
          encodedFieldName = key,
          optional: isOptional = false,
        } = mapping[key];
        if (encodedFieldName === "__proto__") {
          continue;
        }
        knownFields.add(encodedFieldName);
        if (!(encodedFieldName in object)) {
          if (!isOptional) {
            errors.push({
              tag: "missing field",
              field: encodedFieldName,
              got: object,
              path: [],
            });
          }
          continue;
        }
        const decoderResult = decoder(object[encodedFieldName]);
        switch (decoderResult.tag) {
          case "DecoderError":
            for (const error of decoderResult.errors) {
              errors.push({ ...error, path: [key, ...error.path] });
            }
            break;
          case "Valid":
            result[key] = decoderResult.value;
            break;
        }
      }

      if (disallowExtraFields) {
        const unknownFields = Object.keys(object).filter(
          (key) => !knownFields.has(key)
        );
        if (unknownFields.length > 0) {
          errors.push({
            tag: "exact fields",
            knownFields: Array.from(knownFields),
            got: unknownFields,
            path: [],
          });
        }
      }

      return isNonEmptyArray(errors)
        ? { tag: "DecoderError", errors }
        : { tag: "Valid", value: result as InferFields<Mapping> };
    },
    encoder: (object) => {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(mapping)) {
        if (key === "__proto__") {
          continue;
        }
        const {
          encoder,
          encodedFieldName = key,
          optional: isOptional = false,
        } = mapping[key];
        if (
          encodedFieldName === "__proto__" ||
          (isOptional && !(key in object))
        ) {
          continue;
        }
        const value = object[key as keyof InferFields<Mapping>];
        result[encodedFieldName] = encoder(value);
      }
      return result as InferEncodedFields<Mapping>;
    },
  };
}

type InferFieldsUnion<MappingsUnion extends FieldsMapping> =
  MappingsUnion extends any ? InferFields<MappingsUnion> : never;

type InferEncodedFieldsUnion<MappingsUnion extends FieldsMapping> =
  MappingsUnion extends any ? InferEncodedFields<MappingsUnion> : never;

export function fieldsUnion<
  DecodedCommonField extends keyof Variants[number],
  Variants extends ReadonlyArray<
    Record<
      DecodedCommonField,
      Codec<any, any, { tag: { decoded: string; encoded: string } }>
    > &
      Record<string, Codec<any, any, CodecMeta>>
  >
>(
  decodedCommonField: Variants[number] extends never
    ? "fieldsUnion must have at least one variant"
    : keyof InferEncodedFieldsUnion<Variants[number]> extends never
    ? "fieldsUnion variants must have a field in common, and their encoded field names must be the same"
    : DecodedCommonField,
  variants: [...Variants],
  { disallowExtraFields = false }: { disallowExtraFields?: boolean } = {}
): Codec<
  InferFieldsUnion<Variants[number]>,
  InferEncodedFieldsUnion<Variants[number]>
> {
  if (decodedCommonField === "__proto__") {
    throw new Error("fieldsUnion: commonField cannot be __proto__");
  }

  type VariantCodec = Codec<any, any>;
  const decoderMap = new Map<string, VariantCodec["decoder"]>(); // encodedName -> decoder
  const encoderMap = new Map<string, VariantCodec["encoder"]>(); // decodedName -> encoder

  let maybeEncodedCommonField: number | string | symbol | undefined = undefined;

  for (const [index, variant] of variants.entries()) {
    const codec = variant[decodedCommonField];
    const { encodedFieldName = decodedCommonField } = codec;
    if (maybeEncodedCommonField === undefined) {
      maybeEncodedCommonField = encodedFieldName;
    } else if (maybeEncodedCommonField !== encodedFieldName) {
      throw new Error(
        `Codec.fieldsUnion: Variant at index ${index}: Key ${JSON.stringify(
          decodedCommonField
        )}: Got a different encoded field name (${JSON.stringify(
          encodedFieldName
        )}) than before (${JSON.stringify(maybeEncodedCommonField)}).`
      );
    }
    const fullCodec: Codec<
      InferFields<Variants[number]>,
      InferEncodedFields<Variants[number]>
    > = fields(variant, { disallowExtraFields });
    decoderMap.set(codec.tag.encoded, fullCodec.decoder);
    encoderMap.set(codec.tag.decoded, fullCodec.encoder);
  }

  if (typeof maybeEncodedCommonField !== "string") {
    throw new Error(
      `Codec.fieldsUnion: Got unusable encoded common field: ${repr(
        maybeEncodedCommonField
      )}`
    );
  }

  const encodedCommonField = maybeEncodedCommonField;

  return {
    decoder: (value) => {
      const encodedNameResult = singleField(encodedCommonField, string).decoder(
        value
      );
      if (encodedNameResult.tag === "DecoderError") {
        return encodedNameResult;
      }
      const encodedName = encodedNameResult.value;
      const decoder = decoderMap.get(encodedName);
      if (decoder === undefined) {
        return {
          tag: "DecoderError",
          errors: [
            {
              tag: "unknown fieldsUnion tag",
              knownTags: Array.from(decoderMap.keys()),
              got: encodedName,
              path: [encodedCommonField],
            },
          ],
        };
      }
      return decoder(value);
    },
    encoder: (value) => {
      const decodedName = (value as Record<number | string | symbol, string>)[
        decodedCommonField
      ];
      const encoder = encoderMap.get(decodedName);
      if (encoder === undefined) {
        throw new Error(
          `Codec.fieldsUnion: Unexpectedly found no encoder for decoded variant name: ${JSON.stringify(
            decodedName
          )} at key ${JSON.stringify(decodedCommonField)}`
        );
      }
      return encoder(value) as InferEncodedFieldsUnion<Variants[number]>;
    },
  };
}

export function field<
  Decoded,
  Encoded,
  EncodedFieldName extends string,
  Meta extends CodecMeta
>(
  encodedFieldName: EncodedFieldName,
  codec: Codec<Decoded, Encoded, Meta>
): Codec<
  Decoded,
  Encoded,
  MergeMeta<Meta, { encodedFieldName: EncodedFieldName }>
> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...codec,
    encodedFieldName,
  } as Codec<
    Decoded,
    Encoded,
    MergeMeta<Meta, { encodedFieldName: EncodedFieldName }>
  >;
}

export function tag<Decoded extends string>(
  decoded: Decoded
): Codec<Decoded, Decoded, { tag: { decoded: string; encoded: string } }>;

export function tag<Decoded extends string, Encoded extends string>(
  decoded: Decoded,
  encoded: Encoded
): Codec<Decoded, Encoded, { tag: { decoded: string; encoded: string } }>;

export function tag<Decoded extends string, Encoded extends string>(
  decoded: Decoded,
  encoded: Encoded = decoded as unknown as Encoded
): Codec<Decoded, Encoded, { tag: { decoded: string; encoded: string } }> {
  return {
    decoder: (value) => {
      const strResult = string.decoder(value);
      if (strResult.tag === "DecoderError") {
        return strResult;
      }
      const str = strResult.value;
      return str === encoded
        ? { tag: "Valid", value: decoded }
        : {
            tag: "DecoderError",
            errors: [
              {
                tag: "wrong tag",
                expected: encoded,
                got: str,
                path: [],
              },
            ],
          };
    },
    encoder: () => encoded,
    tag: { decoded, encoded },
  };
}

export function tuple<Decoded extends ReadonlyArray<unknown>, EncodedItem>(
  mapping: readonly [
    ...{ [Key in keyof Decoded]: Codec<Decoded[Key], EncodedItem> }
  ]
): Codec<[...Decoded], Array<EncodedItem>> {
  return {
    decoder: (value) => {
      const arrResult = unknownArray(value);
      if (arrResult.tag === "DecoderError") {
        return arrResult;
      }
      const arr = arrResult.value;
      if (arr.length !== mapping.length) {
        return {
          tag: "DecoderError",
          errors: [
            {
              tag: "tuple size",
              expected: mapping.length,
              got: arr.length,
              path: [],
            },
          ],
        };
      }
      const result = [];
      const errors: Array<DecoderError> = [];
      for (let index = 0; index < arr.length; index++) {
        const { decoder } = mapping[index];
        const decoderResult = decoder(arr[index]);
        switch (decoderResult.tag) {
          case "DecoderError":
            for (const error of decoderResult.errors) {
              errors.push({ ...error, path: [index, ...error.path] });
            }
            break;
          case "Valid":
            result.push(decoderResult.value);
            break;
        }
      }
      return isNonEmptyArray(errors)
        ? { tag: "DecoderError", errors }
        : { tag: "Valid", value: result as [...Decoded] };
    },
    encoder: (value) => {
      const result = [];
      for (let index = 0; index < mapping.length; index++) {
        const { encoder } = mapping[index];
        result.push(encoder(value[index]));
      }
      return result;
    },
  };
}

type Multi<Types> = Types extends any
  ? Types extends "undefined"
    ? { type: "undefined"; value: undefined }
    : Types extends "null"
    ? { type: "null"; value: null }
    : Types extends "boolean"
    ? { type: "boolean"; value: boolean }
    : Types extends "number"
    ? { type: "number"; value: number }
    : Types extends "string"
    ? { type: "string"; value: string }
    : Types extends "array"
    ? { type: "array"; value: Array<unknown> }
    : Types extends "object"
    ? { type: "object"; value: Record<string, unknown> }
    : never
  : never;

export function multi<
  Types extends ReadonlyArray<
    "array" | "boolean" | "null" | "number" | "object" | "string" | "undefined"
  >
>(
  types: Types[number] extends never
    ? "multi must have at least one type"
    : [...Types]
): Codec<Multi<Types[number]>, Multi<Types[number]>["value"]> {
  return {
    decoder: (value) => {
      if (value === undefined) {
        if (types.includes("undefined")) {
          return {
            tag: "Valid",
            value: { type: "undefined", value } as unknown as Multi<
              Types[number]
            >,
          };
        }
      } else if (value === null) {
        if (types.includes("null")) {
          return {
            tag: "Valid",
            value: { type: "null", value } as unknown as Multi<Types[number]>,
          };
        }
      } else if (typeof value === "boolean") {
        if (types.includes("boolean")) {
          return {
            tag: "Valid",
            value: { type: "boolean", value } as unknown as Multi<
              Types[number]
            >,
          };
        }
      } else if (typeof value === "number") {
        if (types.includes("number")) {
          return {
            tag: "Valid",
            value: { type: "number", value } as unknown as Multi<Types[number]>,
          };
        }
      } else if (typeof value === "string") {
        if (types.includes("string")) {
          return {
            tag: "Valid",
            value: { type: "string", value } as unknown as Multi<Types[number]>,
          };
        }
      } else if (Array.isArray(value)) {
        if (types.includes("array")) {
          return {
            tag: "Valid",
            value: { type: "array", value } as unknown as Multi<Types[number]>,
          };
        }
      } else {
        if (types.includes("object")) {
          return {
            tag: "Valid",
            value: { type: "object", value } as unknown as Multi<Types[number]>,
          };
        }
      }
      return {
        tag: "DecoderError",
        errors: [
          {
            tag: "unknown multi type",
            knownTypes: types as Array<"undefined">, // Type checking hack.
            got: value,
            path: [],
          },
        ],
      };
    },
    encoder: (value) => value.value,
  };
}

export function recursive<Decoded, Encoded>(
  callback: () => Codec<Decoded, Encoded>
): Codec<Decoded, Encoded> {
  return {
    decoder: (value) => callback().decoder(value),
    encoder: (value) => callback().encoder(value),
  };
}

export function optional<Decoded, Encoded, Meta extends CodecMeta>(
  codec: Codec<Decoded, Encoded, Meta>
): Omit<Codec<Decoded, Encoded, MergeMeta<Meta, { optional: true }>>, "tag"> {
  const { tag: _tag, ...rest } = codec;
  void _tag;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...rest,
    optional: true,
  } as Omit<
    Codec<Decoded, Encoded, MergeMeta<Meta, { optional: true }>>,
    "tag"
  >;
}

export function undefinedOr<Decoded, Encoded>(
  codec: Codec<Decoded, Encoded>
): Codec<Decoded | undefined, Encoded | undefined> {
  return {
    decoder: (value) => {
      if (value === undefined) {
        return { tag: "Valid", value: undefined };
      }
      const decoderResult = codec.decoder(value);
      switch (decoderResult.tag) {
        case "DecoderError":
          return {
            tag: "DecoderError",
            errors: decoderResult.errors.map((error) =>
              error.path.length === 0
                ? {
                    ...error,
                    orExpected:
                      error.orExpected === "null"
                        ? "null or undefined"
                        : "undefined",
                  }
                : error
            ) as [DecoderError, ...Array<DecoderError>],
          };
        case "Valid":
          return decoderResult;
      }
    },
    encoder: (value) =>
      value === undefined ? undefined : codec.encoder(value),
  };
}

export function nullOr<Decoded, Encoded>(
  codec: Codec<Decoded, Encoded>
): Codec<Decoded | null, Encoded | null> {
  return {
    decoder: (value) => {
      if (value === null) {
        return { tag: "Valid", value: null };
      }
      const decoderResult = codec.decoder(value);
      switch (decoderResult.tag) {
        case "DecoderError":
          return {
            tag: "DecoderError",
            errors: decoderResult.errors.map((error) =>
              error.path.length === 0
                ? {
                    ...error,
                    orExpected:
                      error.orExpected === "undefined"
                        ? "null or undefined"
                        : "null",
                  }
                : error
            ) as [DecoderError, ...Array<DecoderError>],
          };
        case "Valid":
          return decoderResult;
      }
    },
    encoder: (value) => (value === null ? null : codec.encoder(value)),
  };
}

export function map<Decoded, Encoded, NewDecoded>(
  codec: Codec<Decoded, Encoded>,
  transform: {
    decoder: (value: Decoded) => NewDecoded;
    encoder: (value: NewDecoded) => Readonly<Decoded>;
  }
): Codec<NewDecoded, Encoded> {
  return flatMap(codec, {
    decoder: (value) => ({ tag: "Valid", value: transform.decoder(value) }),
    encoder: transform.encoder,
  });
}

export function flatMap<Decoded, Encoded, NewDecoded>(
  codec: Codec<Decoded, Encoded>,
  transform: {
    decoder: (value: Decoded) => DecoderResult<NewDecoded>;
    encoder: (value: NewDecoded) => Readonly<Decoded>;
  }
): Codec<NewDecoded, Encoded> {
  return {
    decoder: (value) => {
      const decoderResult = codec.decoder(value);
      switch (decoderResult.tag) {
        case "DecoderError":
          return decoderResult;
        case "Valid":
          return transform.decoder(decoderResult.value);
      }
    },
    encoder: (value) => codec.encoder(transform.encoder(value)),
  };
}

export function singleField<Decoded, Encoded>(
  fieldName: string,
  codec: Codec<Decoded, Encoded>
): Codec<Decoded, Record<string, Encoded>> {
  return map(fields({ [fieldName]: codec }), {
    decoder: (value) => value[fieldName],
    encoder: (value) => ({ [fieldName]: value }),
  });
}

type Key = number | string;

export type DecoderError = {
  path: Array<Key>;
  orExpected?: "null or undefined" | "null" | "undefined";
} & (
  | {
      tag: "custom";
      message: string;
      got: unknown;
    }
  | {
      tag: "exact fields";
      knownFields: Array<string>;
      got: Array<string>;
    }
  | {
      tag: "missing field";
      field: string;
      got: Record<string, unknown>;
    }
  | {
      tag: "tuple size";
      expected: number;
      got: number;
    }
  | {
      tag: "unknown fieldsUnion tag";
      knownTags: Array<string>;
      got: string;
    }
  | {
      tag: "unknown multi type";
      knownTypes: Array<
        | "array"
        | "boolean"
        | "null"
        | "number"
        | "object"
        | "string"
        | "undefined"
      >;
      got: unknown;
    }
  | {
      tag: "unknown stringUnion variant";
      knownVariants: Array<string>;
      got: string;
    }
  | {
      tag: "wrong tag";
      expected: string;
      got: string;
    }
  | { tag: "array"; got: unknown }
  | { tag: "boolean"; got: unknown }
  | { tag: "number"; got: unknown }
  | { tag: "object"; got: unknown }
  | { tag: "string"; got: unknown }
);

export function formatAll(
  errors: [DecoderError, ...Array<DecoderError>],
  options?: ReprOptions
): string {
  return errors.map((error) => format(error, options)).join("\n\n");
}

export function format(error: DecoderError, options?: ReprOptions): string {
  const path = error.path.map((part) => `[${JSON.stringify(part)}]`).join("");
  const variant = formatDecoderErrorVariant(error, options);
  const orExpected =
    error.orExpected === undefined ? "" : `\nOr expected: ${error.orExpected}`;
  return `At root${path}:\n${variant}${orExpected}`;
}

function formatDecoderErrorVariant(
  variant: DecoderError,
  options: ReprOptions = {}
): string {
  const formatGot = (value: unknown): string => {
    const formatted = repr(value, options);
    return options?.sensitive === true
      ? `${formatted}\n(Actual values are hidden in sensitive mode.)`
      : formatted;
  };

  const stringList = (strings: Array<string>): string =>
    strings.length === 0
      ? "(none)"
      : strings.map((s) => JSON.stringify(s)).join(", ");

  const untrustedStringList = (strings: Array<string>): string =>
    formatGot(strings).replace(/^\[|\]$/g, "");

  switch (variant.tag) {
    case "boolean":
    case "number":
    case "string":
      return `Expected a ${variant.tag}\nGot: ${formatGot(variant.got)}`;

    case "array":
    case "object":
      return `Expected an ${variant.tag}\nGot: ${formatGot(variant.got)}`;

    case "unknown multi type":
      return `Expected one of these types: ${
        variant.knownTypes.length === 0
          ? "never"
          : variant.knownTypes.join(", ")
      }\nGot: ${formatGot(variant.got)}`;

    case "unknown fieldsUnion tag":
      return `Expected one of these tags: ${stringList(
        variant.knownTags
      )}\nGot: ${formatGot(variant.got)}`;

    case "unknown stringUnion variant":
      return `Expected one of these variants: ${stringList(
        variant.knownVariants
      )}\nGot: ${formatGot(variant.got)}`;

    case "wrong tag":
      return `Expected this string: ${JSON.stringify(
        variant.expected
      )}\nGot: ${formatGot(variant.got)}`;

    case "missing field": {
      const { maxObjectChildren = MAX_OBJECT_CHILDREN_DEFAULT } = options;
      const keys = Object.keys(variant.got);
      return `Expected an object with a field called: ${JSON.stringify(
        variant.field
      )}\nGot: ${formatGot(variant.got)}${
        keys.length > maxObjectChildren
          ? `\nMore fields: ${untrustedStringList(
              keys.slice(maxObjectChildren)
            )}`
          : ""
      }`;
    }

    case "exact fields":
      return `Expected only these fields: ${stringList(
        variant.knownFields
      )}\nFound extra fields: ${untrustedStringList(variant.got)}`;

    case "tuple size":
      return `Expected ${variant.expected} items\nGot: ${variant.got}`;

    case "custom":
      return `${variant.message}\nGot: ${formatGot(variant.got)}`;
  }
}

const MAX_OBJECT_CHILDREN_DEFAULT = 5;

export type ReprOptions = {
  depth?: number;
  indent?: string;
  maxArrayChildren?: number;
  maxObjectChildren?: number;
  maxLength?: number;
  sensitive?: boolean;
};

export function repr(
  value: unknown,
  {
    depth = 0,
    indent = "  ",
    maxArrayChildren = 5,
    maxObjectChildren = MAX_OBJECT_CHILDREN_DEFAULT,
    maxLength = 100,
    sensitive = false,
  }: ReprOptions = {}
): string {
  return reprHelper(
    value,
    {
      depth,
      maxArrayChildren,
      maxObjectChildren,
      maxLength,
      indent,
      sensitive,
    },
    0,
    []
  );
}

function reprHelper(
  value: unknown,
  options: Required<ReprOptions>,
  level: number,
  seen: Array<unknown>
): string {
  const { indent, maxLength, sensitive } = options;
  const type = typeof value;
  const toStringType = Object.prototype.toString
    .call(value)
    .replace(/^\[object\s+(.+)\]$/, "$1");

  try {
    if (
      // eslint-disable-next-line eqeqeq
      value == null ||
      type === "number" ||
      type === "boolean" ||
      type === "symbol" ||
      toStringType === "RegExp"
    ) {
      return sensitive
        ? toStringType.toLowerCase()
        : truncate(String(value), maxLength);
    }

    if (type === "string") {
      return sensitive ? type : truncate(JSON.stringify(value), maxLength);
    }

    if (typeof value === "function") {
      return `function ${truncate(JSON.stringify(value.name), maxLength)}`;
    }

    if (Array.isArray(value)) {
      const arr: Array<unknown> = value;
      if (arr.length === 0) {
        return "[]";
      }

      if (seen.includes(arr)) {
        return `circular ${toStringType}(${arr.length})`;
      }

      if (options.depth < level) {
        return `${toStringType}(${arr.length})`;
      }

      const lastIndex = arr.length - 1;
      const items = [];

      const end = Math.min(options.maxArrayChildren - 1, lastIndex);

      for (let index = 0; index <= end; index++) {
        const item =
          index in arr
            ? reprHelper(arr[index], options, level + 1, [...seen, arr])
            : "<empty>";
        items.push(item);
      }

      if (end < lastIndex) {
        items.push(`(${lastIndex - end} more)`);
      }

      return `[\n${indent.repeat(level + 1)}${items.join(
        `,\n${indent.repeat(level + 1)}`
      )}\n${indent.repeat(level)}]`;
    }

    if (toStringType === "Object") {
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);

      // `class Foo {}` has `toStringType === "Object"` and `name === "Foo"`.
      const { name } = object.constructor;
      const prefix = name === "Object" ? "" : `${name} `;

      if (keys.length === 0) {
        return `${prefix}{}`;
      }

      if (seen.includes(object)) {
        return `circular ${name}(${keys.length})`;
      }

      if (options.depth < level) {
        return `${name}(${keys.length})`;
      }

      const numHidden = Math.max(0, keys.length - options.maxObjectChildren);

      const items = keys
        .slice(0, options.maxObjectChildren)
        .map((key2) => {
          const truncatedKey = truncate(JSON.stringify(key2), maxLength);
          const valueRepr = reprHelper(object[key2], options, level + 1, [
            ...seen,
            object,
          ]);
          const separator =
            truncatedKey.length + valueRepr.length > maxLength
              ? `\n${indent.repeat(level + 2)}`
              : " ";
          return `${truncatedKey}:${separator}${valueRepr}`;
        })
        .concat(numHidden > 0 ? `(${numHidden} more)` : []);

      return `${prefix}{\n${indent.repeat(level + 1)}${items.join(
        `,\n${indent.repeat(level + 1)}`
      )}\n${indent.repeat(level)}}`;
    }

    return toStringType;
  } catch {
    return toStringType;
  }
}

function truncate(str: string, maxLength: number): string {
  const half = Math.floor(maxLength / 2);
  return str.length <= maxLength
    ? str
    : `${str.slice(0, half)}…${str.slice(-half)}`;
}
