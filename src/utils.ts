import { VKAPIError } from "./errors.ts";

/** @internal */
export const sleep = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps an API call and automatically retries on VK error code 6 (Too many requests per second).
 *
 * @param fn - Function that performs the API call
 * @param options - Retry options
 * @param options.delay - Delay between retries in ms (default: 350)
 * @param options.maxRetries - Maximum number of retries (default: 3)
 *
 * @example
 * ```ts
 * import { VK } from "@vkraft/api";
 * import { withRetries } from "@vkraft/api/utils";
 *
 * const vk = new VK("ACCESS_TOKEN");
 *
 * // Automatically waits and retries on error code 6
 * const result = await withRetries(() =>
 *     vk.api.users.get({ user_ids: [1] })
 * );
 * ```
 */
export async function withRetries<Result>(
	fn: () => Promise<Result>,
	options?: { delay?: number; maxRetries?: number },
): Promise<Result> {
	const delay = options?.delay ?? 350;
	const maxRetries = options?.maxRetries ?? 3;
	let retries = 0;

	let result = await suppressError(fn);

	while (result.value instanceof VKAPIError && result.value.code === 6) {
		if (retries >= maxRetries) {
			if (result.caught) throw result.value;
			return result.value as Result;
		}

		retries++;
		await sleep(delay);
		result = await suppressError(fn);
	}

	if (result.caught) throw result.value;

	return result.value;
}

type SuppressResult<T> =
	| { value: T; caught: false }
	| { value: unknown; caught: true };

async function suppressError<T>(
	fn: () => Promise<T>,
): Promise<SuppressResult<T>> {
	try {
		return { value: await fn(), caught: false };
	} catch (error) {
		return { value: error, caught: true };
	}
}

/** @internal */
function convertToString(value: unknown): string {
	const typeOfValue = typeof value;

	if (typeOfValue === "string") return value as string;
	if (typeOfValue === "object") return JSON.stringify(value);
	return String(value);
}

/** @internal */
export function simplifyObject(obj: Record<any, any>) {
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(obj)) {
		const typeOfValue = typeof value;

		if (value === undefined || value === null || typeOfValue === "function")
			continue;

		result[key] = convertToString(value);
	}

	return result;
}
