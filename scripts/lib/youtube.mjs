// Fonctions pures utilisées par scripts/fetch-youtube.mjs (testées dans tests/youtube.test.mjs).

/** Durée ISO 8601 de l'API YouTube (« PT1H2M3S », « P1DT2H ») → secondes. */
export function parseIsoDuration(iso) {
  if (typeof iso !== 'string') return 0;
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, s = 0] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** « 1,52 M d’abonnés », « 35,8 k abonnés », « 965 vidéos » → nombre approché. */
export function parseFrenchCount(text) {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/[‎‏⁦-⁩  ]/g, ' ');
  const m = clean.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(k|M|Md|G)?\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const mult = unit === 'k' ? 1e3 : unit === 'm' ? 1e6 : unit === 'md' || unit === 'g' ? 1e9 : 1;
  return Math.round(n * mult);
}

/** ID de chaîne « UCxxxx » → playlist des vidéos longues (sans Shorts ni lives) « UULFxxxx ». */
export function longFormPlaylistId(channelId) {
  return `UULF${channelId.slice(2)}`;
}

/** ID de chaîne « UCxxxx » → playlist de tous les uploads « UUxxxx ». */
export function uploadsPlaylistId(channelId) {
  return `UU${channelId.slice(2)}`;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return XML_ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Flux Atom/RSS YouTube → vidéos compactes { id, t, d, s, v } (pas de durée dans le flux : s = 0). */
export function parseFeed(xml) {
  const videos = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const views = entry.match(/<media:statistics views="(\d+)"/)?.[1];
    if (!id || !title || !published) continue;
    videos.push({ id, t: decodeXml(title.trim()), d: published.slice(0, 10), s: 0, v: views ? Number(views) : 0 });
  }
  return videos;
}

/** Page HTML d'une chaîne → métadonnées (sans clé API). */
export function parseChannelPage(html, handle) {
  const strip = (s) => s?.replace(/[‎‏⁦-⁩]/g, '');
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ?? null;
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const avatar = html.match(/<meta property="og:image" content="([^"]*)"/)?.[1];
  const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1];
  const vanity = html.match(/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/)?.[1];
  const ownHandle = vanity ?? handle ?? null;
  // En-tête de la chaîne (pageHeaderViewModel) : metadataRows = [@handle] puis [« X abonnés », « Y vidéos »].
  let subText;
  let videoText;
  for (const m of html.matchAll(/"pageHeaderViewModel"/g)) {
    const region = html.slice(m.index, m.index + 12000);
    const rows = region.indexOf('"contentMetadataViewModel":{"metadataRows"');
    if (rows < 0) continue;
    const header = region.slice(rows, rows + 3000);
    subText = header.match(/"content":"([^"]{0,60}abonné[^"]{0,4})"/)?.[1];
    videoText = header.match(/"content":"([^"]{0,30}vidéo[^"]{0,4})"/)?.[1];
    if (subText) break;
  }
  return {
    id,
    title: title ? decodeXml(title) : null,
    handle: ownHandle ? decodeURIComponent(ownHandle) : null,
    avatar: avatar ? avatar.replace(/=s\d+-/, '=s240-') : null,
    description: description ? decodeXml(description) : null,
    subscribers: subText ? parseFrenchCount(strip(subText).split('•').pop()) : null,
    videoCount: videoText ? parseFrenchCount(strip(videoText)) : null,
  };
}

/** « 1:02:03 » ou « 41:10 » → secondes (0 si le texte n'est pas une durée). */
export function parseClock(text) {
  if (typeof text !== 'string' || !/^\d{1,2}(:\d{2}){1,2}$/.test(text.trim())) return 0;
  return text.trim().split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** Onglet « Vidéos » d'une chaîne → durées des ~30 dernières vidéos longues : Map(id → secondes). */
export function parseVideosTabDurations(html) {
  const durations = new Map();
  const json = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)?.[1];
  if (!json) return durations;
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return durations;
  }
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    const lockup = node.lockupViewModel;
    if (lockup?.contentId && lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
      const texts = JSON.stringify(lockup.contentImage ?? {}).match(/"text":"([^"]+)"/g) ?? [];
      for (const t of texts) {
        const s = parseClock(t.slice(8, -1));
        if (s > 0) {
          durations.set(lockup.contentId, s);
          break;
        }
      }
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
  }
  return durations;
}

/** Réponse videos.list de l'API → vidéo compacte, ou null si à exclure (live, à venir, Short). */
export function apiItemToVideo(item, { minSeconds = 0 } = {}) {
  const live = item.snippet?.liveBroadcastContent;
  if (live === 'live' || live === 'upcoming') return null;
  const s = parseIsoDuration(item.contentDetails?.duration);
  if (s === 0 || s <= minSeconds) return null;
  return {
    id: item.id,
    t: item.snippet?.title ?? '',
    d: (item.snippet?.publishedAt ?? '').slice(0, 10),
    s,
    v: Number(item.statistics?.viewCount ?? 0),
  };
}

/** Fusionne d'anciennes et de nouvelles vidéos (les nouvelles l'emportent), triées de la plus récente à la plus ancienne. */
export function mergeVideos(previous, incoming) {
  const byId = new Map(previous.map((v) => [v.id, v]));
  for (const v of incoming) {
    const old = byId.get(v.id);
    // Le flux RSS ne donne pas la durée : on garde celle déjà connue.
    byId.set(v.id, old && v.s === 0 && old.s > 0 ? { ...v, s: old.s } : v);
  }
  return sortVideos([...byId.values()]);
}

export function sortVideos(videos) {
  return videos.sort((a, b) => (a.d === b.d ? a.id.localeCompare(b.id) : b.d.localeCompare(a.d)));
}

/** Extrait les champs utiles du frontmatter d'une fiche (YAML simple, une clé par ligne). */
export function readFrontmatterFields(markdown, fields) {
  const fm = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const out = {};
  for (const f of fields) {
    const m = fm.match(new RegExp(`^${f}:\\s*(.*)$`, 'm'));
    if (!m) continue;
    const raw = m[1].replace(/\s+#.*$/, '').trim();
    out[f] = raw.replace(/^["'](.*)["']$/, '$1') || undefined;
  }
  return out;
}

/** Découpe un tableau en paquets de taille n. */
export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
