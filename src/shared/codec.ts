// There are some things that cannot be implemented without `any`.
// No `any` “leaks” when _using_ the library, though.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Codec<
  Decoded,
  Encoded = unknown,
  // eslint-disable-next-line @typescript-eslint/ban-types
  Options extends CodecOptions = {}
> = Options & {
  decoder: (value: unknown) => Decoded;
  encoder: (value: Decoded) => Encoded;
};

type CodecOptions = {
  encodedFieldName?: string;
  optional?: boolean;
};

type MergeOptions<A extends CodecOptions, B extends CodecOptions> = Expand<
  A & B
>;

// Make VSCode show `{ a: string; b?: number }` instead of `{ a: string } & { b?: number }`.
// https://stackoverflow.com/a/57683652/2010616
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type Infer<T extends Codec<any>> = ReturnType<T["decoder"]>;

export function parse<Decoded>(
  codec: Codec<Decoded>,
  jsonString: string
): Decoded | DecoderError {
  let json: unknown;
  try {
    json = JSON.parse(jsonString);
  } catch (error) {
    return new DecoderError({
      tag: "custom",
      message: error instanceof Error ? error.message : String(error),
      got: jsonString,
      cause: error,
    });
  }
  try {
    return codec.decoder(json);
  } catch (error) {
    return DecoderError.at(error);
  }
}

export function parseUnknown<Decoded>(
  codec: Codec<Decoded>,
  value: unknown
): Decoded | DecoderError {
  try {
    return codec.decoder(value);
  } catch (error) {
    return DecoderError.at(error);
  }
}

export function stringify<Decoded, Encoded>(
  codec: Codec<Decoded, Encoded>,
  value: Decoded,
  space?: number | string
): string {
  return JSON.stringify(codec.encoder(value), null, space);
}

export const parseWithoutCodec = JSON.parse;

export const stringifyWithoutCodec = JSON.stringify;

function identity<T>(value: T): T {
  return value;
}

export const unknown: Codec<unknown> = {
  decoder: identity,
  encoder: identity,
};

export const boolean: Codec<boolean, boolean> = {
  decoder: function booleanDecoder(value) {
    if (typeof value !== "boolean") {
      throw new DecoderError({ tag: "boolean", got: value });
    }
    return value;
  },
  encoder: identity,
};

export const number: Codec<number, number> = {
  decoder: function numberDecoder(value) {
    if (typeof value !== "number") {
      throw new DecoderError({ tag: "number", got: value });
    }
    return value;
  },
  encoder: identity,
};

export const string: Codec<string, string> = {
  decoder: function stringDecoder(value) {
    if (typeof value !== "string") {
      throw new DecoderError({ tag: "string", got: value });
    }
    return value;
  },
  encoder: identity,
};

export function stringUnion<Variants extends ReadonlyArray<string>>(
  values: Variants[number] extends never
    ? "stringUnion must have at least one variant"
    : [...Variants]
): Codec<Variants[number], Variants[number]> {
  return {
    decoder: function stringUnionDecoder(value) {
      const str = string.decoder(value);
      if (!values.includes(str)) {
        throw new DecoderError({
          tag: "unknown stringUnion variant",
          knownVariants: values as Array<string>,
          got: str,
        });
      }
      return str;
    },
    encoder: identity,
  };
}

function unknownArray(value: unknown): Array<unknown> {
  if (!Array.isArray(value)) {
    throw new DecoderError({ tag: "array", got: value });
  }
  return value;
}

function unknownRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DecoderError({ tag: "object", got: value });
  }
  return value as Record<string, unknown>;
}

