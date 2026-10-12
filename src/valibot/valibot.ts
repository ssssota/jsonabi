import * as v from "valibot";
import {
  arrayCodec,
  createAbi,
  identityCodec,
  mapCodec,
  objectCodec,
  recordCodec,
  setCodec,
  tupleCodec,
  unionCodec,
  wrappedCodec,
} from "../shared/index.js";
import type { Codec } from "../shared/index.js";
import type { Abi } from "../types.js";

const cache = new WeakMap<v.GenericSchema, Abi<any, any>>();

const opaqueTypes = new Set([
  "any",
  "bigint",
  "blob",
  "boolean",
  "custom",
  "date",
  "enum",
  "file",
  "function",
  "instance",
  "literal",
  "nan",
  "null",
  "number",
  "picklist",
  "promise",
  "string",
  "symbol",
  "undefined",
  "unknown",
  "void",
]);

const wrapperTypes = new Set([
  "exact_optional",
  "non_nullable",
  "non_nullish",
  "non_optional",
  "nullable",
  "nullish",
  "optional",
  "undefinedable",
]);

export function abi<Schema extends v.GenericSchema>(
  schema: Schema,
): Abi<v.InferInput<Schema>, v.InferInput<Schema>> {
  const cached = cache.get(schema);
  if (cached) {
    return cached;
  }

  const codec = compile(schema);
  const result = createAbi<v.InferInput<Schema>>(codec, (value) => assertValid(schema, value));
  cache.set(schema, result);
  return result;
}

function compile(schema: any): Codec {
  if (schema.type === "object" || schema.type === "strict_object") {
    return object(schema);
  }
  if (schema.type === "array") {
    return arrayCodec(compile(schema.item));
  }
  if (
    schema.type === "tuple" ||
    schema.type === "loose_tuple" ||
    schema.type === "strict_tuple" ||
    schema.type === "tuple_with_rest"
  ) {
    return tuple(schema);
  }
  if (schema.type === "record") {
    return record(schema);
  }
  if (schema.type === "map") {
    return map(schema);
  }
  if (schema.type === "set") {
    return set(schema);
  }
  if (schema.type === "union" || schema.type === "variant") {
    return union(schema);
  }
  if (wrapperTypes.has(schema.type)) {
    return wrapped(schema);
  }
  if (opaqueTypes.has(schema.type)) {
    return identityCodec();
  }
  throw new Error(`Unsupported schema type: ${schema.type}`);
}

function object(schema: any): Codec {
  const entries: [string, any][] = Object.entries(schema.entries);
  return objectCodec(entries.map(([key, fieldSchema]) => [key, compile(fieldSchema)] as const));
}

function tuple(schema: any): Codec {
  const items: Codec[] = schema.items.map((item: any) => compile(item));
  const rest = schema.type === "tuple_with_rest" ? compile(schema.rest) : undefined;
  const isVariableLength = schema.type === "loose_tuple" || schema.type === "tuple_with_rest";
  return tupleCodec(items, rest, { count: items.length, variable: isVariableLength });
}

function record(schema: any): Codec {
  return recordCodec(compile(schema.key), compile(schema.value));
}

function map(schema: any): Codec {
  return mapCodec(compile(schema.key), compile(schema.value));
}

function set(schema: any): Codec {
  return setCodec(compile(schema.value));
}

function union(schema: any): Codec {
  const options: any[] = schema.options;
  const optionCodecs = options.map((option) => compile(option));

  return unionCodec(
    optionCodecs,
    (value) => options.findIndex((option) => v.is(option, value)),
    (index, value) => assertValid(options[index], value),
    {
      noMatch: `Value does not match ${schema.expects}`,
      invalidEncoding: `Invalid ${schema.type} encoding`,
    },
  );
}

function wrapped(schema: any): Codec {
  const inner = compile(schema.wrapped);
  const allowsUndefined = ["optional", "exact_optional", "undefinedable", "nullish"].includes(
    schema.type,
  );
  const allowsNull = ["nullable", "nullish"].includes(schema.type);
  return wrappedCodec(inner, { undefined: allowsUndefined, null: allowsNull });
}

function assertValid(schema: v.GenericSchema, value: unknown): void {
  if (!v.is(schema, value)) {
    throw new TypeError(`Value does not match ${schema.expects}`);
  }
}
