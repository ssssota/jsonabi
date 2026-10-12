import * as ark from "arktype";
import * as v from "valibot";
import * as z from "zod";
import { assert, test } from "vitest";
import { abi as arkAbi } from "./arktype/arktype.js";
import { abi as valibotAbi } from "./valibot/valibot.js";
import { abi as zodAbi } from "./zod/zod.js";

type Codec = {
  encode: (value: any) => any;
  decode: (value: any) => any;
};

type NamedCodec = { name: string; codec: Codec };

test("object encodings interoperate across nested objects, arrays, tuples, and Date", () => {
  const valibotItem = v.object({ z: v.number(), a: v.string() });
  const zodItem = z.object({ z: z.number(), a: z.string() });
  const arkItem = ark.type({ z: "number", a: "string" });

  const codecs: NamedCodec[] = [
    {
      name: "Valibot",
      codec: valibotAbi(
        v.object({
          row: v.tuple([v.string(), valibotItem]),
          items: v.array(valibotItem),
          createdAt: v.date(),
        }),
      ),
    },
    {
      name: "Zod",
      codec: zodAbi(
        z.object({
          row: z.tuple([z.string(), zodItem]),
          items: z.array(zodItem),
          createdAt: z.date(),
        }),
      ),
    },
    {
      name: "ArkType",
      codec: arkAbi(
        ark.type({
          row: ["string", arkItem],
          items: arkItem.array(),
          createdAt: "Date",
        }),
      ),
    },
  ];
  const createdAt = new Date("2026-09-27T00:00:00.000Z");
  const value = {
    row: ["head", { a: "tuple", z: 1 }] as [string, { a: string; z: number }],
    items: [{ a: "array", z: 2 }],
    createdAt,
  };
  const expected = [createdAt, [["array", 2]], ["head", ["tuple", 1]]];

  const encodings = assertInteroperable(codecs, value, expected);
  for (const { name, codec } of codecs) {
    for (const encoding of encodings) {
      assert.strictEqual(codec.decode(encoding).createdAt, createdAt, `${name} retains Date`);
    }
  }
});

test("string-key record encodings interoperate, including nested object values", () => {
  const valibotItem = v.object({ value: v.string() });
  const zodItem = z.object({ value: z.string() });
  const arkItem = ark.type({ value: "string" });
  const codecs: NamedCodec[] = [
    { name: "Valibot", codec: valibotAbi(v.record(v.string(), valibotItem)) },
    { name: "Zod", codec: zodAbi(z.record(z.string(), zodItem)) },
    { name: "ArkType", codec: arkAbi(ark.type({ "[string]": arkItem })) },
  ];
  const value = { z: { value: "last" }, a: { value: "first" } };
  const expected = ["record", "a", ["first"], "z", ["last"]];

  assertInteroperable(codecs, value, expected);
});

test("optional object fields use compatible sparse array slots", () => {
  const codecs: NamedCodec[] = [
    { name: "Valibot", codec: valibotAbi(v.object({ label: v.optional(v.string()) })) },
    { name: "Zod", codec: zodAbi(z.object({ label: z.optional(z.string()) })) },
    { name: "ArkType", codec: arkAbi(ark.type({ "label?": "string" })) },
  ];
  const value = {};
  const expected: any[] = [];
  expected.length = 1;

  const encodings = assertInteroperable(codecs, value, expected);
  for (const encoding of encodings) {
    assert.lengthOf(encoding, 1);
    assert.isFalse(Object.hasOwn(encoding, 0));
  }
});

test("number|string unions interoperate when branch order matches", () => {
  const codecs: NamedCodec[] = [
    { name: "Valibot", codec: valibotAbi(v.union([v.number(), v.string()])) },
    { name: "Zod", codec: zodAbi(z.union([z.number(), z.string()])) },
    { name: "ArkType", codec: arkAbi(ark.type("number | string")) },
  ];

  assertInteroperable(codecs, 42, [0, 42]);
  assertInteroperable(codecs, "hello", [1, "hello"]);
});

function assertInteroperable(codecs: NamedCodec[], value: any, expectedWire: any): any[] {
  const encodings = codecs.map(({ codec }) => codec.encode(value));
  for (const [index, encoding] of encodings.entries()) {
    assert.deepEqual(encoding, expectedWire, `${codecs[index].name} encoding`);
  }

  for (const { name, codec } of codecs) {
    for (const encoding of encodings) {
      assert.deepEqual(codec.decode(encoding), value, `${name} decodes shared wire format`);
    }
  }
  return encodings;
}