export function array<DecodedItem, EncodedItem>(
  codec: Codec<DecodedItem, EncodedItem>
): Codec<Array<DecodedItem>, Array<EncodedItem>> {
  return {
    decoder: function arrayDecoder(value) {
      const arr = unknownArray(value);
      const result = [];
      for (let index = 0; index < arr.length; index++) {
        try {
          result.push(codec.decoder(arr[index]));
        } catch (error) {
          throw DecoderError.at(error, index);
        }
      }
      return result;
    },
    encoder: function arrayEncoder(arr) {
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
    decoder: function recordDecoder(value) {
      const object = unknownRecord(value);
      const keys = Object.keys(object);
      const result: Record<string, DecodedValue> = {};

      for (const key of keys) {
        if (key === "__proto__") {
          continue;
        }
        try {
          result[key] = codec.decoder(object[key]);
        } catch (error) {
          throw DecoderError.at(error, key);
        }
      }

      return result;
    },
    encoder: function recordEncoder(object) {
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

type FieldsMapping = Record<string, Codec<any, any, CodecOptions>>;

type InferFields<Mapping extends FieldsMapping> = Expand<
  // eslint-disable-next-line @typescript-eslint/sort-type-union-intersection-members
  {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? never
      : Key]: Infer<Mapping[Key]>;
  } & {
    [Key in keyof Mapping as Mapping[Key] extends { optional: true }
      ? Key
      : never]?: Infer<Mapping[Key]>;
  }
>;

export function fields<Mapping extends FieldsMapping, EncodedFieldValueUnion>(
  mapping: Mapping,
  { exact = "allow extra" }: { exact?: "allow extra" | "throw" } = {}
): Codec<InferFields<Mapping>, Record<string, EncodedFieldValueUnion>> {
  return {
    decoder: function fieldsDecoder(value) {
      const object = unknownRecord(value);
      const keys = Object.keys(mapping);
      const result: Record<string, unknown> = {};

      for (const key of keys) {
        if (key === "__proto__") {
          continue;
        }
        const {
          decoder,
          encodedFieldName: field = key,
          optional: isOptional = false,
        } = mapping[key];
        if (field === "__proto__") {
          continue;
        }
        try {
          const decoded: unknown = decoder(object[field]);
          if (!isOptional || decoded !== undefined) {
            result[key] = decoded;
          }
        } catch (error) {
          throw DecoderError.at(error, key);
        }
      }

      if (exact === "throw") {
        const unknownFields = Object.keys(object).filter(
          (key) => !Object.prototype.hasOwnProperty.call(mapping, key)
        );
        if (unknownFields.length > 0) {
          throw new DecoderError({
            tag: "exact fields",
            knownFields: keys,
            got: unknownFields,
          });
        }
      }

      return result as InferFields<Mapping>;
    },
    encoder: function fieldsEncoder(object) {
      const result: Record<string, EncodedFieldValueUnion> = {};
      for (const key of Object.keys(mapping)) {
        if (key === "__proto__") {
          continue;
        }
        const {
          encoder,
          encodedFieldName: field = key,
          optional: isOptional = false,
        } = mapping[key];
        if (field === "__proto__") {
          continue;
        }
        const value = object[key as keyof InferFields<Mapping>];
        if (!isOptional || value !== undefined) {
          result[field] = encoder(value) as EncodedFieldValueUnion;
        }
      }
      return result;
    },
  };
}

type InferFieldsUnion<MappingsUnion extends FieldsMapping> =
  MappingsUnion extends any ? InferFields<MappingsUnion> : never;

const tagSymbol: unique symbol = Symbol("fieldsUnion tag");

type TagCodec<Name extends string> = Codec<
  Name,
  string,
  { encodedFieldName: string }
> & {
  _private: TagData;
};

type TagData = {
  tag: typeof tagSymbol;
  decodedName: string;
  encodedName: string;
};

export function fieldsUnion<
  Variants extends ReadonlyArray<FieldsMapping>,
  EncodedFieldValueUnion
>(
  encodedCommonField: string,
  callback: Variants[number] extends never
    ? "fieldsUnion must have at least one variant"
    : (
        tag: <Name extends string>(
          decodedName: Name,
          encodedName?: string
        ) => Codec<Name, string>
      ) => [...Variants],
  { exact = "allow extra" }: { exact?: "allow extra" | "throw" } = {}
): Codec<
  InferFieldsUnion<Variants[number]>,
  Record<string, EncodedFieldValueUnion>
> {
  if (encodedCommonField === "__proto__") {
    throw new Error("fieldsUnion: commonField cannot be __proto__");
  }

  function tag<Name extends string>(
    decodedName: Name,
    encodedName: string = decodedName
  ): TagCodec<Name> {
    return {
      decoder: () => decodedName,
      encoder: () => encodedName,
      encodedFieldName: encodedCommonField,
      _private: {
        tag: tagSymbol,
        decodedName,
        encodedName,
      },
    };
  }

  const variants = (callback as (tag_: typeof tag) => [...Variants])(tag);

  type VariantCodec = Codec<any, Record<string, EncodedFieldValueUnion>>;
  const decoderMap = new Map<string, VariantCodec["decoder"]>(); // encodedName -> decoder
  const encoderMap = new Map<string, VariantCodec["encoder"]>(); // decodedName -> encoder

  let decodedCommonField: string | undefined = undefined;

  for (const [index, variant] of variants.entries()) {
    let seenTag: string | undefined = undefined;
    for (const [key, codec] of Object.entries(variant)) {
      if (key === "__proto__") {
        continue;
      }
      if ("_private" in codec) {
        const data = codec._private as TagData;
        if (data.tag === tagSymbol) {
          const errorPrefix = `Codec.fieldsUnion: Variant at index ${index}: Key ${JSON.stringify(
            key
          )}: `;
          if (seenTag !== undefined) {
            throw new Error(
              `${errorPrefix}\`tag()\` was already used on key: ${JSON.stringify(
                seenTag
              )})}`
            );
          }
          seenTag = key;
          if (decodedCommonField === undefined) {
            decodedCommonField = key;
          } else if (decodedCommonField !== key) {
            throw new Error(
              `${errorPrefix}\`tag()\` was used on another key in a previous variant: ${JSON.stringify(
                decodedCommonField
              )})}`
            );
          }
          if (encoderMap.has(data.decodedName)) {
            throw new Error(
              `${errorPrefix}The decoded variant name was already used in a previous variant: ${JSON.stringify(
                data.decodedName
              )}`
            );
          }
          if (decoderMap.has(data.encodedName)) {
            throw new Error(
              `${errorPrefix}The encoded variant name was already used in a previous variant: ${JSON.stringify(
                data.encodedName
              )}`
            );
          }
          const fullCodec: Codec<
            InferFields<Variants[number]>,
            Record<string, EncodedFieldValueUnion>
          > = fields(variant, { exact });
          decoderMap.set(data.encodedName, fullCodec.decoder);
          encoderMap.set(data.decodedName, fullCodec.encoder);
        }
      }
    }
    if (seenTag === undefined) {
      throw new Error(
        `Codec.fieldsUnion: Variant at index ${index}: \`tag()\` was never used on any key.`
      );
    }
  }

  return {
    decoder: function fieldsUnionDecoder(value) {
      const object = unknownRecord(value);
      let encodedName;
      try {
        encodedName = string.decoder(object[encodedCommonField]);
      } catch (error) {
        throw DecoderError.at(error, encodedCommonField);
      }
      const decoder = decoderMap.get(encodedName);
      if (decoder === undefined) {
        throw new DecoderError({
          tag: "unknown fieldsUnion tag",
          knownTags: Array.from(decoderMap.keys()),
          got: encodedName,
          key: encodedCommonField,
        });
      }
      return decoder(object) as InferFieldsUnion<Variants[number]>;
    },
    encoder: function fieldsUnionEncoder(value) {
      const decodedName = value[decodedCommonField as string] as string;
      const encoder = encoderMap.get(decodedName);
      if (encoder === undefined) {
        throw new Error(
          `Codec.fieldsUnion: Unexpectedly found no encoder for decoded variant name: ${JSON.stringify(
            decodedName
          )} at key ${JSON.stringify(decodedCommonField)}`
        );
      }
      return encoder(value);
    },
  };
}

// TODO: Good name
export function named<Decoded, Encoded, Options extends CodecOptions>(
  encodedFieldName: string,
  codec: Codec<Decoded, Encoded, Options>
): Codec<
  Decoded,
  Encoded,
  MergeOptions<Options, { encodedFieldName: string }>
> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...codec,
    encodedFieldName,
  } as Codec<
    Decoded,
    Encoded,
    MergeOptions<Options, { encodedFieldName: string }>
  >;
}

export function tuple<Decoded extends ReadonlyArray<unknown>, EncodedItem>(
  mapping: readonly [
    ...{ [Key in keyof Decoded]: Codec<Decoded[Key], EncodedItem> }
  ]
): Codec<[...Decoded], Array<EncodedItem>> {
  return {
    decoder: function tupleDecoder(value) {
      const arr = unknownArray(value);
      if (arr.length !== mapping.length) {
        throw new DecoderError({
          tag: "tuple size",
          expected: mapping.length,
          got: arr.length,
        });
      }
      const result = [];
      for (let index = 0; index < arr.length; index++) {
        try {
          const { decoder } = mapping[index];
          result.push(decoder(arr[index]));
        } catch (error) {
          throw DecoderError.at(error, index);
        }
      }
      return result as [...Decoded];
    },
    encoder: function tupleEncoder(value) {
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
    decoder: function multiDecoder(value) {
      if (value === undefined) {
        if (types.includes("undefined")) {
          return { type: "undefined", value } as unknown as Multi<
            Types[number]
          >;
        }
      } else if (value === null) {
        if (types.includes("null")) {
          return { type: "null", value } as unknown as Multi<Types[number]>;
        }
      } else if (typeof value === "boolean") {
        if (types.includes("boolean")) {
          return { type: "boolean", value } as unknown as Multi<Types[number]>;
        }
      } else if (typeof value === "number") {
        if (types.includes("number")) {
          return { type: "number", value } as unknown as Multi<Types[number]>;
        }
      } else if (typeof value === "string") {
        if (types.includes("string")) {
          return { type: "string", value } as unknown as Multi<Types[number]>;
        }
      } else if (Array.isArray(value)) {
        if (types.includes("array")) {
          return { type: "array", value } as unknown as Multi<Types[number]>;
        }
      } else {
        if (types.includes("object")) {
          return { type: "object", value } as unknown as Multi<Types[number]>;
        }
      }
      throw new DecoderError({
        tag: "unknown multi type",
        knownTypes: types as Array<"undefined">, // Type checking hack.
        got: value,
      });
    },
    encoder: function multiEncoder(value) {
      return value.value;
    },
  };
}

type fu = Infer<typeof fu>;
const fu = fieldsUnion("type", (tag) => [
  {
    tag: tag("fu"),
    fullName: named("full_name", string),
    hmm: named("HMM", optional(string)),
    flip: optional(named("flip", boolean)),
  },
]);
void fu;

const bar = chain(multi(["number", "string"]), {
  decoder: (value) => {
    switch (value.type) {
      case "number":
        return value.value.toString();
      case "string":
        return value.value;
    }
  },
  encoder: (value) => ({ type: "string" as const, value }),
});
void bar;
type bar = Infer<typeof bar>;

type Result<Value, Err> =
  | {
      type: "error";
      error: Err;
    }
  | {
      type: "ok";
      value: Value;
    };

const resultCodec = function <Value, Err>(
  decodeValue: Codec<Value>,
  decodeError: Codec<Err>
): Codec<Result<Value, Err>> {
  return fieldsUnion("type", (tag) => [
    {
      type: tag("ok"),
      value: decodeValue,
    },
    {
      type: tag("error"),
      error: decodeError,
    },
  ]);
};

const foo = resultCodec(number, string);
void foo;
type foo = Infer<typeof foo>;

type Dict = { [key: string]: Dict | number };

const dictCodec: Codec<Dict, Record<string, unknown>> = record(
  chain(multi(["number", "object"]), {
    decoder: (value) => {
      switch (value.type) {
        case "number":
          return value.value;
        case "object":
          return dictCodec.decoder(value.value);
      }
    },
    encoder: (value) => {
      if (typeof value === "number") {
        return { type: "number" as const, value };
      } else {
        return {
          type: "object" as const,
          value: dictCodec.encoder(value),
        };
      }
    },
  })
);

const dictFoo: Codec<Record<string, string>, Record<string, unknown>> = record(
  string
);
void dictFoo;

const age = named("AGE", optional(number));
const page = optional(named("PAGE", number));

type fieldsFoo = Infer<typeof fieldsFoo>;
const fieldsFoo = fields({
  name: string,
  age,
  page,
  sage: optional(string),
});
void fieldsFoo;

export function recursive<Decoded, Encoded>(
  callback: () => Codec<Decoded, Encoded>
): Codec<Decoded, Encoded> {
  return {
    decoder: function lazyDecoder(value) {
      return callback().decoder(value);
    },
    encoder: function lazyEncoder(value) {
      return callback().encoder(value);
    },
  };
}

type Person = {
  name: string;
  friends: Array<Person>;
};

const personCodec: Codec<Person, Record<string, unknown>> = fields({
  name: string,
  friends: array(recursive(() => personCodec)),
});

export function optional<Decoded, Encoded, Options extends CodecOptions>(
  codec: Codec<Decoded, Encoded, Options>
): Codec<
  Decoded | undefined,
  Encoded | undefined,
  MergeOptions<Options, { optional: true }>
> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...codec,
    optional: true,
    decoder: function undefinedOrDecoder(value) {
      if (value === undefined) {
        return undefined;
      }
      try {
        return codec.decoder(value);
      } catch (error) {
        const newError = DecoderError.at(error);
        if (newError.path.length === 0) {
          newError.optional = true;
        }
        throw newError;
      }
    },
    encoder: function undefinedOrEncoder(value) {
      return value === undefined ? undefined : codec.encoder(value);
    },
  } as Codec<
    Decoded | undefined,
    Encoded | undefined,
    MergeOptions<Options, { optional: true }>
  >;
}

