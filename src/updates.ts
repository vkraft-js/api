/**
 * Low-level long-polling transport for VK Bots Long Poll API
 * @module
 */
import type { VK } from "./index.ts";
import type { VKCallbackType } from "@vkraft/types";

export interface LongPollOptions {
	/** Community ID */
	group_id: number;
	/** Long poll wait timeout in seconds (default: 25) */
	wait?: number;
}

export interface LongPollEvent {
	type: VKCallbackType;
	object: Record<string, unknown>;
	group_id: number;
	event_id: string;
}

/** Raw long poll server response */
interface LongPollResponse {
	ts: string;
	updates?: LongPollEvent[];
	failed?: 1 | 2 | 3;
}

/**
 * Async iterable long-polling transport for VK Bots Long Poll API.
 *
 * Handles reconnection on key expiry and ts drift automatically.
 * Call {@link stop} for graceful shutdown.
 *
 * @example
 * ```ts
 * import { VK } from "@vkraft/api";
 * import { LongPoll } from "@vkraft/api/updates";
 *
 * const vk = new VK("TOKEN");
 * const polling = new LongPoll(vk, { group_id: 123456 });
 *
 * for await (const event of polling) {
 *   console.log(event.type, event.object);
 * }
 * ```
 */
export class LongPoll implements AsyncIterable<LongPollEvent> {
	private vk: VK;
	private groupId: number;
	private wait: number;
	private stopped = false;

	constructor(vk: VK, options: LongPollOptions) {
		this.vk = vk;
		this.groupId = options.group_id;
		this.wait = options.wait ?? 25;
	}

	/** Stop polling gracefully after the current cycle */
	stop(): void {
		this.stopped = true;
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<LongPollEvent> {
		this.stopped = false;

		let { key, server, ts } = await this.vk.api.groups.getLongPollServer({
			group_id: this.groupId,
		});

		while (!this.stopped) {
			const url = `${server}?act=a_check&key=${key}&ts=${ts}&wait=${this.wait}`;
			const response = await fetch(url);
			const data: LongPollResponse = await response.json();

			if (data.failed) {
				switch (data.failed) {
					case 1:
						ts = data.ts;
						continue;
					case 2:
					case 3:
						({ key, server, ts } =
							await this.vk.api.groups.getLongPollServer({
								group_id: this.groupId,
							}));
						continue;
				}
			}

			ts = data.ts;

			if (data.updates) {
				for (const event of data.updates) {
					yield event;
				}
			}
		}
	}
}
