import { type as arkType } from "arktype";
import { assert, test } from "vitest";
import { abi } from "./arktype.js";

test("object fields use a fixed lexical key order", () => {
  const schema = arkType({ b: "number", a: "string" });
  const codec = abi(schema);

  assert.deepEqual(codec.encode({ a: "hello", b: 42 }), ["hello", 42]);
  assert.deepEqual(codec.decode(["hello", 42]), { a: "hello", b: 42 });
});

test("nested objects change shape inside arrays and tuples", () => {
  const item = arkType({ z: "number", a: "string" });
  const schema = arkType({
    row: ["string", item],
    items: item.array(),
  });
  const codec = abi(schema);
  const value: typeof schema.inferIn = {
    row: ["head", { a: "first", z: 1 }],
    items: [{ a: "second", z: 2 }],
  };
  const encoded = [[["second", 2]], ["head", ["first", 1]]];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
});

test("Date values pass through unchanged", () => {
  const schema = arkType({ createdAt: "Date" });
  const codec = abi(schema);
  const createdAt = new Date("2026-09-27T00:00:00.000Z");
  const encoded = codec.encode({ createdAt });

  assert.deepEqual(encoded, [createdAt]);
  assert.strictEqual(encoded[0], createdAt);
  assert.strictEqual(codec.decode(encoded).createdAt, createdAt);
});

test("optional and defaultable fields use holes without materializing defaults", () => {
  const schema = arkType({
    a: "string",
    "b?": "number",
    count: "number = 42",
  });
  const codec = abi(schema);
  const value: typeof schema.inferIn = { a: "hello", b: 42 };
  const encoded = codec.encode(value);

  assert.lengthOf(encoded, 3);
  assert.deepEqual(encoded.slice(0, 2), ["hello", 42]);
  assert.isFalse(Object.hasOwn(encoded, 2));
  assert.deepEqual(codec.decode(encoded), value);
  assert.throws(() => codec.encode({ a: "hello", b: undefined }));
});

test("unions carry the canonical branch index", () => {
  const count = arkType({ kind: "'count'", value: "number" });
  const text = arkType({ kind: "'text'", value: "string" });
  const schema = count.or(text);
  const codec = abi(schema);
  const value: typeof schema.inferIn = { kind: "text", value: "hello" };
  const encoded = [1, ["text", "hello"]];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
  assert.throws(() => codec.decode([2, encoded[1]]));
});

test("record index signatures flatten sorted keys and values", () => {
  const schema = arkType({ "[string]": "number" });
  const codec = abi(schema);
  const value: typeof schema.inferIn = { z: 2, a: 1 };
  const encoded = ["record", "a", 1, "z", 2];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
  assert.deepEqual(codec.encode({}), ["record"]);
  assert.deepEqual(codec.decode(["record"]), {});
  assert.throws(() => codec.decode(["record", "a"]));
});

test("morph validation keeps the original value and does not execute morphs", () => {
  let morphCalls = 0;
  const schema = arkType("string").pipe((value) => {
    morphCalls++;
    return value.trim();
  });
  const codec = abi(schema);
  const value = "  Ada  ";

  assert.strictEqual(codec.encode(value), value);
  assert.strictEqual(codec.decode(value), value);
  assert.equal(morphCalls, 0);
  assert.throws(() => (codec.encode as (value: unknown) => unknown)(42));
  assert.equal(morphCalls, 0);
});
