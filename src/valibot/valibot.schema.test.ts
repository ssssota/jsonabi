import * as v from "valibot";
import { assert, test } from "vitest";
import { abi } from "./valibot.js";

// The synchronous Schemas section of https://valibot.dev/api/ (Valibot 1.5).
const schemaNames = [
  "any",
  "array",
  "bigint",
  "blob",
  "boolean",
  "custom",
  "date",
  "enum",
  "exactOptional",
  "file",
  "function",
  "instance",
  "intersect",
  "lazy",
  "literal",
  "looseObject",
  "looseTuple",
  "map",
  "nan",
  "never",
  "nonNullable",
  "nonNullish",
  "nonOptional",
  "null",
  "nullable",
  "nullish",
  "number",
  "object",
  "objectWithRest",
  "optional",
  "picklist",
  "promise",
  "record",
  "set",
  "strictObject",
  "strictTuple",
  "string",
  "symbol",
  "tuple",
  "tupleWithRest",
  "undefined",
  "undefinedable",
  "union",
  "unknown",
  "variant",
  "void",
] as const;

type SchemaName = (typeof schemaNames)[number];
type LeafCase = { name: SchemaName; schema: v.GenericSchema; value: unknown };
type StructuralCase = {
  name: SchemaName;
  schema: v.GenericSchema;
  value: unknown;
  encoded: unknown;
};
type UnsupportedCase = { name: SchemaName; schema: v.GenericSchema };

const date = new Date("2026-09-27T00:00:00.000Z");
const blob = new Blob(["hello"]);
const file = new File(["hello"], "hello.txt");
const fn = () => 42;
const promise = Promise.resolve(42);
const symbol = Symbol("value");
const opaque = { nested: { value: 42 } };

const leafCases: LeafCase[] = [
  { name: "any", schema: v.any(), value: opaque },
  { name: "bigint", schema: v.bigint(), value: 42n },
  { name: "blob", schema: v.blob(), value: blob },
  { name: "boolean", schema: v.boolean(), value: true },
  {
    name: "custom",
    schema: v.custom((input): input is Date => input instanceof Date),
    value: date,
  },
  { name: "date", schema: v.date(), value: date },
  { name: "enum", schema: v.enum({ A: "a", B: "b" }), value: "a" },
  { name: "file", schema: v.file(), value: file },
  { name: "function", schema: v.function(), value: fn },
  { name: "instance", schema: v.instance(Date), value: date },
  { name: "literal", schema: v.literal("hello"), value: "hello" },
  { name: "nan", schema: v.nan(), value: Number.NaN },
  { name: "null", schema: v.null(), value: null },
  { name: "number", schema: v.number(), value: 42 },
  { name: "picklist", schema: v.picklist(["a", "b"]), value: "a" },
  { name: "promise", schema: v.promise(), value: promise },
  { name: "string", schema: v.string(), value: "hello" },
  { name: "symbol", schema: v.symbol(), value: symbol },
  { name: "undefined", schema: v.undefined(), value: undefined },
  { name: "unknown", schema: v.unknown(), value: opaque },
  { name: "void", schema: v.void(), value: undefined },
];

