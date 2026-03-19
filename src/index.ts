import { Worker } from "@notionhq/workers";

const worker = new Worker();
export default worker;

// ---------------------------------------------------------------------------
// Spotify OAuth
// ---------------------------------------------------------------------------
const spotifyAuth = worker.oauth("spotifyAuth", {
	name: "spotify",
	authorizationEndpoint: "https://accounts.spotify.com/authorize",
	tokenEndpoint: "https://accounts.spotify.com/api/token",
	scope: [
		"user-read-playback-state",
		"user-modify-playback-state",
		"user-read-currently-playing",
		"user-read-recently-played",
		"user-top-read",
		"user-library-read",
		"user-library-modify",
		"playlist-read-private",
		"playlist-read-collaborative",
		"playlist-modify-public",
		"playlist-modify-private",
		"streaming",
	].join(" "),
	clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
	clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
	authorizationParams: {
		show_dialog: "true",
	},
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const API = "https://api.spotify.com/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function spotify(
	path: string,
	opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const token = await spotifyAuth.accessToken();
	const url = new URL(`${API}${path}`);
	if (opts.query) {
		for (const [k, v] of Object.entries(opts.query)) {
			if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString(), {
		method: opts.method ?? "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
	});
	if (res.status === 204) return null;
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Spotify API ${res.status}: ${text}`);
	}
	return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatTrack(t: any): string {
	return `${t.name} by ${t.artists?.map((a: any) => a.name).join(", ") ?? "Unknown"} (${t.album?.name ?? "Unknown"}) [uri: ${t.uri}, id: ${t.id}, duration: ${t.duration_ms}ms]`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPlaylist(p: any): string {
	const trackCount = p.items?.total ?? p.tracks?.total ?? 0;
	return `${p.name} (${trackCount} tracks, by ${p.owner?.display_name ?? "Unknown"}) [id: ${p.id}, uri: ${p.uri}]`;
}

// Nullable string schema helper
const nullableString = (description: string) =>
	({ anyOf: [{ type: "string" }, { type: "null" }] as const, description });
const nullableNumber = (description: string) =>
	({ anyOf: [{ type: "number" }, { type: "null" }] as const, description });
const nullableBoolean = (description: string) =>
	({ anyOf: [{ type: "boolean" }, { type: "null" }] as const, description });

// ---------------------------------------------------------------------------
// Playback Tools
// ---------------------------------------------------------------------------

worker.tool<{ placeholder: string }, string>("getPlaybackState", {
	title: "Get Playback State",
	description:
		"Get the current Spotify playback state including the currently playing track, device, shuffle/repeat status, and progress. Pass any value for placeholder.",
	schema: {
		type: "object",
		properties: {
			placeholder: { type: "string", description: "Pass any value." },
		},
		required: ["placeholder"],
		additionalProperties: false,
	},
	execute: async () => {
		const data = await spotify("/me/player");
		if (!data) return "No active playback session.";
		const parts: string[] = [];
		if (data.item) parts.push(`Now playing: ${formatTrack(data.item)}`);
		parts.push(`Playing: ${data.is_playing}`);
		if (data.device) parts.push(`Device: ${data.device.name} (${data.device.type}, volume: ${data.device.volume_percent}%)`);
		parts.push(`Shuffle: ${data.shuffle_state}, Repeat: ${data.repeat_state}`);
		parts.push(`Progress: ${data.progress_ms}ms`);
		return parts.join("\n");
	},
});

worker.tool<{ placeholder: string }, string>("getCurrentlyPlaying", {
	title: "Get Currently Playing",
	description: "Get the track that is currently playing on the user's Spotify. Pass any value for placeholder.",
	schema: {
		type: "object",
		properties: {
			placeholder: { type: "string", description: "Pass any value." },
		},
		required: ["placeholder"],
		additionalProperties: false,
	},
	execute: async () => {
		const data = await spotify("/me/player/currently-playing");
		if (!data || !data.item) return "Nothing is currently playing.";
		return `${data.is_playing ? "Playing" : "Paused"}: ${formatTrack(data.item)} (progress: ${data.progress_ms}ms)`;
	},
});

worker.tool<{
	uris: string | null;
	context_uri: string | null;
	device_id: string | null;
	offset_position: number | null;
}, string>("play", {
	title: "Play / Resume",
	description:
		"Start or resume Spotify playback. Optionally provide comma-separated track URIs, a context URI (album/playlist/artist), or a device ID. Pass null for fields you don't need.",
	schema: {
		type: "object",
		properties: {
			uris: nullableString("Comma-separated Spotify track URIs to play (e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh). Pass null to resume current playback."),
			context_uri: nullableString("A Spotify context URI (album, playlist, or artist) to play, e.g. spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"),
			device_id: nullableString("The device ID to play on. Pass null for active device."),
			offset_position: nullableNumber("Zero-based position in the context to start playing from."),
		},
		required: ["uris", "context_uri", "device_id", "offset_position"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const body: Record<string, unknown> = {};
		if (input.uris) body.uris = input.uris.split(",").map((u) => u.trim());
		if (input.context_uri) body.context_uri = input.context_uri;
		if (input.offset_position !== null) body.offset = { position: input.offset_position };
		const query: Record<string, string> = {};
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/play", { method: "PUT", body: Object.keys(body).length ? body : undefined, query });
		return "Playback started.";
	},
});

worker.tool<{ device_id: string | null }, string>("pause", {
	title: "Pause Playback",
	description: "Pause the current Spotify playback.",
	schema: {
		type: "object",
		properties: {
			device_id: nullableString("Device ID to pause on. Pass null for active device."),
		},
		required: ["device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = {};
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/pause", { method: "PUT", query });
		return "Playback paused.";
	},
});

worker.tool<{ device_id: string | null }, string>("skipToNext", {
	title: "Skip to Next Track",
	description: "Skip to the next track in the queue.",
	schema: {
		type: "object",
		properties: {
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = {};
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/next", { method: "POST", query });
		return "Skipped to next track.";
	},
});

worker.tool<{ device_id: string | null }, string>("skipToPrevious", {
	title: "Skip to Previous Track",
	description: "Skip to the previous track.",
	schema: {
		type: "object",
		properties: {
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = {};
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/previous", { method: "POST", query });
		return "Skipped to previous track.";
	},
});

worker.tool<{ position_ms: number; device_id: string | null }, string>("seek", {
	title: "Seek to Position",
	description: "Seek to a specific position in the currently playing track.",
	schema: {
		type: "object",
		properties: {
			position_ms: { type: "number", description: "Position in milliseconds to seek to." },
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["position_ms", "device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { position_ms: String(input.position_ms) };
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/seek", { method: "PUT", query });
		return `Seeked to ${input.position_ms}ms.`;
	},
});

worker.tool<{ volume_percent: number; device_id: string | null }, string>("setVolume", {
	title: "Set Volume",
	description: "Set the playback volume (0-100).",
	schema: {
		type: "object",
		properties: {
			volume_percent: { type: "number", description: "Volume level 0-100." },
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["volume_percent", "device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { volume_percent: String(input.volume_percent) };
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/volume", { method: "PUT", query });
		return `Volume set to ${input.volume_percent}%.`;
	},
});

worker.tool<{ state: boolean; device_id: string | null }, string>("setShuffle", {
	title: "Set Shuffle",
	description: "Turn shuffle on or off.",
	schema: {
		type: "object",
		properties: {
			state: { type: "boolean", description: "true = shuffle on, false = shuffle off." },
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["state", "device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { state: String(input.state) };
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/shuffle", { method: "PUT", query });
		return `Shuffle ${input.state ? "enabled" : "disabled"}.`;
	},
});

worker.tool<{ state: string; device_id: string | null }, string>("setRepeat", {
	title: "Set Repeat Mode",
	description: 'Set repeat mode: "track", "context" (album/playlist), or "off".',
	schema: {
		type: "object",
		properties: {
			state: { type: "string", description: '"track" = repeat current track, "context" = repeat album/playlist, "off" = no repeat.' },
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["state", "device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { state: input.state };
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/repeat", { method: "PUT", query });
		return `Repeat set to "${input.state}".`;
	},
});

worker.tool<{ uri: string; device_id: string | null }, string>("addToQueue", {
	title: "Add to Queue",
	description: "Add a track or episode to the playback queue.",
	schema: {
		type: "object",
		properties: {
			uri: { type: "string", description: "Spotify URI of the track/episode to queue (e.g. spotify:track:xxx)." },
			device_id: nullableString("Device ID. Pass null for active device."),
		},
		required: ["uri", "device_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { uri: input.uri };
		if (input.device_id) query.device_id = input.device_id;
		await spotify("/me/player/queue", { method: "POST", query });
		return "Added to queue.";
	},
});

worker.tool<{ placeholder: string }, string>("getQueue", {
	title: "Get Queue",
	description: "Get the current playback queue. Pass any value for placeholder.",
	schema: {
		type: "object",
		properties: {
			placeholder: { type: "string", description: "Pass any value." },
		},
		required: ["placeholder"],
		additionalProperties: false,
	},
	execute: async () => {
		const data = await spotify("/me/player/queue");
		const parts: string[] = [];
		if (data.currently_playing) parts.push(`Currently playing: ${formatTrack(data.currently_playing)}`);
		const queue = (data.queue ?? []).slice(0, 20);
		if (queue.length > 0) {
			parts.push("Queue:");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			queue.forEach((t: any, i: number) => parts.push(`  ${i + 1}. ${formatTrack(t)}`));
		} else {
			parts.push("Queue is empty.");
		}
		return parts.join("\n");
	},
});

// ---------------------------------------------------------------------------
// Device Tools
// ---------------------------------------------------------------------------

worker.tool<{ placeholder: string }, string>("getDevices", {
	title: "Get Available Devices",
	description: "List all Spotify devices available for playback. Pass any value for placeholder.",
	schema: {
		type: "object",
		properties: {
			placeholder: { type: "string", description: "Pass any value." },
		},
		required: ["placeholder"],
		additionalProperties: false,
	},
	execute: async () => {
		const data = await spotify("/me/player/devices");
		const devices = data.devices ?? [];
		if (devices.length === 0) return "No devices available.";
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return devices.map((d: any) =>
			`${d.name} (${d.type}) - ID: ${d.id}, Active: ${d.is_active}, Volume: ${d.volume_percent}%`
		).join("\n");
	},
});

worker.tool<{ device_id: string; play: boolean }, string>("transferPlayback", {
	title: "Transfer Playback",
	description: "Transfer playback to a different device.",
	schema: {
		type: "object",
		properties: {
			device_id: { type: "string", description: "The device ID to transfer playback to." },
			play: { type: "boolean", description: "If true, start playing on the new device immediately." },
		},
		required: ["device_id", "play"],
		additionalProperties: false,
	},
	execute: async (input) => {
		await spotify("/me/player", {
			method: "PUT",
			body: { device_ids: [input.device_id], play: input.play },
		});
		return "Playback transferred.";
	},
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

worker.tool<{ query: string; types: string; limit: number }, string>("search", {
	title: "Search Spotify",
	description:
		'Search for tracks, artists, albums, or playlists on Spotify. Specify types as comma-separated values like "track,artist,album,playlist".',
	schema: {
		type: "object",
		properties: {
			query: { type: "string", description: "Search query." },
			types: { type: "string", description: 'Comma-separated types: "track", "artist", "album", "playlist". Use "track" for just tracks.' },
			limit: { type: "number", description: "Max results per type (1-10)." },
		},
		required: ["query", "types", "limit"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify("/search", {
			query: {
				q: input.query,
				type: input.types,
				limit: String(input.limit),
			},
		});
		const parts: string[] = [];
		if (data.tracks?.items?.length) {
			parts.push("Tracks:");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data.tracks.items.forEach((t: any, i: number) => parts.push(`  ${i + 1}. ${formatTrack(t)}`));
		}
		if (data.artists?.items?.length) {
			parts.push("Artists:");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data.artists.items.forEach((a: any, i: number) =>
				parts.push(`  ${i + 1}. ${a.name} [id: ${a.id}, uri: ${a.uri}, genres: ${(a.genres ?? []).join(", ")}, followers: ${a.followers?.total ?? 0}]`)
			);
		}
		if (data.albums?.items?.length) {
			parts.push("Albums:");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data.albums.items.forEach((a: any, i: number) =>
				parts.push(`  ${i + 1}. ${a.name} by ${a.artists?.map((ar: any) => ar.name).join(", ") ?? "Unknown"} (${a.release_date}) [id: ${a.id}, uri: ${a.uri}]`)
			);
		}
		if (data.playlists?.items?.length) {
			parts.push("Playlists:");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			data.playlists.items.forEach((p: any, i: number) => parts.push(`  ${i + 1}. ${formatPlaylist(p)}`));
		}
		return parts.join("\n") || "No results found.";
	},
});

// ---------------------------------------------------------------------------
// Playlist Tools
// ---------------------------------------------------------------------------

worker.tool<{ limit: number; offset: number }, string>("getMyPlaylists", {
	title: "Get My Playlists",
	description: "Get a list of the current user's playlists.",
	schema: {
		type: "object",
		properties: {
			limit: { type: "number", description: "Max playlists (1-50)." },
			offset: { type: "number", description: "Offset for pagination (start from 0)." },
		},
		required: ["limit", "offset"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify("/me/playlists", {
			query: { limit: String(input.limit), offset: String(input.offset) },
		});
		const parts: string[] = [`Total playlists: ${data.total}`];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.items ?? []).forEach((p: any, i: number) => parts.push(`${input.offset + i + 1}. ${formatPlaylist(p)}`));
		return parts.join("\n");
	},
});

worker.tool<{ playlist_id: string; limit: number; offset: number }, string>("getPlaylistTracks", {
	title: "Get Playlist Tracks",
	description: "Get the tracks in a specific playlist.",
	schema: {
		type: "object",
		properties: {
			playlist_id: { type: "string", description: "The Spotify playlist ID." },
			limit: { type: "number", description: "Max tracks (1-100)." },
			offset: { type: "number", description: "Offset for pagination (start from 0)." },
		},
		required: ["playlist_id", "limit", "offset"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/playlists/${input.playlist_id}/items`, {
			query: { limit: String(input.limit), offset: String(input.offset) },
		});
		const parts: string[] = [`Total tracks: ${data.total}`];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.items ?? []).forEach((item: any, i: number) =>
			parts.push(`${input.offset + i + 1}. ${formatTrack(item.track)} (added ${item.added_at})`)
		);
		return parts.join("\n");
	},
});

