# Spotify → Notion Agent Tools

A [Notion Worker](https://developers.notion.com/docs/workers) that gives your Notion AI agents full control over Spotify — playback, playlists, library, search, and music discovery, all through natural language.

![Notion Workers Alpha](https://img.shields.io/badge/Notion%20Workers-alpha-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## What It Does

This worker registers **31 agent tools** that a Notion Custom Agent can call to interact with the Spotify Web API on your behalf. Ask your agent things like:

- *"Play my Discover Weekly playlist"*
- *"What's currently playing?"*
- *"Create a playlist called Road Trip and add my top tracks from the last 6 months"*
- *"Skip this song and turn on shuffle"*
- *"Search for lo-fi hip hop playlists"*
- *"Show me my recently played tracks"*

### Tool Reference

#### Playback Control (11 tools)
| Tool | What It Does |
|------|-------------|
| `getPlaybackState` | Current playback state, device, shuffle/repeat status, progress |
| `getCurrentlyPlaying` | Currently playing track details |
| `play` | Start or resume playback, optionally with a specific context or tracks |
| `pause` | Pause playback |
| `skipToNext` | Skip to next track |
| `skipToPrevious` | Skip to previous track |
| `seek` | Seek to a specific position in the current track |
| `setVolume` | Set volume (0–100%) |
| `setShuffle` | Toggle shuffle on/off |
| `setRepeat` | Set repeat mode (track, context, or off) |
| `addToQueue` | Add a track or episode to the playback queue |

#### Device Management (2 tools)
| Tool | What It Does |
|------|-------------|
| `getDevices` | List all available Spotify devices |
| `transferPlayback` | Move playback to a different device |

#### Queue (1 tool)
| Tool | What It Does |
|------|-------------|
| `getQueue` | View the current playback queue (up to 20 items) |

#### Search (1 tool)
| Tool | What It Does |
|------|-------------|
| `search` | Search Spotify for tracks, artists, albums, or playlists |

#### Playlist Management (6 tools)
| Tool | What It Does |
|------|-------------|
| `getMyPlaylists` | List your playlists |
| `getPlaylistTracks` | Get tracks from a specific playlist |
| `createPlaylist` | Create a new playlist |
| `addTracksToPlaylist` | Add tracks to a playlist |
| `removeTracksFromPlaylist` | Remove tracks from a playlist |
| `updatePlaylistDetails` | Update a playlist's name, description, or visibility |

#### Library (3 tools)
| Tool | What It Does |
|------|-------------|
| `getSavedTracks` | Get your liked/saved tracks |
| `saveTracks` | Like/save tracks to your library |
| `removeSavedTracks` | Remove tracks from your library |

#### Discovery & Info (7 tools)
| Tool | What It Does |
|------|-------------|
| `getTopItems` | Your top tracks or artists (short/medium/long-term) |
| `getRecentlyPlayed` | Recently played tracks |
| `getRecommendations` | Get recommendations based on seed tracks, artists, or genres |
| `getTrack` | Detailed track info (artists, album, duration, popularity) |
| `getAlbum` | Album details and full tracklist |
| `getArtist` | Artist details (genres, followers, popularity) |
| `getArtistTopTracks` | An artist's top tracks |

## Prerequisites

- A **Notion workspace** with access to [Notion Custom Agents](https://www.notion.so/?target=ai) (requires workspace admin opt-in)
- A **Spotify account** (free or premium) and a [Spotify Developer App](https://developer.spotify.com/dashboard)
- **Spotify Premium** is required for playback control tools (play, pause, skip, volume, etc.) — library and search tools work with free accounts
- **Node.js 22+** and **npm 10.9.2+**
- The **`ntn` CLI** (Notion's worker management tool)

## Quick Start

### 1. Install the NTN CLI

```shell
npm i -g ntn
ntn login
```

### 2. Clone and install

```shell
git clone https://github.com/sbcatania/notion-worker-spotify.git
cd notion-worker-spotify
npm install
```

### 3. Create a Spotify Developer App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Give it a name and description
4. Note your **Client ID** and **Client Secret**
5. You'll add the redirect URI after deploying (step 5)

### 4. Configure secrets

```shell
ntn workers env set SPOTIFY_CLIENT_ID=your-client-id
ntn workers env set SPOTIFY_CLIENT_SECRET=your-client-secret
```

For local development:

```shell
ntn workers env pull
```

### 5. Deploy and connect OAuth

```shell
# Deploy the worker
ntn workers deploy

# Get your OAuth redirect URL
ntn workers oauth show-redirect-url
```

Copy the redirect URL and add it to your Spotify app's **Redirect URIs** in the [Developer Dashboard](https://developer.spotify.com/dashboard).

Then start the OAuth flow to connect your Spotify account:

```shell
ntn workers oauth start spotifyAuth
```

### 6. Add tools to your Notion agent

In Notion, open your Custom Agent settings and add the Spotify tools. Your agent can now control Spotify through natural language.

### Spotify OAuth Scopes

The worker requests these scopes to cover all 31 tools:

| Scope | Used By |
|-------|---------|
| `user-read-playback-state` | Playback state, devices, queue |
| `user-modify-playback-state` | Play, pause, skip, volume, shuffle, repeat, queue |
| `user-read-currently-playing` | Currently playing track |
| `user-read-recently-played` | Recently played tracks |
| `user-top-read` | Top tracks and artists |
| `user-library-read` | Saved/liked tracks |
| `user-library-modify` | Save/remove tracks |
| `playlist-read-private` | List private playlists |
| `playlist-read-collaborative` | List collaborative playlists |
| `playlist-modify-public` | Create/modify public playlists |
| `playlist-modify-private` | Create/modify private playlists |
| `streaming` | Playback control |

## Customizing with AI Coding Agents

This project is designed to be easy to fork and modify using AI coding tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [OpenAI Codex](https://openai.com/index/codex/), [GitHub Copilot](https://github.com/features/copilot), or similar.

### Getting started with an agent

1. Fork this repo
2. Open it in your preferred AI coding environment
3. The `AGENTS.md` file (symlinked from `.agents/INSTRUCTIONS.md`) provides project context that Claude Code, Codex, and other agents will pick up automatically
4. The `.examples/` directory contains patterns for each capability type

### Common modifications to ask your agent for

- **Add new tools** — "Add a tool to get the audio features (danceability, energy, tempo) for a track"
- **Playlist automation** — "Create a tool that builds a playlist from my top 50 tracks of the last month"
- **Playback rules** — "Add a tool that crossfades to the next track after 30 seconds"
- **Social features** — "Add a tool to follow/unfollow an artist"
- **Podcast support** — "Add tools to search for and play podcast episodes"
- **Now Playing display** — "Create a sync that writes the currently playing track to a Notion database every 5 minutes"
- **Listening history** — "Add a sync that logs all my recently played tracks to a Notion database"

### Project structure at a glance

```
src/index.ts          <- All 31 tool definitions + OAuth config (single file)
.agents/              <- Agent instructions (auto-loaded by Claude Code)
.examples/            <- SDK usage patterns (sync, tool, OAuth, automation)
.env.example          <- Required environment variables
workers.json          <- NTN CLI configuration (git-ignored)
```

The entire worker is a single `src/index.ts` file (~860 lines). Each tool is self-contained with its own schema, Spotify API call, and response formatting.

## How It Works

The worker uses the [Spotify Web API](https://developer.spotify.com/documentation/web-api) via OAuth 2.0 for user authorization. Each tool:

1. Gets the user's OAuth access token
2. Makes an authenticated request to the Spotify API
3. Returns formatted results to the Notion agent

The Notion Workers runtime handles OAuth token refresh, tool registration, and agent communication.

### Spotify API Endpoints Used

| Category | Endpoints |
|----------|-----------|
| **Playback** | `GET/PUT /me/player`, `POST /me/player/next`, `POST /me/player/previous`, `PUT /me/player/seek`, `PUT /me/player/volume`, `PUT /me/player/shuffle`, `PUT /me/player/repeat`, `POST /me/player/queue` |
| **Devices** | `GET /me/player/devices`, `PUT /me/player` |
| **Queue** | `GET /me/player/queue` |
| **Search** | `GET /search` |
| **Playlists** | `GET/POST /me/playlists`, `GET/POST/DELETE /playlists/{id}/items`, `PUT /playlists/{id}` |
| **Library** | `GET/PUT/DELETE /me/tracks` |
| **Discovery** | `GET /me/top/{type}`, `GET /me/player/recently-played`, `GET /recommendations` |
| **Info** | `GET /tracks/{id}`, `GET /albums/{id}`, `GET /artists/{id}`, `GET /artists/{id}/top-tracks` |

## Development

```shell
# Type-check
npm run check

# Build
npm run build

# Test a tool locally (requires .env with OAuth tokens)
ntn workers exec getDevices --local

# View recent runs
ntn workers runs list

# Get logs for a specific run
ntn workers runs logs <runId>
```

## Links & References

- **Spotify Web API Documentation** — https://developer.spotify.com/documentation/web-api
- **Spotify Developer Dashboard** — https://developer.spotify.com/dashboard
- **Spotify API Reference** — https://developer.spotify.com/documentation/web-api/reference
- **Spotify OAuth Guide** — https://developer.spotify.com/documentation/web-api/concepts/authorization
- **Notion Workers Documentation** — https://developers.notion.com/docs/workers
- **NTN CLI** — `npm i -g ntn` ([docs](https://developers.notion.com/docs/workers))
- **Notion Developer Slack** — [Join here](https://join.slack.com/t/notiondevs/shared_invite/zt-3r1aq1t1s-hM2har7iqfOfHJRrH9PHww)
- **Notion Workers SDK** — `@notionhq/workers` ([npm](https://www.npmjs.com/package/@notionhq/workers))

## Note on Availability

Notion Workers is currently in **alpha**. The tool and OAuth capabilities used by this worker are **generally available** to anyone with access to Notion Custom Agents. The SDK and CLI may have breaking changes. See `README.ntn.md` in this repo for the latest Notion Workers SDK documentation.

## License

MIT
