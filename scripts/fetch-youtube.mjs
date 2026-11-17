#!/usr/bin/env node
// Met à jour src/data/channels.json et src/data/videos/<slug>.json à partir de YouTube.
//
//   node scripts/fetch-youtube.mjs                 → API si YOUTUBE_API_KEY est défini, sinon mode sans clé (RSS)
//   node scripts/fetch-youtube.mjs --full          → API : relit toutes les playlists (pas d'incrémental)
//   node scripts/fetch-youtube.mjs --only a,b      → seulement ces fiches (slugs)
//   node scripts/fetch-youtube.mjs --mode rss      → force le mode sans clé
//
// Mode API (YouTube Data API v3) : catalogue complet, durées et vues. Coût ≈ 1 unité par tranche
// de 50 vidéos, très en dessous du quota gratuit de 10 000 unités par jour.
// Mode sans clé : page de la chaîne (ID, avatar, abonnés) + flux RSS des 15 dernières vidéos longues.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  apiItemToVideo,
  chunk,
  longFormPlaylistId,
  mergeVideos,
  parseChannelPage,
  parseFeed,
  parseVideosTabDurations,
  readFrontmatterFields,
  sortVideos,
  uploadsPlaylistId,
} from './lib/youtube.mjs';

// CULTUREZ_ROOT et YOUTUBE_API_URL ne servent qu'aux tests (dossier temporaire, faux serveur d'API).
const ROOT = process.env.CULTUREZ_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CREATORS_DIR = path.join(ROOT, 'src/content/creators');
const DATA_DIR = path.join(ROOT, 'src/data');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

const API = process.env.YOUTUBE_API_URL ?? 'https://www.googleapis.com/youtube/v3';
const KEY = process.env.YOUTUBE_API_KEY?.trim();
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; culturez-vous/1.0; +https://github.com/arkin69/culturez-vous)',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  Cookie: 'CONSENT=YES+cb; SOCS=CAI',
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const MODE = option('mode') ?? (KEY ? 'api' : 'rss');
const FULL = flag('full');
const ONLY = option('only')?.split(',').map((s) => s.trim());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

class QuotaError extends Error {}

async function fetchText(url, { retries = 3 } = {}) {
  let last;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.text();
      last = new Error(`HTTP ${res.status} sur ${url}`);
      if (res.status === 404) throw last;
    } catch (e) {
      last = e;
      if (String(e.message).includes('HTTP 404')) throw e;
    }
    await sleep(1000 * 2 ** i);
  }
  throw last;
}

