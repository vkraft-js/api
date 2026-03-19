import { describe, it, expect, mock, beforeEach } from "bun:test";
import { VK } from "../src/index.ts";
import { LongPoll } from "../src/updates.ts";

const mockFetch = mock((_url: string | URL | Request, _init?: RequestInit) =>
	Promise.resolve(new Response()),
);

globalThis.fetch = mockFetch as unknown as typeof fetch;

function mockResponse(data: unknown) {
	return new Response(JSON.stringify(data), {
		headers: { "Content-Type": "application/json" },
	});
}

const SERVER_INFO = {
	key: "test-key",
	server: "https://lp.vk.com/wh123456",
	ts: "1",
};

beforeEach(() => {
	mockFetch.mockReset();
});

describe("LongPoll", () => {
	it("should fetch server info and yield events", async () => {
		// First call: groups.getLongPollServer
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		// Second call: long poll request
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "2",
				updates: [
					{
						type: "message_new",
						object: { message: { peer_id: 1 } },
						group_id: 123456,
						event_id: "evt1",
					},
				],
			}),
		);
		// Third call: long poll request (empty, will stop)
		mockFetch.mockResolvedValueOnce(
			mockResponse({ ts: "3", updates: [] }),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		const events = [];
		for await (const event of polling) {
			events.push(event);
			// Stop after first event
			polling.stop();
		}

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("message_new");
		expect(events[0].group_id).toBe(123456);
		expect(events[0].event_id).toBe("evt1");

		// Verify getLongPollServer was called
		const firstCall = mockFetch.mock.calls[0];
		expect(firstCall[0]).toBe(
			"https://api.vk.com/method/groups.getLongPollServer",
		);

		// Verify long poll URL
		const secondCall = mockFetch.mock.calls[1];
		expect(secondCall[0]).toBe(
			"https://lp.vk.com/wh123456?act=a_check&key=test-key&ts=1&wait=25",
		);
	});

	it("should yield multiple events from a single response", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "2",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
					{
						type: "message_reply",
						object: {},
						group_id: 123456,
						event_id: "e2",
					},
					{
						type: "message_edit",
						object: {},
						group_id: 123456,
						event_id: "e3",
					},
				],
			}),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		const events = [];
		for await (const event of polling) {
			events.push(event);
			if (events.length === 3) polling.stop();
		}

		expect(events).toHaveLength(3);
		expect(events.map((e) => e.type)).toEqual([
			"message_new",
			"message_reply",
			"message_edit",
		]);
	});

	it("should update ts on failed=1", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		// First poll: failed=1 with new ts
		mockFetch.mockResolvedValueOnce(
			mockResponse({ failed: 1, ts: "10" }),
		);
		// Second poll: should use ts=10
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "11",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
				],
			}),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		for await (const _event of polling) {
			polling.stop();
		}

		// Verify the second long poll used ts=10
		const thirdCall = mockFetch.mock.calls[2];
		expect(thirdCall[0]).toContain("ts=10");
	});

	it("should re-fetch server info on failed=2", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		// First poll: failed=2
		mockFetch.mockResolvedValueOnce(mockResponse({ failed: 2 }));
		// Re-fetch server info
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				response: { key: "new-key", server: "https://lp.vk.com/wh123456", ts: "5" },
			}),
		);
		// Next poll with new key
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "6",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
				],
			}),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		for await (const _event of polling) {
			polling.stop();
		}

		// Verify getLongPollServer was called twice
		const apiCalls = mockFetch.mock.calls.filter((c) =>
			(c[0] as string).includes("groups.getLongPollServer"),
		);
		expect(apiCalls).toHaveLength(2);

		// Verify new key is used
		const lastPollCall = mockFetch.mock.calls[3];
		expect(lastPollCall[0]).toContain("key=new-key");
	});

	it("should re-fetch server info on failed=3", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		mockFetch.mockResolvedValueOnce(mockResponse({ failed: 3 }));
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				response: { key: "new-key", server: "https://lp.vk.com/wh123456", ts: "1" },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "2",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
				],
			}),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		for await (const _event of polling) {
			polling.stop();
		}

		const apiCalls = mockFetch.mock.calls.filter((c) =>
			(c[0] as string).includes("groups.getLongPollServer"),
		);
		expect(apiCalls).toHaveLength(2);
	});

	it("should use custom wait option", async () => {
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "2",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
				],
			}),
		);

		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456, wait: 10 });

		for await (const _event of polling) {
			polling.stop();
		}

		const pollUrl = mockFetch.mock.calls[1][0] as string;
		expect(pollUrl).toContain("wait=10");
	});

	it("should be restartable after stop", async () => {
		const vk = new VK("tok");
		const polling = new LongPoll(vk, { group_id: 123456 });

		// First run
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "2",
				updates: [
					{
						type: "message_new",
						object: {},
						group_id: 123456,
						event_id: "e1",
					},
				],
			}),
		);

		for await (const _event of polling) {
			polling.stop();
		}

		// Second run — should reset stopped flag
		mockFetch.mockResolvedValueOnce(
			mockResponse({ response: SERVER_INFO }),
		);
		mockFetch.mockResolvedValueOnce(
			mockResponse({
				ts: "3",
				updates: [
					{
						type: "wall_post_new",
						object: {},
						group_id: 123456,
						event_id: "e2",
					},
				],
			}),
		);

		const events = [];
		for await (const event of polling) {
			events.push(event);
			polling.stop();
		}

		expect(events[0].type).toBe("wall_post_new");
	});
});