export function nullable<Decoded, Encoded, Options extends CodecOptions>(
  codec: Codec<Decoded, Encoded, Options>
): Codec<Decoded | null, Encoded | null, Options> {
  return {
    ...codec,
    decoder: function nullOrDecoder(value) {
      if (value === null) {
        return null;
      }
      try {
        return codec.decoder(value);
      } catch (error) {
        const newError = DecoderError.at(error);
        if (newError.path.length === 0) {
          newError.optional = true;
        }
        throw newError;
      }
    },
    encoder: function nullOrEncoder(value) {
      return value === null ? null : codec.encoder(value);
    },
  };
}

export function chain<
  Decoded,
  Encoded,
  Options extends CodecOptions,
  NewDecoded
>(
  codec: Codec<Decoded, Encoded, Options>,
  transform: {
    decoder: (value: Decoded) => NewDecoded;
    encoder: (value: NewDecoded) => Decoded;
  }
): Codec<NewDecoded, Encoded, Options> {
  return {
    ...codec,
    decoder: function chainDecoder(value) {
      return transform.decoder(codec.decoder(value));
    },
    encoder: function chainEncoder(value) {
      return codec.encoder(transform.encoder(value));
    },
  };
}

const t1 = optional(string);
const t2 = named("", string);
const t3 = named("", optional(string));
const t4 = optional(named("", string));
const t5 = nullable(string);
const t6 = optional(nullable(string));
const t7 = nullable(optional(string));
const t8 = chain(nullable(optional(named("", string))), {
  decoder: (value) => value,
  encoder: (value) => value,
});
const t9 = chain(string, named("", string));
void [t1, t2, t3, t4, t5, t6, t7, t8, t9];

