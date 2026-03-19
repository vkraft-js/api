/**
 * High-level upload helpers that automate the VK 3-step upload flow.
 * @module
 */
import type { VK } from "./index.ts";
import type { RequestOptions } from "./types.ts";
import type {
	PhotosGetMessagesUploadServerParams,
	PhotosGetWallUploadServerParams,
	PhotosSaveWallPhotoParams,
	PhotosGetUploadServerParams,
	PhotosSaveParams,
	PhotosGetOwnerPhotoUploadServerParams,
	PhotosSaveOwnerPhotoParams,
	PhotosGetOwnerCoverPhotoUploadServerParams,
	PhotosSaveOwnerCoverPhotoParams,
	PhotosGetChatUploadServerParams,
	PhotosGetMarketAlbumUploadServerParams,
	PhotosSaveMarketAlbumPhotoParams,
	DocsGetUploadServerParams,
	DocsSaveParams,
	DocsGetMessagesUploadServerParams,
	DocsGetWallUploadServerParams,
	MarketGetProductPhotoUploadServerParams,
	StoriesGetPhotoUploadServerParams,
	StoriesGetVideoUploadServerParams,
	PhotosSaveMessagesPhotoResponse,
	PhotosSaveWallPhotoResponse,
	PhotosSaveResponse,
	PhotosSaveOwnerPhotoResponse,
	PhotosSaveOwnerCoverPhotoResponse,
	MessagesSetChatPhotoResponse,
	PhotosSaveMarketAlbumPhotoResponse,
	DocsSaveResponse,
	MarketPhotoIdResponse,
} from "@vkraft/types";
import { upload } from "./file.ts";

export { MediaUpload } from "./file.ts";

/** File or a promise that resolves to a File (from {@link MediaUpload} factories) */
export type UploadFile = File | Promise<File>;

interface ConductRecipe<TResult> {
	file: UploadFile;
	getServer: () => Promise<{ upload_url: string }>;
	fieldName: string;
	// biome-ignore lint/suspicious/noExplicitAny: VK upload server response is untyped JSON
	save?: (uploaded: any) => Promise<TResult>;
	/** VK attachment type prefix (e.g. "photo", "doc") — enables `.toString()` on the result */
	attachmentType?: string;
	requestOptions?: RequestOptions;
}

/**
 * High-level upload class that automates the VK 3-step upload flow:
 * get upload server → upload file → save result.
 *
 * @example
 * ```ts
 * import { VK } from "@vkraft/api";
 * import { Upload, MediaUpload } from "@vkraft/api/upload";
 *
 * const vk = new VK("TOKEN");
 * const up = new Upload(vk);
 *
 * const photos = await up.messagePhoto(
 *     MediaUpload.path("./photo.jpg"),
 *     { peer_id: 123 },
 * );
 * ```
 */
export class Upload {
	constructor(private vk: VK) {}

	private async _conduct<TResult>(
		recipe: ConductRecipe<TResult>,
	): Promise<TResult> {
		const { upload_url } = await recipe.getServer();
		const file = await recipe.file;
		const uploaded = await upload(
			upload_url,
			recipe.fieldName,
			file,
			undefined,
			recipe.requestOptions,
		);
		const result = recipe.save
			? await recipe.save(uploaded)
			: (uploaded as TResult);

		if (recipe.attachmentType) {
			const type = recipe.attachmentType;
			const toAttachmentString = (item: Record<string, unknown>) => {
				const base = `${type}${item.owner_id}_${item.id}`;
				return item.access_key ? `${base}_${item.access_key}` : base;
			};

			if (Array.isArray(result)) {
				result.toString = () => result.map(toAttachmentString).join(",");
			} else if (result && typeof result === "object") {
				(result as Record<string, unknown>).toString = () =>
					toAttachmentString(result as Record<string, unknown>);
			}
		}

		return result;
	}

