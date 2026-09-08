export {};

declare global {
  // Type-level description of the Cloudflare Workers bindings this project actually has
  // (see .openai/hosting.json: `"d1": "DB"`, `"r2": "UPLOADS"`).
  //
  // Normally you would NOT hand-write this. Cloudflare's `wrangler types` command reads your
  // `wrangler.toml`/`wrangler.jsonc` bindings and generates this exact declaration
  // automatically (merging into the ambient `Cloudflare.Env` interface that
  // `@cloudflare/workers-types` ships as empty on purpose — see its `index.d.ts`).
  //
  // This project has no `wrangler.toml` (the Worker config is generated at build/deploy time
  // from `.openai/hosting.json`), so `wrangler types` has nothing to read from and can't run
  // here. This is the manual stand-in for that generated output. If the project ever gains a
  // real `wrangler.toml`, replace this block with a `wrangler types` run and delete it — don't
  // just delete it outright, it is load-bearing for `env.DB` / `env.UPLOADS` typing in
  // db/index.ts and every app/api/**/route.ts that calls getD1()/getDb()/getAssetsBucket().
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      UPLOADS: R2Bucket;
    }
  }

  // Patch for a types-only gap in @cloudflare/workers-types 4.x (we're pinned to
  // 4.20260515.1 to match compatibility_date "2026-05-15" — see package.json).
  //
  // That version's ambient `FormData` declares:
  //   get(name: string): string | null;
  //   getAll(name: string): string[];
  // i.e. it never mentions `File`, even though a FormData built from a multipart upload can
  // (and in this app's file-upload routes, does) return File entries. The Workers RUNTIME has
  // always supported File-valued form fields — this is purely a hole in this one dated types
  // snapshot, not a runtime limitation. Confirmed by diffing across the whole 4.x line
  // (4.20260510.1 through the last release, 4.20260702.1): all of it is missing `File` here.
  //
  // The fix landed with the 5.x major version (first release 5.20260703.1 already has
  // `get(name: string): (File | string) | null`), which we're intentionally NOT adopting yet —
  // a major bump is a bigger, less certain change than the false type errors this patch fixes
  // justify, and it would also lose the exact compatibility_date match. Without this patch,
  // every route that does `form.get(...) instanceof File` fails to compile (TS2358: a
  // `string | null` can't be the left-hand side of `instanceof`), even though the code is
  // correct at runtime.
  //
  // Must be inside `declare global` (not a bare top-level `interface FormData` in this file)
  // to reliably win the declaration merge once other ambient FormData declarations are also in
  // the program (e.g. via @types/node, pulled in transitively by `next/headers` imports) — a
  // bare non-module ambient override was tried first and silently lost that merge.
  //
  // DELETE THIS BLOCK the day the project upgrades to @cloudflare/workers-types 5.x — at that
  // point the package's own types already say `File | string | null` and this override becomes
  // a harmless but pointless duplicate.
  interface FormData {
    get(name: string): File | string | null;
    getAll(name: string): (File | string)[];
  }
}
