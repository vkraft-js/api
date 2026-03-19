import { VK } from "../src/index.ts";
import { Upload, MediaUpload } from "../src/upload.ts";

const vk = new VK(process.env.VK_TOKEN!);
const userId = Number(process.env.VK_USER_ID);
const up = new Upload(vk);

// Upload a photo from URL and send it in a message
const photos = await up.messagePhoto(
	MediaUpload.url("https://picsum.photos/400/300", "photo.jpg"),
	{ peer_id: userId },
);
console.log("Uploaded photos:", photos);
console.log("Attachment string:", `${photos}`);

// .toString() auto-serializes to VK attachment format
const messageId = await vk.api.messages.send({
	peer_id: userId,
	message: "Photo uploaded via @vkraft/api Upload class!",
	attachment: `${photos}`,
	random_id: Math.floor(Math.random() * 1e9),
});
console.log("Message sent, id:", messageId);
