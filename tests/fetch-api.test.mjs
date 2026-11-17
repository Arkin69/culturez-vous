// Test d'intégration du mode API : le script tourne contre un faux serveur YouTube Data API.
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const SCRIPT = path.resolve('scripts/fetch-youtube.mjs');

// Chaîne A : 160 vidéos longues (4 pages de 50), playlist UULF disponible.
// Chaîne B : pas de playlist UULF (repli sur UU), 3 uploads dont un Short.
const A = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const B = 'UCbbbbbbbbbbbbbbbbbbbbbb';
let videosA = Array.from({ length: 160 }, (_, i) => `a${String(i).padStart(3, '0')}`);
const videosB = ['b-long', 'b-short', 'b-live'];
const calls = [];

function video(id) {
  const n = Number(id.slice(1)) || 0;
  const duration = id === 'b-short' ? 'PT45S' : id === 'b-live' ? 'P0D' : `PT${10 + (n % 30)}M`;
  return {
    id,
    snippet: {
      title: `Vidéo ${id}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1) - n * 86_400_000).toISOString(),
      liveBroadcastContent: id === 'b-live' ? 'upcoming' : 'none',
    },
    contentDetails: { duration },
    statistics: { viewCount: String(1000 + n) },
  };
}

let server;
let api;
let root;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const endpoint = url.pathname.slice(1);
    calls.push(`${endpoint}:${url.searchParams.get('playlistId') ?? ''}:${url.searchParams.get('pageToken') ?? '0'}`);
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.searchParams.get('key') !== 'test-key') return json(403, { error: { errors: [{ reason: 'keyInvalid' }] } });
    if (endpoint === 'channels') {
      const ids = url.searchParams.get('id')?.split(',') ?? [];
      return json(200, {
        items: ids.map((id) => ({
          id,
          snippet: { title: `Chaîne ${id}`, customUrl: `@${id.slice(0, 6)}`, publishedAt: '2014-03-01T00:00:00Z', thumbnails: { medium: { url: `https://img/${id}` } } },
          statistics: { subscriberCount: '12345', videoCount: '99' },
        })),
      });
    }
    if (endpoint === 'playlistItems') {
      const pl = url.searchParams.get('playlistId');
      if (pl === `UULF${B.slice(2)}`) return json(404, { error: { errors: [{ reason: 'playlistNotFound' }] } });
      const ids = pl === `UULF${A.slice(2)}` ? videosA : pl === `UU${B.slice(2)}` ? videosB : [];
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const page = ids.slice(start, start + 50);
      return json(200, {
        items: page.map((videoId) => ({ contentDetails: { videoId } })),
        ...(start + 50 < ids.length && { nextPageToken: String(start + 50) }),
      });
    }
    if (endpoint === 'videos') {
      return json(200, { items: url.searchParams.get('id').split(',').map(video) });
    }
    json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${server.address().port}`;

  root = await mkdtemp(path.join(tmpdir(), 'culturez-'));
  await mkdir(path.join(root, 'src/content/creators'), { recursive: true });
  await mkdir(path.join(root, 'src/data/videos'), { recursive: true });
  await writeFile(path.join(root, 'src/content/creators/chaine-a.md'), `---\nname: "A"\nhandle: "@a"\nchannelId: ${A}\n---\n`);
  await writeFile(path.join(root, 'src/content/creators/chaine-b.md'), `---\nname: "B"\nhandle: "@b"\nchannelId: ${B}\n---\n`);
});

afterAll(async () => {
  server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

const fetchData = (...args) =>
  run('node', [SCRIPT, ...args], { env: { ...process.env, CULTUREZ_ROOT: root, YOUTUBE_API_URL: api, YOUTUBE_API_KEY: 'test-key' } });
const readVideos = async (slug) => JSON.parse(await readFile(path.join(root, `src/data/videos/${slug}.json`), 'utf8'));

describe('fetch-youtube en mode API', () => {
  it('récupère le catalogue complet, pagine, et se replie sur les uploads sans les Shorts', async () => {
    const { stdout } = await fetchData();
    expect(stdout).toContain('Mode API YouTube');

    const a = await readVideos('chaine-a');
    expect(a.complete).toBe(true);
    expect(a.videos).toHaveLength(160);
    expect(a.videos[0]).toEqual({ id: 'a000', t: 'Vidéo a000', d: '2026-01-01', s: 600, v: 1000 });

    const b = await readVideos('chaine-b');
    expect(b.videos.map((v) => v.id)).toEqual(['b-long']);

    const channels = JSON.parse(await readFile(path.join(root, 'src/data/channels.json'), 'utf8'));
    expect(channels['chaine-a']).toMatchObject({ id: A, subscribers: 12345, videoCount: 99, publishedAt: '2014-03-01', source: 'api' });
  });

  it('en incrémental, s’arrête après la première page déjà connue et ajoute les nouveautés', async () => {
    videosA = ['a-new', ...videosA];
    calls.length = 0;
    await fetchData('--only', 'chaine-a');
    const pages = calls.filter((c) => c.startsWith('playlistItems'));
    // Page 1 : une nouveauté + 49 connues ; page 2 : toutes connues → arrêt (pas de page 3 ni 4).
    expect(pages).toEqual([`playlistItems:UULF${A.slice(2)}:0`, `playlistItems:UULF${A.slice(2)}:50`]);
    const a = await readVideos('chaine-a');
    expect(a.videos).toHaveLength(161);
    expect(a.videos.some((v) => v.id === 'a-new')).toBe(true);
  });
});