worker.tool<{ name: string; description: string; public: boolean }, string>("createPlaylist", {
	title: "Create Playlist",
	description: "Create a new Spotify playlist for the current user.",
	schema: {
		type: "object",
		properties: {
			name: { type: "string", description: "Name of the new playlist." },
			description: { type: "string", description: "Playlist description." },
			public: { type: "boolean", description: "Whether the playlist is public." },
		},
		required: ["name", "description", "public"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify("/me/playlists", {
			method: "POST",
			body: {
				name: input.name,
				description: input.description,
				public: input.public,
			},
		});
		return `Created playlist: ${formatPlaylist(data)}`;
	},
});

worker.tool<{ playlist_id: string; uris: string; position: number | null }, string>("addTracksToPlaylist", {
	title: "Add Tracks to Playlist",
	description: "Add one or more tracks to a playlist.",
	schema: {
		type: "object",
		properties: {
			playlist_id: { type: "string", description: "The playlist ID." },
			uris: { type: "string", description: 'Comma-separated Spotify track URIs (e.g. "spotify:track:xxx,spotify:track:yyy").' },
			position: nullableNumber("Position to insert the tracks at (0-based). Pass null to append."),
		},
		required: ["playlist_id", "uris", "position"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const uriList = input.uris.split(",").map((u) => u.trim());
		const body: Record<string, unknown> = { uris: uriList };
		if (input.position !== null) body.position = input.position;
		await spotify(`/playlists/${input.playlist_id}/items`, { method: "POST", body });
		return `Added ${uriList.length} track(s) to playlist.`;
	},
});

worker.tool<{ playlist_id: string; uris: string }, string>("removeTracksFromPlaylist", {
	title: "Remove Tracks from Playlist",
	description: "Remove one or more tracks from a playlist.",
	schema: {
		type: "object",
		properties: {
			playlist_id: { type: "string", description: "The playlist ID." },
			uris: { type: "string", description: "Comma-separated Spotify track URIs to remove." },
		},
		required: ["playlist_id", "uris"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const uriList = input.uris.split(",").map((u) => u.trim());
		await spotify(`/playlists/${input.playlist_id}/items`, {
			method: "DELETE",
			body: { tracks: uriList.map((uri) => ({ uri })) },
		});
		return `Removed ${uriList.length} track(s) from playlist.`;
	},
});

worker.tool<{
	playlist_id: string;
	name: string | null;
	description: string | null;
	public: boolean | null;
}, string>("updatePlaylistDetails", {
	title: "Update Playlist Details",
	description: "Change the name, description, or visibility of a playlist. Pass null for fields you don't want to change.",
	schema: {
		type: "object",
		properties: {
			playlist_id: { type: "string", description: "The playlist ID." },
			name: nullableString("New name. Pass null to keep current."),
			description: nullableString("New description. Pass null to keep current."),
			public: nullableBoolean("Public visibility. Pass null to keep current."),
		},
		required: ["playlist_id", "name", "description", "public"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const body: Record<string, unknown> = {};
		if (input.name !== null) body.name = input.name;
		if (input.description !== null) body.description = input.description;
		if (input.public !== null) body.public = input.public;
		await spotify(`/playlists/${input.playlist_id}`, { method: "PUT", body });
		return "Playlist updated.";
	},
});

// ---------------------------------------------------------------------------
// Library Tools
// ---------------------------------------------------------------------------

worker.tool<{ limit: number; offset: number }, string>("getSavedTracks", {
	title: "Get Saved Tracks (Liked Songs)",
	description: "Get the user's saved/liked tracks.",
	schema: {
		type: "object",
		properties: {
			limit: { type: "number", description: "Max tracks (1-50)." },
			offset: { type: "number", description: "Offset for pagination (start from 0)." },
		},
		required: ["limit", "offset"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify("/me/tracks", {
			query: { limit: String(input.limit), offset: String(input.offset) },
		});
		const parts: string[] = [`Total saved tracks: ${data.total}`];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.items ?? []).forEach((item: any, i: number) =>
			parts.push(`${input.offset + i + 1}. ${formatTrack(item.track)} (saved ${item.added_at})`)
		);
		return parts.join("\n");
	},
});

worker.tool<{ ids: string }, string>("saveTracks", {
	title: "Save Tracks (Like)",
	description: "Save/like one or more tracks to the user's library.",
	schema: {
		type: "object",
		properties: {
			ids: { type: "string", description: "Comma-separated Spotify track IDs to save." },
		},
		required: ["ids"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const idList = input.ids.split(",").map((id) => id.trim());
		await spotify("/me/tracks", { method: "PUT", body: { ids: idList } });
		return `Saved ${idList.length} track(s).`;
	},
});

worker.tool<{ ids: string }, string>("removeSavedTracks", {
	title: "Remove Saved Tracks (Unlike)",
	description: "Remove/unlike one or more tracks from the user's library.",
	schema: {
		type: "object",
		properties: {
			ids: { type: "string", description: "Comma-separated Spotify track IDs to remove." },
		},
		required: ["ids"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const idList = input.ids.split(",").map((id) => id.trim());
		await spotify("/me/tracks", { method: "DELETE", body: { ids: idList } });
		return `Removed ${idList.length} track(s).`;
	},
});

// ---------------------------------------------------------------------------
// Discovery & Info Tools
// ---------------------------------------------------------------------------

worker.tool<{ type: string; time_range: string; limit: number }, string>("getTopItems", {
	title: "Get Top Tracks or Artists",
	description: "Get the user's top tracks or artists based on listening history.",
	schema: {
		type: "object",
		properties: {
			type: { type: "string", description: '"tracks" or "artists".' },
			time_range: { type: "string", description: '"short_term" (last ~4 weeks), "medium_term" (last ~6 months), or "long_term" (all time).' },
			limit: { type: "number", description: "Max results (1-50)." },
		},
		required: ["type", "time_range", "limit"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/me/top/${input.type}`, {
			query: { time_range: input.time_range, limit: String(input.limit) },
		});
		const parts: string[] = [`Top ${input.type} (${input.time_range}):`];
		if (input.type === "tracks") {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(data.items ?? []).forEach((t: any, i: number) => parts.push(`${i + 1}. ${formatTrack(t)}`));
		} else {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(data.items ?? []).forEach((a: any, i: number) =>
				parts.push(`${i + 1}. ${a.name} [id: ${a.id}, uri: ${a.uri}, genres: ${(a.genres ?? []).join(", ")}]`)
			);
		}
		return parts.join("\n");
	},
});

worker.tool<{ limit: number }, string>("getRecentlyPlayed", {
	title: "Get Recently Played",
	description: "Get the user's recently played tracks.",
	schema: {
		type: "object",
		properties: {
			limit: { type: "number", description: "Max tracks (1-50)." },
		},
		required: ["limit"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify("/me/player/recently-played", {
			query: { limit: String(input.limit) },
		});
		const parts: string[] = ["Recently played:"];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.items ?? []).forEach((item: any, i: number) =>
			parts.push(`${i + 1}. ${formatTrack(item.track)} (played ${item.played_at})`)
		);
		return parts.join("\n");
	},
});

worker.tool<{
	seed_tracks: string | null;
	seed_artists: string | null;
	seed_genres: string | null;
	limit: number;
}, string>("getRecommendations", {
	title: "Get Recommendations",
	description:
		'Get track recommendations based on seed tracks, artists, or genres. Provide at least one seed (up to 5 total seeds across all types). Use comma-separated values for multiple seeds. Pass null for seed types you don\'t need.',
	schema: {
		type: "object",
		properties: {
			seed_tracks: nullableString("Comma-separated Spotify track IDs to use as seeds."),
			seed_artists: nullableString("Comma-separated Spotify artist IDs to use as seeds."),
			seed_genres: nullableString('Comma-separated genre names (e.g. "pop,rock,hip-hop").'),
			limit: { type: "number", description: "Max recommendations (1-100)." },
		},
		required: ["seed_tracks", "seed_artists", "seed_genres", "limit"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const query: Record<string, string> = { limit: String(input.limit) };
		if (input.seed_tracks) query.seed_tracks = input.seed_tracks;
		if (input.seed_artists) query.seed_artists = input.seed_artists;
		if (input.seed_genres) query.seed_genres = input.seed_genres;
		const data = await spotify("/recommendations", { query });
		const parts: string[] = ["Recommendations:"];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.tracks ?? []).forEach((t: any, i: number) => parts.push(`${i + 1}. ${formatTrack(t)}`));
		return parts.join("\n");
	},
});

worker.tool<{ track_id: string }, string>("getTrack", {
	title: "Get Track Details",
	description: "Get detailed information about a specific track.",
	schema: {
		type: "object",
		properties: {
			track_id: { type: "string", description: "The Spotify track ID." },
		},
		required: ["track_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/tracks/${input.track_id}`);
		const parts = [
			formatTrack(data),
			`Album: ${data.album?.name} (${data.album?.release_date}, ${data.album?.total_tracks} tracks) [id: ${data.album?.id}]`,
			`Popularity: ${data.popularity}/100`,
			`Explicit: ${data.explicit}`,
		];
		if (data.preview_url) parts.push(`Preview: ${data.preview_url}`);
		return parts.join("\n");
	},
});

worker.tool<{ album_id: string }, string>("getAlbum", {
	title: "Get Album Details",
	description: "Get detailed information about an album and its tracks.",
	schema: {
		type: "object",
		properties: {
			album_id: { type: "string", description: "The Spotify album ID." },
		},
		required: ["album_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/albums/${input.album_id}`);
		const parts = [
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			`${data.name} by ${data.artists?.map((a: any) => a.name).join(", ") ?? "Unknown"}`,
			`Released: ${data.release_date} | ${data.total_tracks} tracks | Popularity: ${data.popularity}/100`,
			`URI: ${data.uri}`,
			`Genres: ${(data.genres ?? []).join(", ") || "none listed"}`,
			"",
			"Tracks:",
		];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.tracks?.items ?? []).forEach((t: any) =>
			parts.push(`  ${t.track_number}. ${t.name} [uri: ${t.uri}, id: ${t.id}, duration: ${t.duration_ms}ms]`)
		);
		return parts.join("\n");
	},
});

worker.tool<{ artist_id: string }, string>("getArtist", {
	title: "Get Artist Details",
	description: "Get detailed information about an artist.",
	schema: {
		type: "object",
		properties: {
			artist_id: { type: "string", description: "The Spotify artist ID." },
		},
		required: ["artist_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/artists/${input.artist_id}`);
		return [
			`${data.name}`,
			`URI: ${data.uri}`,
			`Genres: ${(data.genres ?? []).join(", ") || "none listed"}`,
			`Followers: ${data.followers?.total ?? 0}`,
			`Popularity: ${data.popularity}/100`,
		].join("\n");
	},
});

worker.tool<{ artist_id: string }, string>("getArtistTopTracks", {
	title: "Get Artist's Top Tracks",
	description: "Get the top tracks of a specific artist.",
	schema: {
		type: "object",
		properties: {
			artist_id: { type: "string", description: "The Spotify artist ID." },
		},
		required: ["artist_id"],
		additionalProperties: false,
	},
	execute: async (input) => {
		const data = await spotify(`/artists/${input.artist_id}/top-tracks`);
		const parts: string[] = ["Top tracks:"];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(data.tracks ?? []).forEach((t: any, i: number) => parts.push(`${i + 1}. ${formatTrack(t)}`));
		return parts.join("\n");
	},
});
