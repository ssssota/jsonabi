import * as z from "zod";
import { assert, test } from "vitest";
import { abi } from "./zod.js";

// Schema constructors and shape-affecting modifiers from https://zod.dev/api (Zod 4).
// String/number format checks share the representation of their primitive schema;
// representative formats are listed here rather than every individual format.
const schemaNames = [
  "any",
  "array",
  "bigint",
  "boolean",
  "brand",
  "catch",
  "catchall",
  "codec",
  "coerce",
  "custom",
  "date",
  "default",
  "discriminatedUnion",
  "email",
  "enum",
  "exactOptional",
  "file",
  "function",
  "instanceof",
  "int",
  "int32",
  "intersection",
  "json",
  "lazy",
  "literal",
  "looseObject",
  "looseRecord",
  "map",
  "nan",
  "never",
  "nonoptional",
  "null",
  "nullable",
  "nullish",
  "number",
  "object",
  "object.extend",
  "object.omit",
  "object.partial",
  "object.pick",
  "object.required",
  "object.safeExtend",
  "optional",
  "partialRecord",
  "partialRecord.symbolKeys",
  "pipe",
  "prefault",
  "preprocess",
  "promise",
  "readonly",
  "record",
  "record.enumKeys",
  "record.numberKeys",
  "record.symbolKeys",
  "recursiveObject",
  "refine",
  "set",
  "strictObject",
  "string",
  "stringFormat",
  "stringbool",
  "symbol",
  "templateLiteral",
  "transform",
  "transformOnly",
  "tuple",
  "tuple.rest",
  "undefined",
  "union",
  "unknown",
  "void",
  "xor",
] as const;

type SchemaName = (typeof schemaNames)[number];
type LeafCase = { name: SchemaName; schema: z.ZodType; value: unknown };
type StructuralCase = {
  name: SchemaName;
  schema: z.ZodType;
  value: unknown;
  encoded: unknown;
};
type UnsupportedCase = { name: SchemaName; schema: z.ZodType };

const date = new Date("2026-09-27T00:00:00.000Z");
const file = new File(["hello"], "hello.txt");
const fn = (_value: string) => 42;
const symbol = Symbol("value");
const opaque = { nested: { value: 42 } };

const leafCases: LeafCase[] = [
  { name: "any", schema: z.any(), value: opaque },
  { name: "bigint", schema: z.bigint(), value: 42n },
  { name: "boolean", schema: z.boolean(), value: true },
  { name: "coerce", schema: z.coerce.number(), value: "42" },
  { name: "custom", schema: z.custom<Date>((value) => value instanceof Date), value: date },
  { name: "date", schema: z.date(), value: date },
  { name: "email", schema: z.email(), value: "ada@example.com" },
  { name: "enum", schema: z.enum(["a", "b"]), value: "a" },
  { name: "file", schema: z.file(), value: file },
  { name: "function", schema: z.function({ input: [z.string()], output: z.number() }), value: fn },
  { name: "instanceof", schema: z.instanceof(URL), value: new URL("https://example.com") },
  { name: "int", schema: z.int(), value: 42 },
  { name: "int32", schema: z.int32(), value: 42 },
  { name: "literal", schema: z.literal("hello"), value: "hello" },
  { name: "nan", schema: z.nan(), value: Number.NaN },
  { name: "null", schema: z.null(), value: null },
  { name: "number", schema: z.number(), value: 42 },
  { name: "string", schema: z.string(), value: "hello" },
  { name: "stringFormat", schema: z.stringFormat("cool-id", /^cool-/), value: "cool-42" },
  { name: "stringbool", schema: z.stringbool(), value: "yes" },
  { name: "symbol", schema: z.symbol(), value: symbol },
  { name: "templateLiteral", schema: z.templateLiteral(["id-", z.number()]), value: "id-42" },
  { name: "undefined", schema: z.undefined(), value: undefined },
  { name: "unknown", schema: z.unknown(), value: opaque },
  { name: "void", schema: z.void(), value: undefined },
];

