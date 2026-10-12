# jsonabi

Encode schema-defined objects as positional arrays. When both sides know the schema, the JSON string does not need to repeat object keys. This can make data smaller for `localStorage`, `sessionStorage`, cookies, or other places that store strings.

For example, `JSON.stringify({ name: "Ada", score: 42 })` is 25 characters, while `JSON.stringify(["Ada", 42])` is 10. Savings depend on the schema and data; tagged unions and records can add overhead. The schema is required to recover the keys, so the encoded value is not self-describing.

## Quick start

For a JSON-compatible schema in a browser (run `pnpm build` first when using this repository):

```ts
import * as z from "zod";
import { abi } from "jsonabi/zod";

const userSchema = z.object({ score: z.number(), name: z.string() });
const codec = abi(userSchema);
const user = { name: "Ada", score: 42 };

const json = JSON.stringify(codec.encode(user)); // '["Ada",42]'
localStorage.setItem("user", json);

const saved = localStorage.getItem("user");
const restored = saved === null ? null : codec.decode(JSON.parse(saved));
// restored: { name: "Ada", score: 42 }

// The same string can be stored for the current session or in a cookie.
sessionStorage.setItem("user", json);
document.cookie = `user=${encodeURIComponent(json)}; Path=/; SameSite=Lax`;
```

Keys use lexical string order, regardless of their order in the schema definition. Valibot uses `jsonabi/valibot`; ArkType uses `jsonabi/arktype`. The Zod adapter also supports some Zod Mini schemas.

The `build` script generates the JavaScript and TypeScript declarations used by these package subpaths.

## Encoding

| Schema shape      | Encoded value                                                               |
| ----------------- | --------------------------------------------------------------------------- |
| Object            | Array of declared fields in lexical key order; nested objects are recursive |
| Array / tuple     | Array with recursively encoded elements                                     |
| String-key record | `["record", key1, value1, key2, value2, ...]`, sorted by key                |
| Union             | `[N, value]`, where `N` is the matching branch index                        |
| Leaf value        | Passed through unchanged, including `Date`                                  |

An absent optional object field becomes a **hole** in the array, distinct from a present field whose value is `undefined`. Defaults are not inserted into the encoded or decoded value.

The schema validates input before encoding and the reconstructed value after decoding. Validation results do not replace the original values. Zod uses `safeParse` for validation, so schema transforms may still run during a check.

## JSON round-trip limits

- The storage example uses required fields with JSON-compatible values. `JSON.stringify` turns array holes into `null` and `Date` objects into strings. A missing optional field or a `Date` therefore cannot be round-tripped with plain `JSON.stringify` / `JSON.parse` under the current encoding. Other non-JSON values need their own serialization strategy too.
- Keep the same schema version wherever a value is encoded and decoded. Changing field names or types can change the meaning of each position. Union branch indices must also agree.
- Cross-library compatibility is limited to matching schema shapes. Object, record, and optional-hole representations have interoperability tests; unions interoperate when branch order agrees. Zod and Valibot tag Map / Set values, while ArkType leaves them unchanged.
- Cookies need a cookie-safe encoding such as `encodeURIComponent` (and decoding when read). They have size limits; encoding and cookie attributes can offset the size saved by omitting keys.
- Unsupported schemas throw when calling `abi(schema)`. See the [Zod](./src/zod/zod.schema.test.ts), [Valibot](./src/valibot/valibot.schema.test.ts), and [ArkType](./src/arktype/arktype.schema.test.ts) tests for supported and unsupported cases.

## Development

```sh
pnpm build
pnpm test
pnpm check
pnpm lint
```

## License

MIT