export function singleField<Decoded, Encoded>(
  field: string,
  codec: Codec<Decoded, Encoded>
): Codec<Decoded, Record<string, Encoded>> {
  return chain(fields({ [field]: codec }), {
    decoder: (value) => value[field],
    encoder: (value) => ({ [field]: value }),
  });
}

export type DecoderErrorVariant =
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
  | { tag: "array"; got: unknown }
  | { tag: "boolean"; got: unknown }
  | { tag: "number"; got: unknown }
  | { tag: "object"; got: unknown }
  | { tag: "string"; got: unknown };

function formatDecoderErrorVariant(
  variant: DecoderErrorVariant,
  options?: ReprOptions
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

  const got = (message: string, value: unknown): string =>
    value === DecoderError.MISSING_VALUE
      ? message
      : `${message}\nGot: ${formatGot(value)}`;

  switch (variant.tag) {
    case "boolean":
    case "number":
    case "string":
      return got(`Expected a ${variant.tag}`, variant.got);

    case "array":
    case "object":
      return got(`Expected an ${variant.tag}`, variant.got);

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

    case "exact fields":
      return `Expected only these fields: ${stringList(
        variant.knownFields
      )}\nFound extra fields: ${formatGot(variant.got).replace(
        /^\[|\]$/g,
        ""
      )}`;

    case "tuple size":
      return `Expected ${variant.expected} items\nGot: ${variant.got}`;

    case "custom":
      return got(variant.message, variant.got);
  }
}

