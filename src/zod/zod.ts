import type * as core from "zod/v4/core";
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

type SafeParseResult = { success: true; data: unknown } | { success: false; error: unknown };
type Schema = core.$ZodType & {
  safeParse: (value: unknown) => SafeParseResult;
};

const codecCache = new WeakMap<Schema, Codec>();

const opaqueTypes = new Set([
  "any",
  "bigint",
  "boolean",
  "custom",
  "date",
  "enum",
  "file",
  "function",
  "literal",
  "nan",
  "null",
  "number",
  "string",
  "symbol",
  "template_literal",
  "undefined",
  "unknown",
  "void",
]);

export function abi<SchemaType extends Schema>(
  schema: SchemaType,
): Abi<core.input<SchemaType>, core.input<SchemaType>> {
  const codec = compile(schema, new Set());
  return createAbi<core.input<SchemaType>>(codec, (value) => assertValid(schema, value));
}

function compile(schema: Schema, active: Set<object>): Codec {
  const cached = codecCache.get(schema);
  if (cached) {
    return cached;
  }
  if (active.has(schema)) {
    throw new Error(`Unsupported schema type: ${schema._zod.def.type} (recursive schema)`);
  }

  active.add(schema);
  try {
    const codec = compileDefinition(schema, active);
    codecCache.set(schema, codec);
    return codec;
  } finally {
    active.delete(schema);
  }
}

function compileDefinition(schema: Schema, active: Set<object>): Codec {
  const definition = schema._zod.def as any;

  switch (definition.type) {
    case "object":
      return object(definition, active);
    case "array": {
      const item = compile(definition.element, active);
      return arrayCodec(item);
    }
    case "tuple":
      return tuple(definition, active);
    case "record":
      return record(definition, active);
    case "map":
      return map(definition, active);
    case "set": {
      const item = compile(definition.valueType, active);
      return setCodec(item);
    }
    case "union":
      return union(definition, active);
    case "optional":
      return wrapped(definition.innerType, active, { undefined: true });
    case "nullable":
      return wrapped(definition.innerType, active, { null: true });
    case "default":
    case "prefault":
      return wrapped(definition.innerType, active, { undefined: true });
    case "nonoptional":
    case "readonly":
      return wrapped(definition.innerType, active);
    case "pipe":
      return pipe(definition, active);
    case "never":
      throw new Error("Unsupported schema type: never");
    case "lazy":
    case "promise":
    case "catch":
    case "transform":
      throw new Error(`Unsupported schema type: ${definition.type}`);
    default:
      if (opaqueTypes.has(definition.type)) {
        return identityCodec();
      }
      throw new Error(`Unsupported schema type: ${definition.type}`);
  }
}

function object(definition: any, active: Set<object>): Codec {
  if (Object.hasOwn(definition, "catchall")) {
    const catchallType = definition.catchall?._zod?.def?.type;
    // strictObject is represented by a never catchall; loose objects and user catchalls
    // have behavior that cannot be represented by the declared positional fields.
    if (catchallType !== "never") {
      throw new Error(`Unsupported schema type: object with ${catchallType} catchall`);
    }
  }

  const shape = definition.shape;
  if (!shape || typeof shape !== "object") {
    throw new Error("Unsupported schema type: object with dynamic shape");
  }
  const entries = Object.entries(shape) as [string, Schema][];
  return objectCodec(
    entries.map(([key, fieldSchema]) => [key, compile(fieldSchema, active)] as const),
  );
}

function tuple(definition: any, active: Set<object>): Codec {
  const items: Codec[] = definition.items.map((item: Schema) => compile(item, active));
  const rest: Codec | undefined = definition.rest ? compile(definition.rest, active) : undefined;

  return tupleCodec(items, rest, { count: items.length, variable: rest !== undefined });
}

function record(definition: any, active: Set<object>): Codec {
  if (definition.mode === "loose") {
    throw new Error("Unsupported schema type: looseRecord");
  }
  const keyType = definition.keyType?._zod?.def?.type;
  if (!["string", "enum", "literal"].includes(keyType)) {
    throw new Error(`Unsupported schema type: record with ${keyType} keys`);
  }

  return recordCodec(compile(definition.keyType, active), compile(definition.valueType, active));
}

function map(definition: any, active: Set<object>): Codec {
  return mapCodec(compile(definition.keyType, active), compile(definition.valueType, active));
}

function union(definition: any, active: Set<object>): Codec {
  const options: Schema[] = definition.options;
  const optionCodecs = options.map((option) => compile(option, active));

  return unionCodec(
    optionCodecs,
    (value) => options.findIndex((option) => option.safeParse(value).success),
    (index, value) => assertValid(options[index], value),
    {
      noMatch: "Value does not match any union option",
      invalidEncoding: "Invalid union encoding",
    },
  );
}

function wrapped(
  innerSchema: Schema,
  active: Set<object>,
  preserve: { undefined?: boolean; null?: boolean } = {},
): Codec {
  const inner = compile(innerSchema, active);
  return wrappedCodec(inner, preserve);
}

function pipe(definition: any, active: Set<object>): Codec {
  // Preprocessors receive values before a declared input schema, so their wire shape
  // cannot be derived from the input schema alone.
  if (definition.in?._zod?.def?.type === "transform") {
    throw new Error("Unsupported schema type: preprocess");
  }
  // stringbool is a reversible Zod pipe with an error-map marker. Keep its source
  // string as the value while the outer safeParse still performs the validation.
  if (Object.hasOwn(definition, "reverseTransform") && !Object.hasOwn(definition, "error")) {
    throw new Error("Unsupported schema type: codec");
  }
  return compile(definition.in, active);
}

function assertValid(schema: Schema, value: unknown): void {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new TypeError("Value does not match Zod schema", { cause: result.error });
  }
}
