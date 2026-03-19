import { VK } from "../src/index.ts";
import { LongPoll } from "../src/updates.ts";
import { Upload, MediaUpload } from "../src/upload.ts";

const vk = new VK("vk1.a.a4h3sXICD6GOJP7Mesfqd-M5eoQgmXGkaXe-XKi314GagbE2IGoObn-3zfwbF1drra73Oq_f6u8ednmeAUyF5LjDdek4Pq8XvfKQ_f4dTBaOVWO3YwxQn_j4dI-npYgOVRP6i9GY8LPspW-1JwwKYIlGZs-LOCQsP0-bby_0E7_RmTU-ravHwLVZQXqxRoxZQpvYuLkedzjKkyGwdfPSJw");
const up = new Upload(vk);
const polling = new LongPoll(vk, { group_id: 236840262 });

console.log("Polling started...");

for await (const event of polling) {
    console.log(`[${event.type}]`, JSON.stringify(event.object).slice(0, 100));

    if (event.type === "message_new") {
        const { peer_id, text } = event.object.message;

        if (text === "!cat") {
            const photo = await up.messagePhoto(
                MediaUpload.url("https://cataas.com/cat", "cat.jpg"),
                { peer_id },
            );

            await vk.api.messages.send({
                peer_id,
                attachment: photo.toString(),
                random_id: 0,
            });

            console.log(`Sent cat to ${peer_id}`);
        }
    }
}
