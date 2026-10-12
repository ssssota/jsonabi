import * as v from "valibot";
import { test, assert } from "vitest";
import { abi } from "./valibot.js";

test("simple object encoding/decoding", () => {
  const schema = abi(v.object({ b: v.number(), a: v.string() }));
  assert.deepEqual(schema.encode({ a: "hello", b: 42 }), ["hello", 42]);
  assert.deepEqual(schema.decode(["hello", 42]), { a: "hello", b: 42 });
});

test("only objects change shape inside arrays and tuples", () => {
  const schema = abi(
    v.object({
      row: v.tuple([v.object({ z: v.number(), a: v.string() }), v.boolean()]),
      items: v.array(v.object({ z: v.number(), a: v.string() })),
    }),
  );
  const value: Parameters<typeof schema.encode>[0] = {
    row: [{ a: "first", z: 1 }, true],
    items: [{ a: "second", z: 2 }],
  };
  const encoded = [[["second", 2]], [["first", 1], true]];

  assert.deepEqual(schema.encode(value), encoded);
  assert.deepEqual(schema.decode(encoded), value);
});

test("Date values pass through unchanged", () => {
  const schema = abi(v.object({ createdAt: v.date() }));
  const createdAt = new Date("2026-09-27T00:00:00.000Z");

  const encoded = schema.encode({ createdAt });
  assert.deepEqual(encoded, [createdAt]);
  assert.strictEqual(encoded[0], createdAt);
  assert.deepEqual(schema.decode(encoded), { createdAt });
  assert.strictEqual(schema.decode(encoded).createdAt, createdAt);
});

test("an absent optional key is an empty slot, distinct from undefined", () => {
  const schema = abi(v.object({ a: v.string(), b: v.optional(v.number()) }));

  const absent = schema.encode({ a: "hello" });
  assert.lengthOf(absent, 2);
  assert.isFalse(Object.hasOwn(absent, 1));
  assert.deepEqual(schema.decode(absent), { a: "hello" });
  assert.isFalse(Object.hasOwn(schema.decode(absent), "b"));

  const undefinedValue = schema.encode({ a: "hello", b: undefined });
  assert.lengthOf(undefinedValue, 2);
  assert.isTrue(Object.hasOwn(undefinedValue, 1));
  assert.isUndefined(undefinedValue[1]);
  assert.deepEqual(schema.decode(undefinedValue), { a: "hello", b: undefined });
  assert.isTrue(Object.hasOwn(schema.decode(undefinedValue), "b"));
});

test("optional defaults do not fill absent keys", () => {
  const schema = abi(v.object({ a: v.optional(v.number(), 42) }));

  const encoded = schema.encode({});
  assert.lengthOf(encoded, 1);
  assert.isFalse(Object.hasOwn(encoded, 0));
  assert.isEmpty(Object.keys(schema.decode(encoded)));
});

test("union values carry their option index", () => {
  const schema = abi(v.union([v.object({ name: v.string() }), v.date()]));
  const date = new Date("2026-09-27T00:00:00.000Z");

  assert.deepEqual(schema.encode({ name: "hello" }), [0, ["hello"]]);
  assert.deepEqual(schema.decode([0, ["hello"]]), { name: "hello" });
  assert.deepEqual(schema.encode(date), [1, date]);
  assert.strictEqual(schema.decode([1, date]), date);
  assert.throws(() => schema.decode([2, date]));
});

test("variant values carry their option index", () => {
  const schema = abi(
    v.variant("type", [
      v.object({ type: v.literal("text"), value: v.string() }),
      v.object({ type: v.literal("date"), value: v.date() }),
    ]),
  );
  const date = new Date("2026-09-27T00:00:00.000Z");

  assert.deepEqual(schema.encode({ type: "text", value: "hello" }), [0, ["text", "hello"]]);
  assert.deepEqual(schema.decode([0, ["text", "hello"]]), {
    type: "text",
    value: "hello",
  });
  assert.deepEqual(schema.encode({ type: "date", value: date }), [1, ["date", date]]);
  assert.deepEqual(schema.decode([1, ["date", date]]), {
    type: "date",
    value: date,
  });
});

test("validation does not replace values with transformed output", () => {
  const schema = abi(v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(2)) }));

  assert.deepEqual(schema.encode({ name: "  Ada  " }), ["  Ada  "]);
  assert.deepEqual(schema.decode(["  Ada  "]), { name: "  Ada  " });
  assert.throws(() => schema.encode({ name: " x " }));
  assert.throws(() => schema.decode([" x "]));
});
