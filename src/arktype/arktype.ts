import type { Type as ArkType } from "arktype";
import {
  arrayCodec,
  createAbi,
  identityCodec,
  objectCodec,
  recordCodec,
  tupleCodec,
  unionCodec,
} from "../shared/index.js";
import type { Codec } from "../shared/index.js";
import type { Abi } from "../types.js";

const abiCache = new WeakMap<ArkType<any, any>, Abi<any, any>>();
const codecCache = new WeakMap<object, Codec>();

export function abi<Schema extends ArkType<any, any>>(
  schema: Schema,
): Abi<Schema["inferIn"], Schema["inferIn"]> {
  const cached = abiCache.get(schema);
  if (cached) {
    return cached;
  }

  const codec = compile(schema, new Set());
  const result = createAbi<Schema["inferIn"]>(codec, (value) => assertValid(schema, value));
  abiCache.set(schema, result);
  return result;
}

function compile(schema: any, active: Set<object>): Codec {
  if (schema === null || (typeof schema !== "object" && typeof schema !== "function")) {
    throw new Error("Unsupported schema type: invalid ArkType schema");
  }

  const cached = codecCache.get(schema);
  if (cached) {
    return cached;
  }
  if (schema.isCyclic || active.has(schema)) {
    throw new Error("Unsupported schema type: recursive schema");
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

function compileDefinition(schema: any, active: Set<object>): Codec {
  if (schema.kind === "morph") {
    return compile(schema.introspectableIn, active);
  }

  // ArkType represents boolean as the union false | true, but it is an opaque
  // primitive for this encoding and should not acquire a union tag.
  if (schema.isBoolean === true) {
    return identityCodec();
  }

  if (schema.kind === "union") {
    if (schema.branches.length === 0) {
      throw new Error("Unsupported schema type: never");
    }
    return union(schema, active);
  }

  const structure = schema.structure;
  const sequence = structure?.sequence;
  if (sequence) {
    return sequenceCodec(sequence, active);
  }

  // Only plain string index signatures can map losslessly to JavaScript object
  // keys. Mixed named/indexed structures and symbol indexes need another wire form.
  const indexes = structure?.children?.filter((child: any) => child.kind === "index") ?? [];
  if (indexes.length > 0) {
    const props = schema.props as any[];
    if (indexes.length !== 1 || props.length !== 0 || indexes[0].signature?.domain !== "string") {
      throw new Error("Unsupported schema type: non-string or mixed record");
    }
    return record(indexes[0].value, active);
  }

  // ArkType's normalized object intersections expose one merged structure and
  // props list, so they can use the same deterministic positional representation.
  if (schema.json?.domain === "object" && structure) {
    return object(schema.props, active);
  }

  // Domains, literals, built-in instances, and constraints without a structural
  // shape (including Date and Map/Set) retain their original value.
  return identityCodec();
}

function object(props: any[], active: Set<object>): Codec {
  const fields = props.map((prop) => {
    if (typeof prop.key !== "string") {
      throw new Error("Unsupported schema type: symbol-keyed object");
    }
    return [prop.key, compile(prop.value, active)] as const;
  });
  return objectCodec(fields);
}

function sequenceCodec(sequence: any, active: Set<object>): Codec {
  const prefix: Codec[] = (sequence.prefix ?? []).map((item: any) => compile(item, active));
  const optional: Codec[] = (sequence.defaultablesAndOptionals ?? []).map((item: any) =>
    compile(item, active),
  );
  const variadic: Codec | undefined = sequence.variadic
    ? compile(sequence.variadic, active)
    : undefined;
  const postfix: Codec[] = (sequence.postfix ?? []).map((item: any) => compile(item, active));

  if (postfix.length > 0) {
    throw new Error("Unsupported schema type: tuple with postfix elements");
  }

  if (prefix.length === 0 && optional.length === 0 && variadic) {
    return arrayCodec(variadic);
  }

  return tupleCodec([...prefix, ...optional], variadic);
}

function record(valueSchema: any, active: Set<object>): Codec {
  return recordCodec(identityCodec(), compile(valueSchema, active));
}

function union(schema: any, active: Set<object>): Codec {
  const branches: any[] = schema.branches;
  const codecs = branches.map((branch) => compile(branch, active));
  return unionCodec(
    codecs,
    (value) => branches.findIndex((branch) => branch.allows(value)),
    (index, value) => assertValid(branches[index], value),
    {
      noMatch: "Value does not match any ArkType union branch",
      invalidEncoding: "Invalid union encoding",
    },
  );
}

function assertValid(schema: any, value: unknown): void {
  if (!schema.allows(value)) {
    throw new TypeError("Value does not match ArkType schema");
  }
}
