import { describe, it, expect, mock, beforeEach } from "bun:test";
import { VK, VKAPIError, withRetries } from "../src/index.ts";
import type { Middleware } from "../src/types.ts";

// Mock fetch globally
const mockFetch = mock<typeof fetch>(() => Promise.resolve(new Response()));

globalThis.fetch = mockFetch;

function mockResponse(data: unknown) {
	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	mockFetch.mockReset();
});

describe("VK", () => {
	it("should store token and default options", () => {
		const vk = new VK("test-token");
		expect(vk.token).toBe("test-token");
		expect(vk.options.baseURL).toBe("https://api.vk.com/method/");
		expect(vk.options.v).toBe("5.199");
	});

	it("should accept custom baseURL and v", () => {
		const vk = new VK("tok", {
			baseURL: "http://localhost:8081/method/",
			v: "5.131",
		});
		expect(vk.options.baseURL).toBe("http://localhost:8081/method/");
		expect(vk.options.v).toBe("5.131");
	});
});

describe("api proxy", () => {
	it("should send POST with JSON body to correct URL", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: [{ id: 1, first_name: "Pavel" }] }),
		);

		const vk = new VK("tok");
		const result = await vk.api.users.get({
			user_ids: [1],
		});

		expect(result).toEqual([{ id: 1, first_name: "Pavel" }]);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.vk.com/method/users.get");
		expect(init?.method).toBe("POST");
		expect((init?.headers as Headers).get("Content-Type")).toBe(
			"application/json",
		);

		const body = JSON.parse(init?.body as string);
		expect(body).toEqual({
			user_ids: [1],
			access_token: "tok",
			v: "5.199",
		});
	});

	it("should include access_token and v in body", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: { id: 1 } }),
		);

		const vk = new VK("my-token", { v: "5.131" });
		await vk.api.account.getProfileInfo();

		const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(body.access_token).toBe("my-token");
		expect(body.v).toBe("5.131");
	});

	it("should strip suppress from body", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				error: {
					error_code: 5,
					error_msg: "User authorization failed",
					request_params: [],
				},
			}),
		);

		const vk = new VK("tok");
		const result = await vk.api.users.get({
			suppress: true,
			user_ids: [1],
		});

		expect(result).toBeInstanceOf(VKAPIError);

		const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(body).not.toHaveProperty("suppress");
	});

	it("should cache proxy functions at both levels", () => {
		const vk = new VK("tok");
		// Category level
		const users1 = vk.api.users;
		const users2 = vk.api.users;
		expect(users1).toBe(users2);

		// Method level
		const get1 = vk.api.users.get;
		const get2 = vk.api.users.get;
		expect(get1).toBe(get2);
	});
});

describe("VKAPIError", () => {
	it("should throw on error response by default", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				error: {
					error_code: 5,
					error_msg: "User authorization failed",
					request_params: [
						{ key: "method", value: "users.get" },
						{ key: "oauth", value: "1" },
					],
				},
			}),
		);

		const vk = new VK("tok");

		try {
			await vk.api.users.get({ user_ids: [1] });
			expect.unreachable("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(VKAPIError);
			const ve = err as VKAPIError;
			expect(ve.code).toBe(5);
			expect(ve.message).toBe("User authorization failed");
			expect(ve.method).toBe("users.get");
			expect(ve.requestParams).toEqual([
				{ key: "method", value: "users.get" },
				{ key: "oauth", value: "1" },
			]);
		}
	});

	it("should return error when suppress: true", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				error: {
					error_code: 7,
					error_msg: "Permission to perform this action is denied",
					request_params: [],
				},
			}),
		);

		const vk = new VK("tok");
		const result = await vk.api.wall.post({
			suppress: true,
			message: "test",
		});

		expect(result).toBeInstanceOf(VKAPIError);
		if (result instanceof VKAPIError) {
			expect(result.code).toBe(7);
		}
	});
});