type Key = number | string;

export class DecoderError extends TypeError {
  path: Array<Key>;

  variant: DecoderErrorVariant;

  nullable: boolean;

  optional: boolean;

  // Unnecessary if using `"lib": ["ES2022"]` in tsconfig.json.
  // For those who don’t, this allows `.cause` to be used anyway.
  cause?: unknown;

  constructor(
    options:
      | { message: string; value: unknown; key?: Key; cause?: unknown }
      | (DecoderErrorVariant & { key?: Key; cause?: unknown })
  ) {
    const { key, cause, ...params } = options;
    const variant: DecoderErrorVariant =
      "tag" in params
        ? params
        : { tag: "custom", message: params.message, got: params.value };
    super(
      `${formatDecoderErrorVariant(
        variant,
        // Default to sensitive so accidental uncaught errors don’t leak
        // anything. Explicit `.format()` defaults to non-sensitive.
        { sensitive: true }
      )}\n\nFor better error messages, see https://github.com/lydell/tiny-decoders#error-messages`,
      // @ts-expect-error: yo yo yo
      "cause" in options ? { cause } : {}
    );
    this.path = key === undefined ? [] : [key];
    this.variant = variant;
    this.nullable = false;
    this.optional = false;

    // For Node.js 14 and 15, which don’t support the `cause` option.
    if ("cause" in options && !("cause" in this)) {
      this.cause = cause;
    }
  }

