# @vkraft/api

<div align="center">

[![VK API](https://img.shields.io/badge/VK%20API-5.199-blue?style=flat&labelColor=000&color=3b82f6)](https://dev.vk.com/reference)
[![npm](https://img.shields.io/npm/v/@vkraft/api?logo=npm&style=flat&labelColor=000&color=3b82f6)](https://www.npmjs.org/package/@vkraft/api)
[![JSR](https://jsr.io/badges/@vkraft/api)](https://jsr.io/@vkraft/api)

</div>

Simple and tiny code-generated **VK API** wrapper for TypeScript/JavaScript with [file upload](#file-upload) support.

- **Multi-runtime** — Works on [Node.js](https://nodejs.org/), [Bun](https://bun.sh/) and [Deno](https://deno.com/)
- **Code-generated** — [Code-generated and auto-published VK API types](https://github.com/vkraft/types) via `@vkraft/types`
- **Type-safe** — Written in TypeScript with full type safety
- **Tiny** — Without middlewares it's just `fetch` + `URLSearchParams` — zero overhead

### Installation

```bash
# npm / pnpm / yarn
npm install @vkraft/api

# Bun
bun add @vkraft/api

# Deno
deno add jsr:@vkraft/api
```

### Usage

```ts
import { VK } from "@vkraft/api";

const vk = new VK(process.env.VK_TOKEN as string);

const users = await vk.api.users.get({
    user_ids: [1],
});

console.log(users); // [{ id: 1, first_name: "Pavel", last_name: "Durov" }]
```

### Call API

You can send requests to VK API methods via `vk.api` with full type-safety — two-level proxy maps `vk.api.{category}.{method}(params)` to the VK API method.

```ts
const users = await vk.api.users.get({
    user_ids: [1, 2, 3],
});

await vk.api.wall.post({
    message: "Hello, world!",
});

const friends = await vk.api.friends.get({
    user_id: 1,
    count: 5,
});
```

### Error handling

By default, API errors throw a `VKAPIError`. Use `suppress: true` to return it instead:

```ts
import { VK, VKAPIError } from "@vkraft/api";

const vk = new VK("ACCESS_TOKEN");

// Throws VKAPIError on failure
try {
    await vk.api.wall.post({ message: "Hello!" });
} catch (err) {
    if (err instanceof VKAPIError) {
        console.error(err.code, err.message, err.requestParams);
    }
}

// Returns VKAPIError instead of throwing
const result = await vk.api.wall.post({
    suppress: true,
    message: "Hello!",
});

if (result instanceof VKAPIError) {
    console.error("Failed:", result.message);
} else {
    console.log("Post ID:", result.post_id);
}
```

### Per-request options

Pass fetch options as the second argument:

```ts
await vk.api.users.get(
    { user_ids: [1] },
    { signal: AbortSignal.timeout(5000) },
);
```

### Middleware

Middlewares wrap every API call — mutate params, handle responses, or catch errors:

```ts
import { VK } from "@vkraft/api";
import type { Middleware } from "@vkraft/api";

const logger: Middleware = async (context, next) => {
    console.log(`-> ${context.method}`, context.params);
    const result = await next();
    console.log(`<- ${context.method}`);
    return result;
};

const vk = new VK("ACCESS_TOKEN", {
    middlewares: [logger],
});
```

### Long Polling

`LongPoll` is a low-level async iterable transport for the [Bots Long Poll API](https://dev.vk.com/en/api/bots-long-poll/getting-started). It handles reconnection automatically and yields events one by one with built-in backpressure — the next batch of events won't be fetched until the current one is fully processed.

```ts
import { VK } from "@vkraft/api";
import { LongPoll } from "@vkraft/api/updates";

const vk = new VK(process.env.VK_TOKEN as string);
const polling = new LongPoll(vk, { group_id: 123456 });

for await (const event of polling) {
    if (event.type === "message_new") {
        await vk.api.messages.send({
            peer_id: (event.object as { message: { peer_id: number } }).message.peer_id,
            message: "pong",
            random_id: 0,
        });
    }
}
```

Call `polling.stop()` to gracefully break out of the loop after the current event.

| Option | Default | Description |
|---|---|---|
| `group_id` | — | Community ID (required) |
| `wait` | `25` | Long poll server timeout in seconds |

<details>
<summary>Concurrent event processing</summary>

By default, `for await` creates natural backpressure — `yield` pauses the generator until the consumer finishes processing the current event, so the next `fetch` won't happen until the entire batch is handled sequentially.

To process events concurrently, don't `await` inside the loop:

```ts
for await (const event of polling) {
    // fire-and-forget — yield unblocks immediately
    handleEvent(event).catch(console.error);
}
```

For bounded concurrency:

```ts
const pool = new Set<Promise<void>>();
const MAX = 10;

for await (const event of polling) {
    const task = handleEvent(event)
        .catch(console.error)
        .finally(() => pool.delete(task));
    pool.add(task);

    if (pool.size >= MAX) await Promise.race(pool);
}
```

</details>

### Upload

The `Upload` class automates the VK 3-step upload flow (get server → upload file → save):

```ts
import { VK } from "@vkraft/api";
import { Upload, MediaUpload } from "@vkraft/api/upload";

const vk = new VK("ACCESS_TOKEN");
const up = new Upload(vk);

// Photo from file path
const photos = await up.messagePhoto(
    MediaUpload.path("./photo.jpg"),
    { peer_id: 123 },
);

// Photo from URL
const wallPhotos = await up.wallPhoto(
    MediaUpload.url("https://example.com/pic.png"),
    { group_id: 12345, caption: "Nice photo" },
);

// Document from buffer
const doc = await up.document(
    MediaUpload.buffer(data, "report.pdf"),
    { title: "Q4 Report" },
);
```

Available methods: `messagePhoto`, `wallPhoto`, `albumPhoto`, `ownerPhoto`, `ownerCoverPhoto`, `chatPhoto`, `marketAlbumPhoto`, `document`, `messageDocument`, `wallDocument`, `marketProductPhoto`, `storiesPhoto`, `storiesVideo`.

<details>
<summary>Low-level 3-step upload</summary>

For custom upload flows, use the low-level `upload` helper and `MediaUpload` factory directly:

```ts
import { VK } from "@vkraft/api";
import { upload, MediaUpload } from "@vkraft/api/file";

const vk = new VK("ACCESS_TOKEN");

// Step 1: Get upload URL
const server = await vk.api.photos.getMessagesUploadServer({
    peer_id: 123,
});

// Step 2: Upload file
const file = await MediaUpload.path("./photo.jpg");
const uploaded = await upload(server.upload_url, "photo", file);

// Step 3: Save
const saved = await vk.api.photos.saveMessagesPhoto({
    photo: uploaded.photo as string,
    server: uploaded.server as number,
    hash: uploaded.hash as string,
});
```

</details>

### Retry on rate limit

Use `withRetries` to automatically retry on VK error code 6 (Too many requests per second):

```ts
import { VK } from "@vkraft/api";
import { withRetries } from "@vkraft/api/utils";

const vk = new VK("ACCESS_TOKEN");

const result = await withRetries(
    () => vk.api.users.get({ user_ids: [1] }),
    { delay: 350, maxRetries: 3 },
);
```

---

Architectural reference: [wrappergram](https://github.com/gramiojs/wrappergram) from the [GramIO](https://gramio.dev/) ecosystem.
