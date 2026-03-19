import { bench, group, run } from "mitata";

function callAPI(method: string, args: number) {
	return args;
}

// Two-level proxy (cached)
const cachedAPI = new Proxy({} as Record<string, Record<string, (num: number) => number>>, {
	get: (target, category: string) =>
		target[category] ??= new Proxy({} as Record<string, (num: number) => number>, {
			get: (catTarget, method: string) =>
				catTarget[method] ??= ((args) => callAPI(`${category}.${method}`, args)),
		}),
});

// Two-level proxy (non-cached)
const api = new Proxy({} as Record<string, Record<string, (num: number) => number>>, {
	get: (_target, category: string) =>
		new Proxy({} as Record<string, (num: number) => number>, {
			get: (_catTarget, method: string) =>
				(args: number) => callAPI(`${category}.${method}`, args),
		}),
});

group("two-level Proxy", () => {
	bench("cached", () => cachedAPI.users.get(2));
	bench("non-cached", () => api.users.get(2));
});

await run();
