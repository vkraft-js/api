import { describe, it, expectTypeOf } from "bun:test";
import { VK, VKAPIError } from "../src/index.ts";
import type {
	Middleware,
	MiddlewareContext,
	RequestOptions,
	Suppress,
	SuppressedAPIMethods,
} from "../src/types.ts";
import type {
	VKErrorCode,
	UsersGetResponse,
	BaseOkResponse,
} from "@vkraft/types";

const vk = new VK("tok");

describe("VK class types", () => {
	it("token is string", () => {
		expectTypeOf(vk.token).toBeString();
	});

	it("options has baseURL and v as string", () => {
		expectTypeOf(vk.options.baseURL).toBeString();
		expectTypeOf(vk.options.v).toBeString();
	});

	it("api is SuppressedAPIMethods", () => {
		expectTypeOf(vk.api).toEqualTypeOf<SuppressedAPIMethods>();
	});
});

describe("api return types", () => {
	it("users.get returns Promise<UsersGetResponse>", () => {
		expectTypeOf(
			vk.api.users.get({ user_ids: [1] }),
		).resolves.toEqualTypeOf<UsersGetResponse>();
	});

	it("account.ban returns Promise<BaseOkResponse>", () => {
		expectTypeOf(
			vk.api.account.ban({ owner_id: 1 }),
		).resolves.toEqualTypeOf<BaseOkResponse>();
	});
});

describe("suppress types", () => {
	it("suppress: true returns VKAPIError | Result", () => {
		expectTypeOf(
			vk.api.users.get({ suppress: true, user_ids: [1] }),
		).resolves.toEqualTypeOf<VKAPIError | UsersGetResponse>();
	});

	it("suppress: undefined returns just Result", () => {
		expectTypeOf(
			vk.api.users.get({ suppress: undefined, user_ids: [1] }),
		).resolves.toEqualTypeOf<UsersGetResponse>();
	});

	it("no suppress returns just Result", () => {
		expectTypeOf(
			vk.api.users.get({ user_ids: [1] }),
		).resolves.toEqualTypeOf<UsersGetResponse>();
	});

	it("account.ban with suppress returns VKAPIError | BaseOkResponse", () => {
		expectTypeOf(
			vk.api.account.ban({ suppress: true }),
		).resolves.toEqualTypeOf<VKAPIError | BaseOkResponse>();
	});
});

describe("Suppress", () => {
	it("default has optional suppress", () => {
		expectTypeOf<Suppress>().toEqualTypeOf<{ suppress?: undefined }>();
	});

	it("true has suppress true", () => {
		expectTypeOf<Suppress<true>>().toEqualTypeOf<{ suppress?: true }>();
	});
});

describe("RequestOptions (second argument)", () => {
	it("is Omit<RequestInit, 'method' | 'body'>", () => {
		expectTypeOf<RequestOptions>().toMatchObjectType<{
			signal?: AbortSignal | null;
			headers?: HeadersInit;
		}>();
	});

	it("does not include method or body", () => {
		expectTypeOf<RequestOptions>().not.toMatchObjectType<{ method: string }>();
		expectTypeOf<RequestOptions>().not.toMatchObjectType<{ body: BodyInit }>();
	});

	it("api method accepts second argument", () => {
		expectTypeOf(vk.api.users.get).toBeFunction();
		expectTypeOf(
			vk.api.users.get({ user_ids: [1] }, { signal: AbortSignal.timeout(5000) }),
		).resolves.toEqualTypeOf<UsersGetResponse>();
	});
});

describe("Middleware types", () => {
	it("Middleware is a function", () => {
		expectTypeOf<Middleware>().toBeFunction();
	});

	it("Middleware accepts context and next", () => {
		expectTypeOf<Middleware>().parameters.toEqualTypeOf<
			[MiddlewareContext, () => Promise<unknown>]
		>();
	});

	it("Middleware returns Promise<unknown>", () => {
		expectTypeOf<Middleware>().returns.toEqualTypeOf<Promise<unknown>>();
	});
});

describe("MiddlewareContext", () => {
	it("has method and params fields", () => {
		expectTypeOf<MiddlewareContext>().toMatchObjectType<{
			method: string;
			params: Record<string, unknown>;
		}>();
	});

	it("has optional formData", () => {
		expectTypeOf<MiddlewareContext>().toMatchObjectType<{
			formData?: FormData;
		}>();
	});
});

describe("VKAPIError types", () => {
	it("extends Error", () => {
		expectTypeOf<VKAPIError>().toMatchObjectType<Error>();
	});

	it("has method field as string", () => {
		expectTypeOf<VKAPIError>().toMatchObjectType<{
			method: string;
		}>();
	});

	it("has code as VKErrorCode", () => {
		expectTypeOf<VKAPIError>().toMatchObjectType<{
			code: VKErrorCode;
		}>();
	});

	it("has message as string", () => {
		expectTypeOf<VKAPIError>().toMatchObjectType<{
			message: string;
		}>();
	});

	it("has requestParams array", () => {
		expectTypeOf<VKAPIError>().toMatchObjectType<{
			requestParams: { key: string; value: string }[];
		}>();
	});
});

describe("VKOptions types", () => {
	it("constructor accepts options with middlewares", () => {
		const mw: Middleware = async (_ctx, next) => next();
		const _vk = new VK("tok", {
			baseURL: "http://localhost/method/",
			v: "5.131",
			fetchOptions: { headers: { "X-Custom": "yes" } },
			middlewares: [mw],
		});
		expectTypeOf(_vk).toEqualTypeOf<VK>();
	});
});

describe("nested api access", () => {
	it("api has category namespaces", () => {
		expectTypeOf(vk.api.users).toBeObject();
		expectTypeOf(vk.api.wall).toBeObject();
		expectTypeOf(vk.api.friends).toBeObject();
	});

	it("categories have methods", () => {
		expectTypeOf(vk.api.users.get).toBeFunction();
		expectTypeOf(vk.api.account.ban).toBeFunction();
	});
});