async function api(endpoint, params) {
  const qs = new URLSearchParams({ ...params, key: KEY });
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${API}/${endpoint}?${qs}`);
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new QuotaError('Quota YouTube épuisé');
    if (res.status === 404 || reason === 'playlistNotFound') {
      const err = new Error(`${endpoint} : introuvable`);
      err.notFound = true;
      throw err;
    }
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`${endpoint} : HTTP ${res.status} ${body?.error?.message ?? ''}`);
    }
    await sleep(1000 * 2 ** i);
  }
  throw new Error(`${endpoint} : échec après plusieurs essais`);
}

async function loadCreators() {
  const files = (await readdir(CREATORS_DIR)).filter((f) => f.endsWith('.md')).sort();
  const creators = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    if (ONLY && !ONLY.includes(slug)) continue;
    const md = await readFile(path.join(CREATORS_DIR, file), 'utf8');
    const { handle, channelId } = readFrontmatterFields(md, ['handle', 'channelId']);
    creators.push({ slug, file: path.join(CREATORS_DIR, file), handle, channelId });
  }
  return creators;
}

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Une vidéo par ligne : diffs lisibles dans git. */
function serializeVideos(data) {
  const lines = data.videos.map((v) => JSON.stringify(v));
  return `{"complete":${data.complete},"videos":[\n${lines.join(',\n')}\n]}\n`;
}

async function writeVideos(slug, data) {
  await writeFile(path.join(VIDEOS_DIR, `${slug}.json`), serializeVideos(data));
}

/** Écrit (ou corrige) le channelId dans le frontmatter de la fiche. */
async function ensureChannelId(creator, id) {
  if (!id || creator.channelId === id) return;
  let md = await readFile(creator.file, 'utf8');
  if (/^channelId:.*$/m.test(md)) md = md.replace(/^channelId:.*$/m, `channelId: ${id}`);
  else md = md.replace(/^(handle:.*)$/m, `$1\nchannelId: ${id}`);
  await writeFile(creator.file, md);
  console.log(`  ↳ channelId ${id} écrit dans ${path.basename(creator.file)}`);
  creator.channelId = id;
}

// ---------------------------------------------------------------- mode sans clé

async function updateWithoutKey(creator, channels) {
  const target = creator.channelId ? `channel/${creator.channelId}` : creator.handle;
  if (!target) throw new Error('ni handle ni channelId');
  // L'onglet « Vidéos » contient l'en-tête de la chaîne et les durées des ~30 dernières vidéos longues.
  const html = await fetchText(`https://www.youtube.com/${target}/videos?hl=fr&gl=FR`);
  const page = parseChannelPage(html, creator.handle);
  const durations = parseVideosTabDurations(html);
  if (!page.id) throw new Error(`chaîne introuvable (${target})`);
  await ensureChannelId(creator, page.id);

  const prev = channels[creator.slug] ?? {};
  channels[creator.slug] = {
    ...prev,
    id: page.id,
    title: page.title ?? prev.title,
    handle: page.handle ?? prev.handle ?? creator.handle,
    avatar: page.avatar ?? prev.avatar,
    subscribers: page.subscribers ?? prev.subscribers ?? null,
    videoCount: page.videoCount ?? prev.videoCount ?? null,
    source: prev.source === 'api' ? 'api' : 'rss',
    updatedAt: today(),
  };

  let feed = [];
  try {
    feed = parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?playlist_id=${longFormPlaylistId(page.id)}`));
  } catch {
    // Certaines chaînes n'exposent pas la playlist « vidéos longues » : on prend tout le flux.
    feed = parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${page.id}`));
  }
  for (const v of feed) v.s = durations.get(v.id) ?? 0;
  const previous = await readJson(path.join(VIDEOS_DIR, `${creator.slug}.json`), { complete: false, videos: [] });
  const videos = mergeVideos(previous.videos, feed);
  await writeVideos(creator.slug, { complete: previous.complete, videos });
  const timed = feed.filter((v) => v.s > 0).length;
  return `${videos.length} vidéos (${feed.length} via RSS, ${timed} durées)${previous.complete ? '' : ', catalogue partiel'}`;
}

// ---------------------------------------------------------------- mode API

async function fetchChannelsMeta(creators) {
  const byId = new Map();
  const withId = creators.filter((c) => c.channelId);
  for (const ids of chunk(withId.map((c) => c.channelId), 50)) {
    const res = await api('channels', { part: 'snippet,statistics,brandingSettings', id: ids.join(','), maxResults: 50 });
    for (const item of res.items ?? []) byId.set(item.id, item);
  }
  for (const c of creators.filter((c) => !c.channelId && c.handle)) {
    const res = await api('channels', { part: 'snippet,statistics,brandingSettings', forHandle: c.handle });
    const item = res.items?.[0];
    if (item) {
      byId.set(item.id, item);
      await ensureChannelId(c, item.id);
    }
  }
  return byId;
}

async function listPlaylist(playlistId, known) {
  const ids = [];
  let pageToken;
  do {
    const res = await api('playlistItems', { part: 'contentDetails', playlistId, maxResults: 50, ...(pageToken && { pageToken }) });
    const pageIds = (res.items ?? []).map((it) => it.contentDetails?.videoId).filter(Boolean);
    ids.push(...pageIds);
    // Incrémental : on s'arrête après une page entièrement déjà connue.
    if (known && pageIds.length && pageIds.every((id) => known.has(id))) break;
    pageToken = res.nextPageToken;
  } while (pageToken);
  return ids;
}