const item = v.object({ value: v.string() });
const itemValue = { value: "A" };
const itemWire = ["A"];
const structuralCases: StructuralCase[] = [
  { name: "array", schema: v.array(item), value: [itemValue], encoded: [itemWire] },
  { name: "exactOptional", schema: v.exactOptional(item), value: itemValue, encoded: itemWire },
  {
    name: "looseTuple",
    schema: v.looseTuple([item]),
    value: [itemValue, opaque],
    encoded: [itemWire, opaque],
  },
  {
    name: "map",
    schema: v.map(v.string(), item),
    value: new Map([
      ["z", { value: "Z" }],
      ["a", itemValue],
    ]),
    encoded: ["map", "z", ["Z"], "a", itemWire],
  },
  {
    name: "nonNullable",
    schema: v.nonNullable(v.nullable(item)),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "nonNullish",
    schema: v.nonNullish(v.nullish(item)),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "nonOptional",
    schema: v.nonOptional(v.optional(item)),
    value: itemValue,
    encoded: itemWire,
  },
  { name: "nullable", schema: v.nullable(item), value: itemValue, encoded: itemWire },
  { name: "nullish", schema: v.nullish(item), value: itemValue, encoded: itemWire },
  { name: "object", schema: item, value: itemValue, encoded: itemWire },
  { name: "optional", schema: v.optional(item), value: itemValue, encoded: itemWire },
  {
    name: "record",
    schema: v.record(v.string(), item),
    value: { z: { value: "Z" }, a: itemValue },
    encoded: ["record", "a", itemWire, "z", ["Z"]],
  },
  {
    name: "set",
    schema: v.set(item),
    value: new Set([{ value: "Z" }, itemValue]),
    encoded: ["set", ["Z"], itemWire],
  },
  {
    name: "strictObject",
    schema: v.strictObject({ value: v.string() }),
    value: itemValue,
    encoded: itemWire,
  },
  { name: "strictTuple", schema: v.strictTuple([item]), value: [itemValue], encoded: [itemWire] },
  { name: "tuple", schema: v.tuple([item]), value: [itemValue], encoded: [itemWire] },
  {
    name: "tupleWithRest",
    schema: v.tupleWithRest([v.string()], item),
    value: ["head", itemValue, { value: "B" }],
    encoded: ["head", itemWire, ["B"]],
  },
  { name: "undefinedable", schema: v.undefinedable(item), value: itemValue, encoded: itemWire },
  {
    name: "union",
    schema: v.union([item, v.number()]),
    value: itemValue,
    encoded: [0, itemWire],
  },
  {
    name: "variant",
    schema: v.variant("kind", [
      v.object({ kind: v.literal("a"), value: v.string() }),
      v.object({ kind: v.literal("b"), value: v.number() }),
    ]),
    value: { kind: "a", value: "A" },
    encoded: [0, ["a", "A"]],
  },
];

const unsupportedCases: UnsupportedCase[] = [
  {
    name: "intersect",
    schema: v.intersect([v.object({ a: v.string() }), v.object({ b: v.number() })]),
  },
  { name: "lazy", schema: v.lazy(() => item) },
  { name: "looseObject", schema: v.looseObject({ value: v.string() }) },
  { name: "never", schema: v.never() },
  { name: "objectWithRest", schema: v.objectWithRest({ value: v.string() }, v.number()) },
];

test("every synchronous Valibot Schema has an explicit ABI decision", () => {
  const coveredNames = [...leafCases, ...structuralCases, ...unsupportedCases]
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(coveredNames, [...schemaNames].sort());
});

test.each(leafCases)("$name passes its value through by identity", ({ schema, value }) => {
  const codec = abi(schema);
  const encoded = codec.encode(value);
  assert.isTrue(Object.is(encoded, value));
  assert.isTrue(Object.is(codec.decode(encoded), value));
});

test.each(structuralCases)(
  "$name preserves its nested object shape",
  ({ schema, value, encoded }) => {
    const codec = abi(schema);
    assert.deepEqual(codec.encode(value), encoded);
    assert.deepEqual(codec.decode(encoded), value);
  },
);

test.each(unsupportedCases)("$name fails explicitly", ({ schema }) => {
  assert.throws(() => abi(schema), /Unsupported schema type/);
});

test("nullable and optional wrappers preserve their empty values", () => {
  const cases = [
    [v.nullable(item), null],
    [v.nullish(item), null],
    [v.nullish(item), undefined],
    [v.optional(item), undefined],
    [v.undefinedable(item), undefined],
  ] as const;

  for (const [schema, value] of cases) {
    const codec = abi(schema);
    assert.isTrue(Object.is(codec.encode(value), value));
    assert.isTrue(Object.is(codec.decode(value), value));
  }
});

test("record rejects a missing tag or unmatched key/value pair", () => {
  const codec = abi(v.record(v.string(), item));
  assert.deepEqual(codec.encode({}), ["record"]);
  assert.deepEqual(codec.decode(["record"]), {});
  assert.throws(() => codec.decode(["other", "a", ["A"]]));
  assert.throws(() => codec.decode(["record", "a"]));
});
