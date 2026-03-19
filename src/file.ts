/**
 * File upload helpers for VK API
 * @module
 */
import type { RequestOptions } from "./types.ts";

/**
 * Low-level helper — POST a file as FormData to a VK upload server URL.
 *
 * The 3-step VK upload flow is:
 * 1. Get upload URL via API method (e.g. `photos.getUploadServer`)
 * 2. **Upload file to that URL** ← this helper
 * 3. Save the result via API method (e.g. `photos.save`)
 *
 * @param uploadUrl - Upload URL returned by VK API
 * @param fieldName - Form field name expected by VK (e.g. `"photo"`, `"file"`)
 * @param file - File to upload
 * @param filename - Optional filename override
 * @param fetchOptions - Optional fetch options
 * @returns Parsed JSON response from VK upload server
 *
 * @example
 * ```ts
 * import { VK } from "@vkraft/api";
 * import { upload, MediaUpload } from "@vkraft/api/file";
 *
 * const vk = new VK("ACCESS_TOKEN");
 *
 * // Step 1: Get upload URL
 * const server = await vk.api.photos.getMessagesUploadServer({ peer_id: 123 });
 *
 * // Step 2: Upload file
 * const file = await MediaUpload.path("./photo.jpg");
 * const uploaded = await upload(server.upload_url, "photo", file);
 *
 * // Step 3: Save
 * const saved = await vk.api.photos.saveMessagesPhoto({
 *     photo: uploaded.photo,
 *     server: uploaded.server,
 *     hash: uploaded.hash,
 * });
 * ```
 */
export async function upload(
	uploadUrl: string,
	fieldName: string,
	file: File | Blob,
	filename?: string,
	fetchOptions?: RequestOptions,
): Promise<Record<string, unknown>> {
	const formData = new FormData();
	formData.set(
		fieldName,
		file,
		filename ?? (file instanceof File ? file.name : "file"),
	);

	const response = await fetch(uploadUrl, {
		method: "POST",
		body: formData,
		...fetchOptions,
	});

	return response.json() as Promise<Record<string, unknown>>;
}

/**
 * Factory methods for creating `File` objects from various sources.
 *
 * @example
 * ```ts
 * import { MediaUpload } from "@vkraft/api/file";
 *
 * // From Buffer
 * const file = MediaUpload.buffer(buffer, "photo.jpg");
 *
 * // From Blob
 * const file = MediaUpload.blob(blob, "photo.jpg");
 *
 * // From text string
 * const file = MediaUpload.text("<xml>data</xml>", "data.xml");
 *
 * // From URL (fetches content)
 * const file = await MediaUpload.url("https://example.com/photo.jpg");
 *
 * // From file path (cross-runtime: Bun.file / node:fs)
 * const file = await MediaUpload.path("./photo.jpg");
 * ```
 */
export const MediaUpload = {
	/** Create a File from a Buffer/Uint8Array */
	buffer(data: BufferSource, filename: string, type?: string): File {
		return new File([data], filename, type ? { type } : undefined);
	},

	/** Create a File from a Blob */
	blob(blob: Blob, filename: string): File {
		return new File([blob], filename, { type: blob.type });
	},

	/** Create a File from a text string */
	text(text: string, filename = "file.txt"): File {
		return new File([text], filename, { type: "text/plain" });
	},

	/** Fetch content from a URL and return as a File */
	async url(
		url: string,
		filename?: string,
		fetchOptions?: RequestOptions,
	): Promise<File> {
		const response = await fetch(url, fetchOptions);
		const blob = await response.blob();
		const name =
			filename ?? new URL(url).pathname.split("/").pop() ?? "file";
		return new File([blob], name, { type: blob.type });
	},

	/** Read a file from the filesystem (cross-runtime) */
	async path(filePath: string, filename?: string): Promise<File> {
		const name = filename ?? filePath.split("/").pop() ?? "file";

		// Bun runtime
		if (typeof globalThis.Bun !== "undefined") {
			const bunFile = globalThis.Bun.file(filePath);
			const buffer = await bunFile.arrayBuffer();
			return new File([buffer], name, { type: bunFile.type });
		}

		// Node.js / Deno fallback
		const { readFile } = await import("node:fs/promises");
		const buffer = await readFile(filePath);
		return new File([buffer], name);
	},
};

/** @deprecated Use {@link MediaUpload} instead */
export const MediaInput = MediaUpload;