	/** Upload a photo for a private message */
	messagePhoto(
		file: UploadFile,
		params?: PhotosGetMessagesUploadServerParams,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveMessagesPhotoResponse> {
		return this._conduct({
			file,
			fieldName: "photo",
			attachmentType: "photo",
			getServer: () =>
				this.vk.api.photos.getMessagesUploadServer(params ?? {}),
			save: (uploaded) =>
				this.vk.api.photos.saveMessagesPhoto(uploaded),
			requestOptions,
		});
	}

	/** Upload a photo to a wall post */
	wallPhoto(
		file: UploadFile,
		params?: PhotosGetWallUploadServerParams &
			Omit<PhotosSaveWallPhotoParams, "photo" | "server" | "hash">,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveWallPhotoResponse> {
		const { group_id, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "photo",
			attachmentType: "photo",
			getServer: () =>
				this.vk.api.photos.getWallUploadServer({ group_id: group_id! }),
			save: (uploaded) =>
				this.vk.api.photos.saveWallPhoto({
					...saveParams,
					group_id,
					...uploaded,
				}),
			requestOptions,
		});
	}

	/** Upload a photo to an album */
	albumPhoto(
		file: UploadFile,
		params?: PhotosGetUploadServerParams &
			Omit<PhotosSaveParams, "server" | "photos_list" | "hash">,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveResponse> {
		const { album_id, group_id, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "file1",
			attachmentType: "photo",
			getServer: () =>
				this.vk.api.photos.getUploadServer({
					album_id: album_id!,
					group_id,
				}),
			save: (uploaded) =>
				this.vk.api.photos.save({
					...saveParams,
					album_id,
					group_id,
					...uploaded,
				}),
			requestOptions,
		});
	}

	/** Upload a profile/community photo */
	ownerPhoto(
		file: UploadFile,
		params?: PhotosGetOwnerPhotoUploadServerParams &
			Omit<PhotosSaveOwnerPhotoParams, "photo" | "server" | "hash">,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveOwnerPhotoResponse> {
		const { owner_id, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "photo",
			getServer: () =>
				this.vk.api.photos.getOwnerPhotoUploadServer({
					owner_id: owner_id!,
				}),
			save: (uploaded) =>
				this.vk.api.photos.saveOwnerPhoto({
					...saveParams,
					...uploaded,
				}),
			requestOptions,
		});
	}

	/** Upload a community cover photo */
	ownerCoverPhoto(
		file: UploadFile,
		params?: PhotosGetOwnerCoverPhotoUploadServerParams &
			Omit<PhotosSaveOwnerCoverPhotoParams, "photo" | "hash">,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveOwnerCoverPhotoResponse> {
		const {
			group_id,
			crop_x,
			crop_y,
			crop_x2,
			crop_y2,
			...saveParams
		} = params ?? {};
		return this._conduct({
			file,
			fieldName: "photo",
			getServer: () =>
				this.vk.api.photos.getOwnerCoverPhotoUploadServer({
					group_id: group_id!,
					crop_x,
					crop_y,
					crop_x2,
					crop_y2,
				}),
			save: (uploaded) =>
				this.vk.api.photos.saveOwnerCoverPhoto({
					...saveParams,
					...uploaded,
				}),
			requestOptions,
		});
	}

	/** Upload a chat cover photo */
	chatPhoto(
		file: UploadFile,
		params: PhotosGetChatUploadServerParams,
		requestOptions?: RequestOptions,
	): Promise<MessagesSetChatPhotoResponse> {
		return this._conduct({
			file,
			fieldName: "file",
			getServer: () =>
				this.vk.api.photos.getChatUploadServer(params),
			save: (uploaded) =>
				this.vk.api.messages.setChatPhoto({
					file: uploaded.response,
				}),
			requestOptions,
		});
	}

	/** Upload a photo for a market album */
	marketAlbumPhoto(
		file: UploadFile,
		params: PhotosGetMarketAlbumUploadServerParams &
			Omit<PhotosSaveMarketAlbumPhotoParams, "photo" | "server" | "hash">,
		requestOptions?: RequestOptions,
	): Promise<PhotosSaveMarketAlbumPhotoResponse> {
		const { group_id } = params;
		return this._conduct({
			file,
			fieldName: "file",
			attachmentType: "photo",
			getServer: () =>
				this.vk.api.photos.getMarketAlbumUploadServer({
					group_id: group_id!,
				}),
			save: (uploaded) =>
				this.vk.api.photos.saveMarketAlbumPhoto({
					group_id: group_id!,
					...uploaded,
				}),
			requestOptions,
		});
	}

	/** Upload a document */
	document(
		file: UploadFile,
		params?: DocsGetUploadServerParams &
			Omit<DocsSaveParams, "file">,
		requestOptions?: RequestOptions,
	): Promise<DocsSaveResponse> {
		const { group_id, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "file",
			attachmentType: "doc",
			getServer: () =>
				this.vk.api.docs.getUploadServer({ group_id }),
			save: (uploaded) =>
				this.vk.api.docs.save({
					...saveParams,
					file: uploaded.file,
				}),
			requestOptions,
		});
	}

	/** Upload a document for a private message */
	messageDocument(
		file: UploadFile,
		params?: DocsGetMessagesUploadServerParams &
			Omit<DocsSaveParams, "file">,
		requestOptions?: RequestOptions,
	): Promise<DocsSaveResponse> {
		const { peer_id, type, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "file",
			attachmentType: "doc",
			getServer: () =>
				this.vk.api.docs.getMessagesUploadServer({ peer_id: peer_id!, type }),
			save: (uploaded) =>
				this.vk.api.docs.save({
					...saveParams,
					file: uploaded.file,
				}),
			requestOptions,
		});
	}

