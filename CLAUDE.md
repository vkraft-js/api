# @vkraft/api

Thin VK API wrapper for TypeScript/JavaScript.

## Commands

- `bun test` — run tests
- `bun prepublishOnly` — build (runs pkgroll, produces `dist/` with CJS + ESM)
- `bun scripts/prepare-jsr.ts` — prepare for JSR publishing (syncs version from package.json)
- `bunx tsc --noEmit` — type-check
- `bunx publint` — validate package exports

## Architecture

- **Two-level proxy**: `vk.api.{category}.{method}(params)` → POST to `https://api.vk.com/method/{category}.{method}`
- **Middleware chain**: Composable `(context, next)` pattern, executed in array order
- **Auth**: `access_token` and `v` injected into JSON body (or URL query string for FormData)
- **Error handling**: `VKAPIError` with `suppress: true` option to return instead of throw
- **File upload**: `src/file.ts` with low-level `upload()` helper and `MediaUpload` factory
- **Upload class**: `src/upload.ts` — high-level `Upload` class automating the 3-step VK upload flow (13 methods)

## Types dependency

`@vkraft/types` at `../types/` — code-generated VK API types (methods, params, responses, objects, errors).

## Reference

Based on [wrappergram](https://github.com/gramiojs/wrappergram) from the GramIO ecosystem.
