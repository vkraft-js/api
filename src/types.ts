import type { APIMethods } from "@vkraft/types";
import type {
	CallAPI,
	CallAPIWithOptionalParams,
	CallAPIWithoutParams,
} from "@vkraft/types/utils";
import type { VKAPIError } from "./errors.ts";

/** Type for maybe {@link Promise} or may not */
export type MaybePromise<T> = Promise<T> | T;

// === Suppress ===

/**
 * Interface for adding `suppress` param to method params.
 *
 * Pass `true` to return {@link VKAPIError} instead of throwing.
 *
 * @example
 * ```ts
 * const response = await vk.api.users.get({
 *     suppress: true,
 *     user_ids: [1],
 * });
 *
 * if (response instanceof VKAPIError) console.error("users.get returned an error...");
 * else console.log("Users fetched successfully");
 * ```
 */
export interface Suppress<
	IsSuppressed extends boolean | undefined = undefined,
> {
	suppress?: IsSuppressed;
}

// === Per-Request Options (second argument) ===

/**
 * Per-request options passed as the second argument to API methods.
 *
 * @example
 * ```ts
 * await vk.api.users.get(
 *     { user_ids: [1] },
 *     { signal: AbortSignal.timeout(5000) }
 * );
 * ```
 */
export type RequestOptions = Omit<RequestInit, "method" | "body">;

// === Wrap Method ===

/**
 * Wraps a single method signature, adding `suppress` and per-request `RequestOptions`.
 *
 * Uses overloads: call with `suppress: true` to get `VKAPIError | R` return.
 * For overloaded methods (callable interfaces), preserves the original signatures as-is.
 */
type WrapMethod<M> =
	M extends CallAPI<infer P, infer R>
		? {} extends P
			? {
					(params?: P, requestOptions?: RequestOptions): Promise<R>;
					(params: P & { suppress: true }, requestOptions?: RequestOptions): Promise<VKAPIError | R>;
				}
			: {
					(params: P, requestOptions?: RequestOptions): Promise<R>;
					(params: P & { suppress: true }, requestOptions?: RequestOptions): Promise<VKAPIError | R>;
				}
		: M extends CallAPIWithoutParams<infer R>
			? {
					(requestOptions?: RequestOptions): Promise<R>;
					(params: { suppress: true }, requestOptions?: RequestOptions): Promise<VKAPIError | R>;
				}
			: M;

// === API Methods Map ===

/** Nested map of APIMethods with {@link Suppress} and per-request {@link RequestOptions} */
export type SuppressedAPIMethods = {
	[Cat in keyof APIMethods]: {
		[Method in keyof APIMethods[Cat]]: WrapMethod<APIMethods[Cat][Method]>
	}
};

// === Middleware ===

/** Middleware context — shared mutable state that flows through the middleware chain */
export interface MiddlewareContext {
	method: string;
	params: Record<string, unknown>;
	/**
	 * Set by middleware to provide FormData body instead of JSON.
	 * When set, auth params (`access_token`, `v`) are sent as URL query string.
	 */
	formData?: FormData;
}

/**
 * Middleware function that wraps the API call lifecycle.
 *
 * - Mutate `context.params` before `next()` (like preRequest)
 * - Set `context.formData` for file uploads
 * - Handle result after `next()` (like onResponse)
 * - Catch errors from `next()` (like onResponseError)
 *
 * @example
 * ```ts
 * const logger: Middleware = async (context, next) => {
 *     console.log(`→ ${context.method}`);
 *     const result = await next();
 *     console.log(`← ${context.method}`);
 *     return result;
 * };
 * ```
 */
export type Middleware = (
	context: MiddlewareContext,
	next: () => Promise<unknown>,
) => Promise<unknown>;
