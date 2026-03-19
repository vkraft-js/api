/**
 * Compile-time type tests checked by `tsc --noEmit`.
 * These catch regressions like api methods resolving to `Function` or `any`.
 * No runtime assertions — if this file compiles, the types are correct.
 */
import { describe, it } from "bun:test";
import { VK, VKAPIError } from "../src/index.ts";
import type { SuppressedAPIMethods } from "../src/types.ts";
import type {
	UsersGetResponse,
	UsersGetParams,
	BaseOkResponse,
	WallPostResponse,
	PhotosSaveMessagesPhotoResponse,
} from "@vkraft/types";

/** Fails to compile if A is not exactly B */
type IsExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** Compile error if T is not true */
type Assert<T extends true> = T;

const vk = new VK("tok");

// ============================
// api is SuppressedAPIMethods, not Record<string, Record<string, Function>>
// ============================
describe("api typed as SuppressedAPIMethods", () => {
	it("api assignable to SuppressedAPIMethods", () => {
		const _api: SuppressedAPIMethods = vk.api;
		void _api;
	});

	it("api.users is an object with typed methods, not Record<string, Function>", () => {
		// If api were Record<string, Record<string, Function>>,
		// users.get would be Function and this assignment would fail
		const _get: (params?: UsersGetParams) => Promise<UsersGetResponse> = vk.api.users.get;
		void _get;
	});
});

// ============================
// Return types are correct, not any/unknown
// ============================
describe("return types are precise", () => {
	it("users.get returns UsersGetResponse", async () => {
		const result = await vk.api.users.get({ user_ids: [1] });
		// result should be UsersGetResponse, not any
		type _Check = Assert<IsExact<typeof result, UsersGetResponse>>;
	});

	it("account.ban returns BaseOkResponse", async () => {
		const result = await vk.api.account.ban({ owner_id: 1 });
		type _Check = Assert<IsExact<typeof result, BaseOkResponse>>;
	});

	it("wall.post returns WallPostResponse", async () => {
		const result = await vk.api.wall.post({ message: "hi" });
		type _Check = Assert<IsExact<typeof result, WallPostResponse>>;
	});
});

// ============================
// suppress: true widens return to VKAPIError | Result
// ============================
describe("suppress narrows return type", () => {
	it("suppress: true returns VKAPIError | Result", async () => {
		const result = await vk.api.users.get({ suppress: true, user_ids: [1] });
		type _Check = Assert<IsExact<typeof result, VKAPIError | UsersGetResponse>>;
	});

	it("no suppress returns just Result", async () => {
		const result = await vk.api.users.get({ user_ids: [1] });
		type _Check = Assert<IsExact<typeof result, UsersGetResponse>>;
	});

	it("suppress on method with required params", async () => {
		const result = await vk.api.wall.post({ suppress: true, message: "hi" });
		type _Check = Assert<IsExact<typeof result, VKAPIError | WallPostResponse>>;
	});

	it("suppress on method with optional params", async () => {
		const result = await vk.api.account.ban({ suppress: true, owner_id: 1 });
		type _Check = Assert<IsExact<typeof result, VKAPIError | BaseOkResponse>>;
	});
});

// ============================
// Params are type-checked, not any
// ============================
describe("params are type-checked", () => {
	it("accepts valid params", () => {
		// These should compile without errors
		vk.api.users.get({ user_ids: [1] });
		vk.api.users.get(); // optional params
		vk.api.account.ban({ owner_id: 1 });
		vk.api.wall.post({ message: "hi" });
	});

	it("rejects invalid params", () => {
		// @ts-expect-error — nonexistent_param is not a valid param
		vk.api.users.get({ nonexistent_param: true });

		// @ts-expect-error — wall.post requires message or other valid params
		vk.api.wall.post({ totally_wrong: 123 });
	});
});

// ============================
// Second argument is RequestOptions
// ============================
describe("per-request options", () => {
	it("accepts signal and headers", () => {
		vk.api.users.get(
			{ user_ids: [1] },
			{ signal: AbortSignal.timeout(5000), headers: { "X-Custom": "yes" } },
		);
	});

	it("rejects method and body", () => {
		// @ts-expect-error — method is not allowed in RequestOptions
		vk.api.users.get({ user_ids: [1] }, { method: "GET" });
	});
});

// ============================
// Upload types
// ============================
describe("upload types", () => {
	it("Upload class methods return correct types", async () => {
		// Import check — these should resolve, not be any
		const { Upload, MediaUpload } = await import("../src/upload.ts");
		const up = new Upload(vk);

		// Method exists and returns typed promise
		const _messagePhoto: Promise<PhotosSaveMessagesPhotoResponse> =
			up.messagePhoto(MediaUpload.buffer(new Uint8Array(), "test.jpg"));

		void _messagePhoto;
	});
});