const item = z.object({ value: z.string() });
const itemValue = { value: "A" };
const itemWire = ["A"];
const taggedText = z.object({ kind: z.literal("text"), value: z.string() });
const taggedDate = z.object({ kind: z.literal("date"), value: z.date() });
const recursiveObject = z.object({
  value: z.string(),
  get child(): z.ZodOptional<z.ZodType> {
    return recursiveObject.optional();
  },
});
const structuralCases: StructuralCase[] = [
  { name: "array", schema: z.array(item), value: [itemValue], encoded: [itemWire] },
  { name: "brand", schema: item.brand<"Item">(), value: itemValue, encoded: itemWire },
  { name: "default", schema: item.default(itemValue), value: itemValue, encoded: itemWire },
  {
    name: "discriminatedUnion",
    schema: z.discriminatedUnion("kind", [taggedText, taggedDate]),
    value: { kind: "text", value: "A" },
    encoded: [0, ["text", "A"]],
  },
  { name: "exactOptional", schema: item.exactOptional(), value: itemValue, encoded: itemWire },
  {
    name: "map",
    schema: z.map(z.string(), item),
    value: new Map([
      ["z", { value: "Z" }],
      ["a", itemValue],
    ]),
    encoded: ["map", "z", ["Z"], "a", itemWire],
  },
  {
    name: "nonoptional",
    schema: item.optional().nonoptional(),
    value: itemValue,
    encoded: itemWire,
  },
  { name: "nullable", schema: item.nullable(), value: itemValue, encoded: itemWire },
  { name: "nullish", schema: item.nullish(), value: itemValue, encoded: itemWire },
  { name: "object", schema: item, value: itemValue, encoded: itemWire },
  {
    name: "object.extend",
    schema: item.extend({ extra: z.number() }),
    value: { value: "A", extra: 42 },
    encoded: [42, "A"],
  },
  {
    name: "object.omit",
    schema: item.extend({ extra: z.number() }).omit({ extra: true }),
    value: itemValue,
    encoded: itemWire,
  },
  { name: "object.partial", schema: item.partial(), value: itemValue, encoded: itemWire },
  { name: "object.pick", schema: item.pick({ value: true }), value: itemValue, encoded: itemWire },
  {
    name: "object.required",
    schema: item.partial().required(),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "object.safeExtend",
    schema: item.safeExtend({ extra: z.number() }),
    value: { value: "A", extra: 42 },
    encoded: [42, "A"],
  },
  { name: "optional", schema: item.optional(), value: itemValue, encoded: itemWire },
  {
    name: "partialRecord",
    schema: z.partialRecord(z.enum(["a", "z"]), item),
    value: { z: { value: "Z" }, a: itemValue },
    encoded: ["record", "a", itemWire, "z", ["Z"]],
  },
  { name: "pipe", schema: item.pipe(item), value: itemValue, encoded: itemWire },
  { name: "prefault", schema: item.prefault(itemValue), value: itemValue, encoded: itemWire },
  { name: "readonly", schema: item.readonly(), value: itemValue, encoded: itemWire },
  {
    name: "record",
    schema: z.record(z.string(), item),
    value: { z: { value: "Z" }, a: itemValue },
    encoded: ["record", "a", itemWire, "z", ["Z"]],
  },
  {
    name: "record.enumKeys",
    schema: z.record(z.enum(["a", "z"]), item),
    value: { z: { value: "Z" }, a: itemValue },
    encoded: ["record", "a", itemWire, "z", ["Z"]],
  },
  {
    name: "refine",
    schema: item.refine(({ value }) => value.length > 0),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "set",
    schema: z.set(item),
    value: new Set([{ value: "Z" }, itemValue]),
    encoded: ["set", ["Z"], itemWire],
  },
  {
    name: "strictObject",
    schema: z.strictObject({ value: z.string() }),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "transform",
    schema: item.transform(({ value }) => value),
    value: itemValue,
    encoded: itemWire,
  },
  { name: "tuple", schema: z.tuple([item]), value: [itemValue], encoded: [itemWire] },
  {
    name: "tuple.rest",
    schema: z.tuple([z.string()], item),
    value: ["head", itemValue, { value: "B" }],
    encoded: ["head", itemWire, ["B"]],
  },
  { name: "union", schema: z.union([item, z.number()]), value: itemValue, encoded: [0, itemWire] },
  { name: "xor", schema: z.xor([item, z.number()]), value: itemValue, encoded: [0, itemWire] },
];

const unsupportedCases: UnsupportedCase[] = [
  { name: "catch", schema: item.catch(itemValue) },
  { name: "catchall", schema: z.object({ value: z.string() }).catchall(z.number()) },
  {
    name: "codec",
    schema: z.codec(z.string(), z.number(), { decode: Number, encode: String }),
  },
  { name: "intersection", schema: z.intersection(item, z.object({ extra: z.number() })) },
  { name: "json", schema: z.json() },
  { name: "lazy", schema: z.lazy(() => item) },
  { name: "looseObject", schema: z.looseObject({ value: z.string() }) },
  { name: "looseRecord", schema: z.looseRecord(z.string(), item) },
  { name: "never", schema: z.never() },
  { name: "partialRecord.symbolKeys", schema: z.partialRecord(z.symbol(), item) },
  { name: "preprocess", schema: z.preprocess((value) => value, item) },
  { name: "promise", schema: z.promise(z.string()) },
  { name: "record.numberKeys", schema: z.record(z.number(), item) },
  { name: "record.symbolKeys", schema: z.record(z.symbol(), item) },
  { name: "recursiveObject", schema: recursiveObject },
  { name: "transformOnly", schema: z.transform((value) => value) },
];

test("each selected Zod API schema has one explicit ABI decision", () => {
  const coveredNames = [...leafCases, ...structuralCases, ...unsupportedCases]
    .map(({ name }) => name)
    .sort();
  assert.deepEqual(coveredNames, [...schemaNames].sort());
});

test.each(leafCases)("$name passes its input through by identity", ({ schema, value }) => {
  const codec = abi(schema);
  const encoded = codec.encode(value);
  assert.isTrue(Object.is(encoded, value));
  assert.isTrue(Object.is(codec.decode(encoded), value));
});

test.each(structuralCases)("$name recursively encodes its input", ({ schema, value, encoded }) => {
  const codec = abi(schema);
  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
});

test.each(unsupportedCases)("$name fails explicitly", ({ schema }) => {
  assert.throws(() => abi(schema), /Unsupported schema type/);
});

test("nullable and optional wrappers preserve nullish values", () => {
  const cases = [
    [item.nullable(), null],
    [item.nullish(), null],
    [item.nullish(), undefined],
    [item.optional(), undefined],
  ] as const;

  for (const [schema, value] of cases) {
    const codec = abi(schema);
    assert.isTrue(Object.is(codec.encode(value), value));
    assert.isTrue(Object.is(codec.decode(value), value));
  }
});

test("record rejects a missing tag or unmatched key/value pair", () => {
  const codec = abi(z.record(z.string(), item));
  assert.deepEqual(codec.encode({}), ["record"]);
  assert.deepEqual(codec.decode(["record"]), {});
  assert.throws(() => codec.decode(["other", "a", ["A"]]));
  assert.throws(() => codec.decode(["record", "a"]));
});
