/**
 * Simple and tiny VK API wrapper with middleware chain, configurable fetch, and type safety
 * @module
 */
import type { APIMethods } from "@vkraft/types";
import { VKAPIError } from "./errors.ts";
import type {
	Middleware,
	MiddlewareContext,
	RequestOptions,
	SuppressedAPIMethods,
} from "./types.ts";
import { simplifyObject } from "./utils.ts";

export { VKAPIError } from "./errors.ts";
export { withRetries } from "./utils.ts";
export type * from "./types.ts";
export type * from "@vkraft/types";

/**
 * Options for {@link VK}
 */
export interface VKOptions {
	/**
	 * VK API version.
	 * @default "5.199"
	 */
	v?: string;
	/**
	 * Base URL for API requests.
	 * @default "https://api.vk.com/method/"
	 */
	baseURL?: string;
	/**
	 * Global fetch options applied to every request.
	 * Can be overridden per-request via the second argument to API methods.
	 *
	 * {@link https://developer.mozilla.org/en-US/docs/Web/API/RequestInit | MDN}
	 */
	fetchOptions?: RequestOptions;
	/**
	 * Middleware chain that wraps every API call.
	 * Each middleware receives `(context, next)` — mutate params before `next()`,
	 * set `context.formData` for file uploads, handle results after, or catch errors.
	 *
	 * @example
	 * ```ts
	 * import { VK } from "@vkraft/api";
	 *
	 * const vk = new VK("ACCESS_TOKEN", {
	 *     middlewares: [loggerMiddleware],
	 * });
	 * ```
	 */
	middlewares?: Middleware[];
}

/**
 * Main class of the library.
 *
 * Use {@link VK.api | api} to call VK API methods via two-level proxy (`vk.api.users.get(...)`).
 * Pass middlewares via {@link VKOptions.middlewares | options.middlewares}.
 *
 * Without middlewares it's just `fetch` + `URLSearchParams` — zero overhead.
 *
 * @example
 * ```ts
 * import { VK } from "@vkraft/api";
 *
 * const vk = new VK("ACCESS_TOKEN");
 *
 * const users = await vk.api.users.get({
 *     user_ids: [1],
 * });
 * ```
 */
export class VK {
	/** Access token */
	token: string;
	/** Class {@link VKOptions | options} */
	options: VKOptions & { baseURL: string; v: string };

	private middlewares: Middleware[];

	/** Create new instance */
	constructor(token: string, options?: VKOptions) {
		this.token = token;
		this.options = {
			v: "5.199",
			baseURL: "https://api.vk.com/method/",
			...options,
		};
		this.middlewares = options?.middlewares ?? [];
	}

	/**
	 * Send requests to VK API.
	 *
	 * Two-level proxy: `vk.api.users.get(params)` calls `users.get` method.
	 *
	 * Returns the API result directly (unwrapped from `{ response }`).
	 * Throws {@link VKAPIError} on failure, unless `suppress: true` is passed.
	 *
	 * @example
	 * ```ts
	 * const users = await vk.api.users.get({
	 *     user_ids: [1],
	 * });
	 *
	 * // With error suppression
	 * const result = await vk.api.wall.post({
	 *     suppress: true,
	 *     message: "Hello!",
	 * });
	 * if (result instanceof VKAPIError) console.error(result.message);
	 *
	 * // With per-request fetch options (second argument)
	 * await vk.api.users.get(
	 *     { user_ids: [1] },
	 *     { signal: AbortSignal.timeout(5000) },
	 * );
	 * ```
	 */
	readonly api = new Proxy(
		{} as Record<string, Record<string, Function>> as unknown as SuppressedAPIMethods,
		{
			get: (
				_target: Record<string, Record<string, Function>>,
				category: string,
			) =>
				// biome-ignore lint/suspicious/noAssignInExpressions: cache the category proxy
				(_target[category] ??= new Proxy(
					{} as Record<string, Function>,
					{
						get: (
							_catTarget: Record<string, Function>,
							method: string,
						) =>
							// biome-ignore lint/suspicious/noAssignInExpressions: cache the method function
							(_catTarget[method] ??= (
								args: Record<string, unknown>,
								requestOptions?: RequestOptions,
							) => {
								const callSite = new Error();
								if (Error.captureStackTrace) {
									Error.captureStackTrace(
										callSite,
										_catTarget[method],
									);
								}
								return this._callApi(
									`${category}.${method}`,
									args,
									requestOptions,
									callSite,
								);
							}),
					},
				)),
		},
	);

	private async _callApi(
		method: string,
		params: Record<string, unknown> = {},
		perRequestOptions?: RequestOptions,
		callSite?: Error,
	) {
		// Extract suppress flag, keep only API params
		const suppress = params?.suppress as boolean | undefined;

		const apiParams = { ...params };
		delete apiParams.suppress;

		// Shared mutable context for middleware chain
		const context: MiddlewareContext = { method, params: apiParams };

		const executeCall = async () => {
			let url = `${this.options.baseURL}${context.method}`;

			// Merge fetch options: global → per-request
			const reqOptions: RequestInit = {
				method: "POST",
				...this.options.fetchOptions,
				...perRequestOptions,
				headers: new Headers({
					...((this.options.fetchOptions?.headers as Record<string, string>) ??
						{}),
					...((perRequestOptions?.headers as Record<string, string>) ?? {}),
				}),
			};

			// Build request body
			if (context.formData) {
				reqOptions.body = context.formData;

				// Auth params go to URL query string when using FormData
				const queryParams: Record<string, string> = {
					access_token: this.token,
					v: this.options.v,
				};

				if (context.params && Object.keys(context.params).length) {
					Object.assign(queryParams, simplifyObject(context.params));
				}

				url += `?${new URLSearchParams(queryParams).toString()}`;
			} else {
				reqOptions.body = new URLSearchParams(
					simplifyObject({
						...context.params,
						access_token: this.token,
						v: this.options.v,
					}),
				);
			}

			const response = await fetch(url, reqOptions);
			const data = (await response.json()) as
				| { response: unknown }
				| { error: import("@vkraft/types").VKError };

			if ("error" in data) {
				const err = new VKAPIError(
					data.error,
					method,
					context.params,
					callSite,
				);

				if (!suppress) throw err;
				return err;
			}

			return data.response;
		};

		// Compose middleware chain
		if (!this.middlewares.length) return executeCall();

		let fn: () => Promise<unknown> = executeCall;
		for (const mw of [...this.middlewares].reverse()) {
			const prev = fn;
			fn = () => mw(context, prev);
		}

		return fn() as ReturnType<typeof executeCall>;
	}
}
