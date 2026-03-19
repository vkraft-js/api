import type { VKError, VKErrorCode } from "@vkraft/types";

/** Represent {@link VKError} and thrown in API calls */
export class VKAPIError extends Error {
	/** Name of the API method (e.g. `"users.get"`) */
	method: string;
	/** Params that were sent */
	params: unknown;
	/** See {@link VKErrorCode} */
	code: VKErrorCode;
	/** Original request params returned by VK */
	requestParams: { key: string; value: string }[];

	/** Construct new VKAPIError */
	constructor(
		error: VKError,
		method: string,
		params: unknown,
		callSite?: Error,
	) {
		super(error.error_msg);

		this.name = method;
		this.method = method;
		this.params = params;
		this.code = error.error_code;
		this.requestParams = error.request_params;

		// Restore stack trace from the original call site
		if (callSite?.stack) {
			const callSiteLines = callSite.stack.split("\n");
			const relevantFrames = callSiteLines.slice(1);

			this.stack = `${this.name}: ${this.message}\n${relevantFrames.join("\n")}`;
		}
	}
}
