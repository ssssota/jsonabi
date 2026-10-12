import { scope, type as arkType } from "arktype";
import type { Type as ArkType } from "arktype";
import { assert, test } from "vitest";
import { abi } from "./arktype.js";

// Representative ArkType domains and structural definitions, plus explicit unsupported
// cases. ArkType is an expression/type system rather than a fixed list of constructors.
const schemaNames = [
  "Blob",
  "Date",
  "File",
  "Function",
  "Map",
  "Set",
  "bigint",
  "boolean",
  "email",
  "objectIntersection",
  "integer",
  "literal",
  "morph",
  "narrow",
  "never",
  "null",
  "number",
  "object",
  "objectShape",
  "optionalObject",
  "record",
  "recursive",
  "string",
  "symbol",
  "symbolKeyObject",
  "tuple",
  "undefined",
  "unknown",
  "array",
] as const;

type SchemaName = (typeof schemaNames)[number];
type LeafCase = { name: SchemaName; schema: ArkType<any, any>; value: unknown };
type StructuralCase = {
  name: SchemaName;
  schema: ArkType<any, any>;
  value: unknown;
  encoded: unknown;
};
type UnsupportedCase = { name: SchemaName; schema: ArkType<any, any> };

const date = new Date("2026-09-27T00:00:00.000Z");
const blob = new Blob(["hello"]);
const file = new File(["hello"], "hello.txt");
const fn = () => 42;
const map = new Map([["a", 1]]);
const set = new Set([1, 2]);
const opaque = { nested: { value: 42 } };

const leafCases: LeafCase[] = [
  { name: "Blob", schema: arkType("Blob"), value: blob },
  { name: "Date", schema: arkType("Date"), value: date },
  { name: "File", schema: arkType("File"), value: file },
  { name: "Function", schema: arkType("Function"), value: fn },
  { name: "Map", schema: arkType("Map"), value: map },
  { name: "Set", schema: arkType("Set"), value: set },
  { name: "bigint", schema: arkType("bigint"), value: 42n },
  { name: "boolean", schema: arkType("boolean"), value: true },
  { name: "email", schema: arkType("string.email"), value: "ada@example.com" },
  { name: "integer", schema: arkType("number.integer"), value: 42 },
  { name: "literal", schema: arkType("'hello'"), value: "hello" },
  {
    name: "morph",
    schema: arkType("string").pipe((value) => value.trim()),
    value: "  Ada  ",
  },
  { name: "null", schema: arkType("null"), value: null },
  { name: "number", schema: arkType("number"), value: 42 },
  { name: "object", schema: arkType("object"), value: opaque },
  { name: "string", schema: arkType("string"), value: "hello" },
  { name: "symbol", schema: arkType("symbol"), value: Symbol("value") },
  { name: "undefined", schema: arkType("undefined"), value: undefined },
  { name: "unknown", schema: arkType("unknown"), value: opaque },
];

const item = arkType({ value: "string" });
const itemValue = { value: "A" };
const itemWire = ["A"];
const recursiveTypes = scope({
  Node: { value: "string", "next?": "Node" },
}).export();
const symbolKey = Symbol("secret");

const structuralCases: StructuralCase[] = [
  { name: "array", schema: item.array(), value: [itemValue], encoded: [itemWire] },
  {
    name: "narrow",
    schema: item.narrow(({ value }) => value.length > 0),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "objectShape",
    schema: arkType({ z: "number", a: "string" }),
    value: { z: 42, a: "hello" },
    encoded: ["hello", 42],
  },
  {
    name: "objectIntersection",
    schema: item.and({ count: "number" }),
    value: { value: "A", count: 2 },
    encoded: [2, "A"],
  },
  {
    name: "optionalObject",
    schema: arkType({ "value?": "string" }),
    value: itemValue,
    encoded: itemWire,
  },
  {
    name: "record",
    schema: arkType({ "[string]": item }),
    value: { z: itemValue, a: { value: "B" } },
    encoded: ["record", "a", ["B"], "z", itemWire],
  },
  {
    name: "tuple",
    schema: arkType(["string", item]),
    value: ["head", itemValue],
    encoded: ["head", itemWire],
  },
];

const unsupportedCases: UnsupportedCase[] = [
  { name: "never", schema: arkType("never") },
  { name: "recursive", schema: recursiveTypes.Node },
  { name: "symbolKeyObject", schema: arkType({ [symbolKey]: "string" }) },
];

test("each selected ArkType definition has one explicit ABI decision", () => {
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

test.each(structuralCases)("$name recursively encodes its value", ({ schema, value, encoded }) => {
  const codec = abi(schema);
  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
});

test.each(unsupportedCases)("$name fails explicitly", ({ schema }) => {
  assert.throws(() => abi(schema), /Unsupported schema type/);
});