async function updateWithApi(creator, channels, meta) {
  const item = meta.get(creator.channelId);
  if (!item) throw new Error(`chaîne ${creator.channelId ?? creator.handle} introuvable via l'API`);
  const prev = channels[creator.slug] ?? {};
  const thumbs = item.snippet?.thumbnails ?? {};
  channels[creator.slug] = {
    id: item.id,
    title: item.snippet?.title ?? prev.title,
    handle: item.snippet?.customUrl ? `@${item.snippet.customUrl.replace(/^@/, '')}` : prev.handle,
    avatar: thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? prev.avatar,
    banner: item.brandingSettings?.image?.bannerExternalUrl ?? prev.banner,
    subscribers: item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? 0),
    videoCount: Number(item.statistics?.videoCount ?? 0),
    publishedAt: item.snippet?.publishedAt?.slice(0, 10) ?? prev.publishedAt,
    source: 'api',
    updatedAt: today(),
  };

  const previous = await readJson(path.join(VIDEOS_DIR, `${creator.slug}.json`), { complete: false, videos: [] });
  const known = previous.complete && !FULL ? new Set(previous.videos.map((v) => v.id)) : null;

  let minSeconds = 0;
  let ids;
  try {
    ids = await listPlaylist(longFormPlaylistId(item.id), known);
  } catch (e) {
    if (!e.notFound) throw e;
    // Repli : tous les uploads, en excluant les vidéos de 3 min ou moins (Shorts probables).
    minSeconds = 180;
    ids = await listPlaylist(uploadsPlaylistId(item.id), known);
  }

  // On rafraîchit aussi les vues et titres des vidéos déjà connues.
  const allIds = [...new Set([...ids, ...(known ? previous.videos.map((v) => v.id) : [])])];
  const fresh = [];
  for (const batch of chunk(allIds, 50)) {
    const res = await api('videos', { part: 'snippet,contentDetails,statistics', id: batch.join(','), maxResults: 50 });
    for (const it of res.items ?? []) {
      const v = apiItemToVideo(it, { minSeconds });
      if (v) fresh.push(v);
    }
  }
  // Les vidéos supprimées ou passées en privé disparaissent naturellement (absentes de videos.list).
  await writeVideos(creator.slug, { complete: true, videos: sortVideos(fresh) });
  return `${fresh.length} vidéos (${known ? `${ids.length} ids parcourus, incrémental` : 'catalogue complet'})`;
}

// ---------------------------------------------------------------- main

async function main() {
  if (MODE === 'api' && !KEY) {
    console.error('YOUTUBE_API_KEY manquant : utilisez --mode rss ou définissez la clé.');
    process.exit(1);
  }
  const creators = await loadCreators();
  const channels = await readJson(CHANNELS_FILE, {});
  console.log(`Mode ${MODE === 'api' ? 'API YouTube' : 'sans clé (RSS)'} · ${creators.length} vulgarisateurs${FULL ? ' · complet' : ''}`);

  let meta = new Map();
  if (MODE === 'api') meta = await fetchChannelsMeta(creators);

  const failures = [];
  for (const creator of creators) {
    try {
      const summary = MODE === 'api' ? await updateWithApi(creator, channels, meta) : await updateWithoutKey(creator, channels);
      console.log(`✓ ${creator.slug} : ${summary}`);
    } catch (e) {
      if (e instanceof QuotaError) {
        console.error(`✗ ${e.message} : arrêt, les données déjà récupérées sont conservées.`);
        failures.push(creator.slug);
        break;
      }
      console.error(`✗ ${creator.slug} : ${e.message}`);
      failures.push(creator.slug);
    }
    if (MODE === 'rss') await sleep(800);
  }

  // Les fiches supprimées disparaissent aussi des données.
  if (!ONLY) {
    const slugs = new Set(creators.map((c) => c.slug));
    for (const slug of Object.keys(channels)) if (!slugs.has(slug)) delete channels[slug];
  }
  const sorted = Object.fromEntries(Object.entries(channels).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(CHANNELS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);

  if (failures.length) {
    console.error(`\n${failures.length} échec(s) : ${failures.join(', ')}`);
    // On n'échoue que si tout a échoué : une chaîne en erreur ne doit pas bloquer le déploiement.
    if (failures.length === creators.length) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
