import * as z from "zod";
import { assert, test } from "vitest";
import { abi } from "./zod.js";

test("object fields use a fixed lexical key order", () => {
  const codec = abi(z.object({ b: z.number(), a: z.string() }));
  assert.deepEqual(codec.encode({ b: 42, a: "hello" }), ["hello", 42]);
  assert.deepEqual(codec.decode(["hello", 42]), { a: "hello", b: 42 });
});

test("nested objects change shape inside arrays and tuples", () => {
  const schema = z.object({
    row: z.tuple([z.object({ z: z.number(), a: z.string() }), z.boolean()]),
    items: z.array(z.object({ z: z.number(), a: z.string() })),
  });
  const codec = abi(schema);
  const value: z.input<typeof schema> = {
    row: [{ z: 1, a: "first" }, true],
    items: [{ z: 2, a: "second" }],
  };
  const encoded = [[["second", 2]], [["first", 1], true]];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
});

test("Date stays the same instance", () => {
  const codec = abi(z.object({ createdAt: z.date() }));
  const createdAt = new Date("2026-09-27T00:00:00.000Z");
  const encoded = codec.encode({ createdAt });

  assert.deepEqual(encoded, [createdAt]);
  assert.strictEqual(encoded[0], createdAt);
  assert.strictEqual(codec.decode(encoded).createdAt, createdAt);
});

test("missing optional fields use holes, distinct from explicit undefined", () => {
  const codec = abi(z.object({ a: z.string(), b: z.number().optional() }));

  const absent = codec.encode({ a: "hello" });
  assert.lengthOf(absent, 2);
  assert.isFalse(Object.hasOwn(absent, 1));
  assert.deepEqual(codec.decode(absent), { a: "hello" });
  assert.isFalse(Object.hasOwn(codec.decode(absent), "b"));

  const present = codec.encode({ a: "hello", b: undefined });
  assert.isTrue(Object.hasOwn(present, 1));
  assert.isUndefined(present[1]);
  assert.deepEqual(codec.decode(present), { a: "hello", b: undefined });
});

test("exact optional fields reject explicit undefined", () => {
  const codec = abi(z.object({ a: z.string().exactOptional() }));
  const absent = codec.encode({});

  assert.lengthOf(absent, 1);
  assert.isFalse(Object.hasOwn(absent, 0));
  assert.deepEqual(codec.decode(absent), {});
  assert.throws(() => codec.encode({ a: undefined }));
  assert.throws(() => codec.decode([undefined]));
});

test("defaults and prefaults do not fill absent fields", () => {
  for (const field of [z.number().default(42), z.number().prefault(42)]) {
    const codec = abi(z.object({ a: field }));
    const encoded = codec.encode({});
    assert.lengthOf(encoded, 1);
    assert.isFalse(Object.hasOwn(encoded, 0));
    assert.deepEqual(codec.decode(encoded), {});
  }
});

test("unions and discriminated unions carry the option index", () => {
  const option = z.object({ kind: z.literal("text"), value: z.string() });
  const other = z.object({ kind: z.literal("date"), value: z.date() });
  const value = { kind: "text", value: "hello" } as const;
  const encoded = [0, ["text", "hello"]];

  for (const schema of [
    z.union([option, other]),
    z.xor([option, other]),
    z.discriminatedUnion("kind", [option, other]),
  ]) {
    const codec = abi(schema);
    assert.deepEqual(codec.encode(value), encoded);
    assert.deepEqual(codec.decode(encoded), value);
    assert.throws(() => codec.decode([2, encoded[1]]));
  }
});

test("records flatten sorted keys and recursively encode their values", () => {
  const codec = abi(z.record(z.string(), z.object({ value: z.string() })));
  const value = { z: { value: "Z" }, a: { value: "A" } };
  const encoded = ["record", "a", ["A"], "z", ["Z"]];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
  assert.deepEqual(codec.encode({}), ["record"]);
  assert.deepEqual(codec.decode(["record"]), {});
  assert.throws(() => codec.decode(["record", "a"]));
});

test("validation checks transformed schemas but retains their input values", () => {
  const codec = abi(z.object({ name: z.string().trim().min(2) }));

  assert.deepEqual(codec.encode({ name: "  Ada  " }), ["  Ada  "]);
  assert.deepEqual(codec.decode(["  Ada  "]), { name: "  Ada  " });
  assert.throws(() => codec.encode({ name: " x " }));
  assert.throws(() => codec.decode([" x "]));
});

test("coercion validates the input without replacing it with the parsed output", () => {
  const codec = abi(z.object({ count: z.coerce.number() }));

  assert.deepEqual(codec.encode({ count: "42" }), ["42"]);
  assert.deepEqual(codec.decode(["42"]), { count: "42" });
});