describe("fetch options", () => {
	it("should apply global fetchOptions", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: { id: 1 } }),
		);

		const vk = new VK("tok", {
			fetchOptions: {
				headers: { "X-Custom": "global" },
			},
		});

		await vk.api.account.getProfileInfo();

		const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
		expect(headers.get("X-Custom")).toBe("global");
	});

	it("should merge per-request options over global", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: { id: 1 } }),
		);

		const vk = new VK("tok", {
			fetchOptions: {
				headers: { "X-Global": "yes" },
			},
		});

		await vk.api.account.getProfileInfo({}, { headers: { "X-Per-Request": "yes" } });

		const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
		expect(headers.get("X-Global")).toBe("yes");
		expect(headers.get("X-Per-Request")).toBe("yes");
	});
});

describe("middlewares", () => {
	it("should run middlewares in order", async () => {
		const order: number[] = [];

		const mw1: Middleware = async (_ctx, next) => {
			order.push(1);
			const r = await next();
			order.push(4);
			return r;
		};

		const mw2: Middleware = async (_ctx, next) => {
			order.push(2);
			const r = await next();
			order.push(3);
			return r;
		};

		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: true }),
		);

		const vk = new VK("tok", { middlewares: [mw1, mw2] });
		await vk.api.account.getProfileInfo();

		expect(order).toEqual([1, 2, 3, 4]);
	});

	it("should allow middleware to mutate params", async () => {
		const addField: Middleware = async (ctx, next) => {
			ctx.params.fields = "photo_100";
			return next();
		};

		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: [{ id: 1 }] }),
		);

		const vk = new VK("tok", { middlewares: [addField] });
		await vk.api.users.get({ user_ids: [1] });

		const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
		expect(body.fields).toBe("photo_100");
	});

	it("should allow middleware to set formData", async () => {
		const fakeUpload: Middleware = async (ctx, next) => {
			const fd = new FormData();
			fd.set("photo", new Blob(["fake"]), "photo.jpg");
			ctx.formData = fd;
			ctx.params = {};
			return next();
		};

		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: { id: 1 } }),
		);

		const vk = new VK("tok", { middlewares: [fakeUpload] });
		await vk.api.photos.save({ album_id: 1 });

		const [url, init] = mockFetch.mock.calls[0];
		expect(init?.body).toBeInstanceOf(FormData);
		// No Content-Type header when using FormData (browser sets boundary)
		expect((init?.headers as Headers).has("Content-Type")).toBe(false);
		// Auth params go to URL query string
		expect(url).toContain("access_token=tok");
		expect(url).toContain("v=5.199");
	});

	it("should allow middleware to catch errors", async () => {
		let caughtMethod: string | undefined;

		const errorCatcher: Middleware = async (ctx, next) => {
			try {
				return await next();
			} catch (err) {
				if (err instanceof VKAPIError) {
					caughtMethod = err.method;
				}
				throw err;
			}
		};

		mockFetch.mockResolvedValueOnce(
			mockResponse({
				error: {
					error_code: 5,
					error_msg: "User authorization failed",
					request_params: [],
				},
			}),
		);

		const vk = new VK("tok", { middlewares: [errorCatcher] });

		try {
			await vk.api.users.get({ user_ids: [1] });
		} catch {
			// expected
		}

		expect(caughtMethod).toBe("users.get");
	});

	it("should skip middlewares when array is empty", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: true }),
		);

		const vk = new VK("tok");
		const result = await vk.api.account.getProfileInfo();

		expect(result).toEqual(true);
	});
});

describe("withRetries", () => {
	it("should return result on success", async () => {
		const result = await withRetries(() => Promise.resolve(42));
		expect(result).toBe(42);
	});

	it("should rethrow non-VKAPIError", async () => {
		const err = new Error("boom");
		try {
			await withRetries(() => Promise.reject(err));
			expect.unreachable("should have thrown");
		} catch (e) {
			expect(e).toBe(err);
		}
	});

	it("should retry on error code 6 (Too many requests)", async () => {
		let attempt = 0;

		mockFetch.mockImplementation(async () => {
			attempt++;
			if (attempt === 1) {
				return mockResponse({
					error: {
						error_code: 6,
						error_msg: "Too many requests per second",
						request_params: [],
					},
				});
			}
			return mockResponse({ response: [{ id: 1 }] });
		});

		const vk = new VK("tok");
		const result = await withRetries(
			() => vk.api.users.get({ user_ids: [1] }),
			{ delay: 10 },
		);

		expect(result).toEqual([{ id: 1 }]);
		expect(attempt).toBe(2);
	});
});
