import * as z from "zod/mini";
import { assert, test } from "vitest";
import { abi } from "./zod.js";

test("Zod Mini object schemas encode nested objects and retain checked inputs", () => {
  const schema = z.object({
    name: z.string().check(z.trim(), z.minLength(2)),
    items: z.array(z.object({ b: z.number(), a: z.string() })),
  });
  const codec = abi(schema);
  const value: z.input<typeof schema> = {
    name: "  Ada  ",
    items: [{ a: "first", b: 42 }],
  };
  const encoded = [[["first", 42]], "  Ada  "];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
  assert.throws(() => codec.encode({ name: " x ", items: [] }));
});

test("Zod Mini optional fields use an array hole when absent", () => {
  const schema = z.object({ a: z.string(), b: z.optional(z.number()) });
  const codec = abi(schema);
  const value: z.input<typeof schema> = { a: "hello" };
  const encoded = codec.encode(value);

  assert.lengthOf(encoded, 2);
  assert.isFalse(Object.hasOwn(encoded, 1));
  assert.deepEqual(codec.decode(encoded), value);
});

test("Zod Mini discriminated unions carry the option index", () => {
  const schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), value: z.string() }),
    z.object({ kind: z.literal("count"), value: z.number() }),
  ]);
  const codec = abi(schema);
  const value: z.input<typeof schema> = { kind: "text", value: "hello" };
  const encoded = [0, ["text", "hello"]];

  assert.deepEqual(codec.encode(value), encoded);
  assert.deepEqual(codec.decode(encoded), value);
  assert.throws(() => codec.decode([2, encoded[1]]));
});