	/** Upload a document for a wall post */
	wallDocument(
		file: UploadFile,
		params?: DocsGetWallUploadServerParams &
			Omit<DocsSaveParams, "file">,
		requestOptions?: RequestOptions,
	): Promise<DocsSaveResponse> {
		const { group_id, ...saveParams } = params ?? {};
		return this._conduct({
			file,
			fieldName: "file",
			attachmentType: "doc",
			getServer: () =>
				this.vk.api.docs.getWallUploadServer({ group_id }),
			save: (uploaded) =>
				this.vk.api.docs.save({
					...saveParams,
					file: uploaded.file,
				}),
			requestOptions,
		});
	}

	/** Upload a market product photo */
	marketProductPhoto(
		file: UploadFile,
		params: MarketGetProductPhotoUploadServerParams,
		requestOptions?: RequestOptions,
	): Promise<MarketPhotoIdResponse> {
		return this._conduct({
			file,
			fieldName: "file",
			attachmentType: "photo",
			getServer: () =>
				this.vk.api.market.getProductPhotoUploadServer(params),
			save: (uploaded) =>
				this.vk.api.market.saveProductPhoto({
					upload_response: JSON.stringify(uploaded),
				}),
			requestOptions,
		});
	}

	/** Upload a photo for a story */
	storiesPhoto(
		file: UploadFile,
		params?: StoriesGetPhotoUploadServerParams,
		requestOptions?: RequestOptions,
	): Promise<Record<string, unknown>> {
		return this._conduct({
			file,
			fieldName: "file",
			getServer: () =>
				this.vk.api.stories.getPhotoUploadServer(params ?? {}),
			requestOptions,
		});
	}

	/** Upload a video for a story */
	storiesVideo(
		file: UploadFile,
		params?: StoriesGetVideoUploadServerParams,
		requestOptions?: RequestOptions,
	): Promise<Record<string, unknown>> {
		return this._conduct({
			file,
			fieldName: "video_file",
			getServer: () =>
				this.vk.api.stories.getVideoUploadServer(params ?? {}),
			requestOptions,
		});
	}
}