  static MISSING_VALUE = Symbol("DecoderError.MISSING_VALUE");

  static at(error: unknown, key?: Key): DecoderError {
    if (error instanceof DecoderError) {
      if (key !== undefined) {
        error.path.unshift(key);
      }
      return error;
    }
    return new DecoderError({
      tag: "custom",
      message: error instanceof Error ? error.message : String(error),
      got: DecoderError.MISSING_VALUE,
      key,
      cause: error,
    });
  }

  format(options?: ReprOptions): string {
    const path = this.path.map((part) => `[${JSON.stringify(part)}]`).join("");
    const nullableString = this.nullable ? " (nullable)" : "";
    const optionalString = this.optional ? " (optional)" : "";
    const variant = formatDecoderErrorVariant(this.variant, options);
    return `At root${path}${nullableString}${optionalString}:\n${variant}`;
  }
}

export type ReprOptions = {
  recurse?: boolean;
  maxArrayChildren?: number;
  maxObjectChildren?: number;
  maxLength?: number;
  recurseMaxLength?: number;
  sensitive?: boolean;
};

export function repr(
  value: unknown,
  {
    recurse = true,
    maxArrayChildren = 5,
    maxObjectChildren = 3,
    maxLength = 100,
    recurseMaxLength = 20,
    sensitive = false,
  }: ReprOptions = {}
): string {
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
      if (!recurse && arr.length > 0) {
        return `${toStringType}(${arr.length})`;
      }

      const lastIndex = arr.length - 1;
      const items = [];

      const end = Math.min(maxArrayChildren - 1, lastIndex);

      for (let index = 0; index <= end; index++) {
        const item =
          index in arr
            ? repr(arr[index], {
                recurse: false,
                maxLength: recurseMaxLength,
                sensitive,
              })
            : "<empty>";
        items.push(item);
      }

      if (end < lastIndex) {
        items.push(`(${lastIndex - end} more)`);
      }

      return `[${items.join(", ")}]`;
    }

    if (toStringType === "Object") {
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);

      // `class Foo {}` has `toStringType === "Object"` and `name === "Foo"`.
      const { name } = object.constructor;

      if (!recurse && keys.length > 0) {
        return `${name}(${keys.length})`;
      }

      const numHidden = Math.max(0, keys.length - maxObjectChildren);

      const items = keys
        .slice(0, maxObjectChildren)
        .map(
          (key2) =>
            `${truncate(JSON.stringify(key2), recurseMaxLength)}: ${repr(
              object[key2],
              {
                recurse: false,
                maxLength: recurseMaxLength,
                sensitive,
              }
            )}`
        )
        .concat(numHidden > 0 ? `(${numHidden} more)` : []);

      const prefix = name === "Object" ? "" : `${name} `;
      return `${prefix}{${items.join(", ")}}`;
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
