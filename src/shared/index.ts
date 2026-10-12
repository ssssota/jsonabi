import type { Abi } from "../types.js";

export type Codec = {
  encode: (value: any) => any;
  decode: (value: any) => any;
};

export function createAbi<Input>(codec: Codec, assertValid: (value: unknown) => void): Abi<Input> {
  return {
    encode: (value) => {
      assertValid(value);
      return codec.encode(value);
    },
    decode: (value) => {
      const decoded = codec.decode(value);
      assertValid(decoded);
      return decoded;
    },
  };
}

export function identityCodec(): Codec {
  return {
    encode: (value) => value,
    decode: (value) => value,
  };
}

export function objectCodec(fields: readonly (readonly [string, Codec])[]): Codec {
  const sorted = [...fields].sort(([a], [b]) => compareStrings(a, b));
  return {
    encode: (value) => {
      if (value === null || typeof value !== "object") {
        throw new TypeError("Expected an object");
      }
      const result: any[] = [];
      result.length = sorted.length;
      sorted.forEach(([key, field], index) => {
        if (Object.hasOwn(value, key)) {
          result[index] = field.encode(value[key]);
        }
      });
      return result;
    },
    decode: (value) => {
      assertArrayLength(value, sorted.length, "object");
      const result: Record<string, any> = {};
      sorted.forEach(([key, field], index) => {
        if (Object.hasOwn(value, index)) {
          result[key] = field.decode(value[index]);
        }
      });
      return result;
    },
  };
}

export function arrayCodec(item: Codec): Codec {
  return {
    encode: (value) => mapPresentItems(value, item.encode),
    decode: (value) => mapPresentItems(value, item.decode),
  };
}

export function tupleCodec(
  items: Codec[],
  rest?: Codec,
  length?: { count: number; variable: boolean },
): Codec {
  const transform = (value: any, direction: "encode" | "decode") => {
    if (length) {
      assertTupleLength(value, length.count, length.variable);
    } else if (!Array.isArray(value)) {
      throw new TypeError("Expected a tuple");
    }
    const result: any[] = [];
    result.length = value.length;
    for (let index = 0; index < value.length; index++) {
      if (Object.hasOwn(value, index)) {
        const item = index < items.length ? items[index] : rest;
        result[index] = item ? item[direction](value[index]) : value[index];
      }
    }
    return result;
  };
  return {
    encode: (value) => transform(value, "encode"),
    decode: (value) => transform(value, "decode"),
  };
}

export function recordCodec(key: Codec, item: Codec): Codec {
  return {
    encode: (value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Expected a record object");
      }
      const result: any[] = ["record"];
      const entries = Object.entries(value).sort(([a], [b]) => compareStrings(a, b));
      for (const [entryKey, entryValue] of entries) {
        result.push(key.encode(entryKey), item.encode(entryValue));
      }
      return result;
    },
    decode: (value) => {
      assertTaggedPairs(value, "record");
      const entries: [string, any][] = [];
      const seen = new Set<string>();
      for (let index = 1; index < value.length; index += 2) {
        const entryKey = key.decode(value[index]);
        if (typeof entryKey !== "string" || seen.has(entryKey)) {
          throw new TypeError("Invalid record key");
        }
        seen.add(entryKey);
        entries.push([entryKey, item.decode(value[index + 1])]);
      }
      return Object.fromEntries(entries);
    },
  };
}

export function mapCodec(key: Codec, item: Codec): Codec {
  return {
    encode: (value) => {
      const result: any[] = ["map"];
      for (const [entryKey, entryValue] of value) {
        result.push(key.encode(entryKey), item.encode(entryValue));
      }
      return result;
    },
    decode: (value) => {
      assertTaggedPairs(value, "map");
      const result = new Map();
      for (let index = 1; index < value.length; index += 2) {
        const entryKey = key.decode(value[index]);
        if (result.has(entryKey)) {
          throw new TypeError("Duplicate map key");
        }
        result.set(entryKey, item.decode(value[index + 1]));
      }
      return result;
    },
  };
}

export function setCodec(item: Codec): Codec {
  return {
    encode: (value) => ["set", ...Array.from(value, (entry) => item.encode(entry))],
    decode: (value) => {
      if (!Array.isArray(value) || value[0] !== "set") {
        throw new TypeError("Invalid set encoding");
      }
      const result = new Set();
      for (let index = 1; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Invalid set encoding");
        }
        const entry = item.decode(value[index]);
        if (result.has(entry)) {
          throw new TypeError("Duplicate set value");
        }
        result.add(entry);
      }
      return result;
    },
  };
}

export function unionCodec(
  branches: Codec[],
  select: (value: any) => number,
  assertBranch: (index: number, value: unknown) => void,
  messages: { noMatch: string; invalidEncoding: string },
): Codec {
  return {
    encode: (value) => {
      const index = select(value);
      if (index < 0) {
        throw new TypeError(messages.noMatch);
      }
      return [index, branches[index].encode(value)];
    },
    decode: (value) => {
      if (
        !Array.isArray(value) ||
        value.length !== 2 ||
        !Number.isInteger(value[0]) ||
        value[0] < 0 ||
        value[0] >= branches.length ||
        !Object.hasOwn(value, 1)
      ) {
        throw new TypeError(messages.invalidEncoding);
      }
      const index = value[0];
      const decoded = branches[index].decode(value[1]);
      assertBranch(index, decoded);
      return decoded;
    },
  };
}

export function wrappedCodec(
  inner: Codec,
  preserve: { undefined?: boolean; null?: boolean },
): Codec {
  const shouldPreserve = (value: unknown) =>
    (value === undefined && preserve.undefined) || (value === null && preserve.null);
  return {
    encode: (value) => (shouldPreserve(value) ? value : inner.encode(value)),
    decode: (value) => (shouldPreserve(value) ? value : inner.decode(value)),
  };
}

function mapPresentItems(value: any, transform: (item: any) => any): any[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Expected an array");
  }
  const result: any[] = [];
  result.length = value.length;
  for (let index = 0; index < value.length; index++) {
    if (Object.hasOwn(value, index)) {
      result[index] = transform(value[index]);
    }
  }
  return result;
}

function assertTupleLength(value: any, length: number, variable: boolean): asserts value is any[] {
  if (!Array.isArray(value) || (variable ? value.length < length : value.length !== length)) {
    throw new TypeError("Invalid tuple encoding");
  }
}

function assertArrayLength(value: any, length: number, kind: string): asserts value is any[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`Expected ${kind} encoding with ${length} items`);
  }
}

function assertTaggedPairs(value: any, tag: string): asserts value is any[] {
  if (!Array.isArray(value) || value[0] !== tag || value.length % 2 !== 1) {
    throw new TypeError(`Invalid ${tag} encoding`);
  }
  for (let index = 1; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`Invalid ${tag} encoding`);
    }
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
