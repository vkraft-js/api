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
 * For overloaded methods (callable interfaces), preserves the original signatures as-is
 * — suppress still works at runtime, just not reflected at the type level for overloads.
 */
type WrapMethod<M, S extends boolean | undefined = undefined> =
	M extends CallAPIWithoutParams<infer R>
		? <IsSuppressed extends boolean | undefined = S>(
				params?: Suppress<IsSuppressed>,
				requestOptions?: RequestOptions,
			) => Promise<
				true extends IsSuppressed ? VKAPIError | R : R
			>
		: M extends CallAPIWithOptionalParams<infer P, infer R>
			? <IsSuppressed extends boolean | undefined = S>(
					params?: P & Suppress<IsSuppressed>,
					requestOptions?: RequestOptions,
				) => Promise<
					true extends IsSuppressed ? VKAPIError | R : R
				>
			: M extends CallAPI<infer P, infer R>
				? <IsSuppressed extends boolean | undefined = S>(
						params: P & Suppress<IsSuppressed>,
						requestOptions?: RequestOptions,
					) => Promise<
						true extends IsSuppressed ? VKAPIError | R : R
					>
				: M; // Overloaded methods (callable interfaces) — preserve as-is

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
