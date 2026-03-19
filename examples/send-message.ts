import { VK } from "../src/index.ts";

const vk = new VK(process.env.VK_TOKEN!);
const userId = Number(process.env.VK_USER_ID);

// 1. Get user info
const users = await vk.api.users.get({ user_ids: [userId] });
console.log("User:", users);

// 2. Send a message to yourself
const result = await vk.api.messages.send({
	peer_id: userId,
	message: "Hello from @vkraft/api!",
	random_id: Math.floor(Math.random() * 1e9),
});
console.log("Message sent, id:", result);
