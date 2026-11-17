import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  apiItemToVideo,
  chunk,
  decodeXml,
  longFormPlaylistId,
  mergeVideos,
  parseChannelPage,
  parseClock,
  parseFeed,
  parseFrenchCount,
  parseIsoDuration,
  parseVideosTabDurations,
  readFrontmatterFields,
  uploadsPlaylistId,
} from '../scripts/lib/youtube.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseIsoDuration', () => {
  it.each([
    ['PT41M10S', 2470],
    ['PT58S', 58],
    ['PT2H3M4S', 7384],
    ['PT1H', 3600],
    ['P1DT2H', 93600],
    ['P0D', 0],
    ['n importe quoi', 0],
    [undefined, 0],
  ])('%s → %i s', (iso, expected) => expect(parseIsoDuration(iso)).toBe(expected));
});

describe('parseFrenchCount', () => {
  it.each([
    ['1,52 M d’abonnés', 1_520_000],
    ['35,8 k abonnés', 35_800],
    ['⁨965 vidéos⁩', 965],
    ['1 300 vidéos', 1300],
    ['1 abonné', 1],
    ['aucun', null],
  ])('%s → %s', (text, expected) => expect(parseFrenchCount(text)).toBe(expected));
});

describe('parseClock', () => {
  it.each([
    ['41:10', 2470],
    ['1:02:03', 3723],
    ['0:59', 59],
    ['EN DIRECT', 0],
    ['12', 0],
  ])('%s → %i s', (text, expected) => expect(parseClock(text)).toBe(expected));
});

describe('playlists', () => {
  it('dérive les playlists « vidéos longues » et « uploads » de l’ID de chaîne', () => {
    expect(longFormPlaylistId('UCaNlbnghtwlsGF-KzAFThqA')).toBe('UULFaNlbnghtwlsGF-KzAFThqA');
    expect(uploadsPlaylistId('UCaNlbnghtwlsGF-KzAFThqA')).toBe('UUaNlbnghtwlsGF-KzAFThqA');
  });
});

describe('parseFeed', () => {
  it('extrait les vidéos et décode les entités XML', () => {
    const videos = parseFeed(fixture('feed.xml'));
    expect(videos).toEqual([
      { id: '5cT_0Pc1ZuY', t: "Le jeu le plus complexe de l'humanité & ses secrets !", d: '2026-11-13', s: 0, v: 584190 },
      { id: 'Snx21UqMF6Y', t: 'Les monstres marins les plus effrayants !', d: '2026-10-30', s: 0, v: 0 },
    ]);
  });

  it('decodeXml gère les entités nommées et numériques', () => {
    expect(decodeXml('a &amp; b &#39;c&#39; &#x2014; &quot;d&quot;')).toBe('a & b \'c\' — "d"');
  });
});

describe('apiItemToVideo (réponse simulée de videos.list)', () => {
  const items = JSON.parse(fixture('api-videos.json')).items;

  it('convertit une vidéo normale', () => {
    expect(apiItemToVideo(items[0])).toEqual({
      id: 'HJFk7D5Vufc',
      t: "L'IA va-t-elle tuer les maths ?",
      d: '2026-10-08',
      s: 2470,
      v: 688781,
    });
  });

  it('exclut les premières à venir et les durées nulles', () => {
    expect(apiItemToVideo(items[2])).toBeNull();
  });

  it('en mode repli, exclut les vidéos de 3 min ou moins (Shorts probables)', () => {
    expect(apiItemToVideo(items[1])).not.toBeNull();
    expect(apiItemToVideo(items[1], { minSeconds: 180 })).toBeNull();
    expect(apiItemToVideo(items[3], { minSeconds: 180 })?.s).toBe(7384);
  });
});

describe('mergeVideos', () => {
  it('garde la durée connue quand le flux RSS ne la donne pas, et trie par date', () => {
    const previous = [{ id: 'a', t: 'Ancien titre', d: '2026-01-01', s: 600, v: 10 }];
    const incoming = [
      { id: 'a', t: 'Nouveau titre', d: '2026-01-01', s: 0, v: 50 },
      { id: 'b', t: 'Nouvelle vidéo', d: '2026-02-01', s: 0, v: 5 },
    ];
    expect(mergeVideos(previous, incoming)).toEqual([
      { id: 'b', t: 'Nouvelle vidéo', d: '2026-02-01', s: 0, v: 5 },
      { id: 'a', t: 'Nouveau titre', d: '2026-01-01', s: 600, v: 50 },
    ]);
  });
});

describe('pages de chaîne (sans clé)', () => {
  const header = (rows) =>
    `"pageHeaderViewModel":{"title":{},"metadata":{"contentMetadataViewModel":{"metadataRows":${JSON.stringify(rows)}}}}`;
  const html = [
    '<link rel="canonical" href="https://www.youtube.com/channel/UCWnfDPdZw6A23UtuBpYBbAg">',
    '<meta property="og:title" content="Dr Nozman">',
    '<meta property="og:image" content="https://yt3.googleusercontent.com/abc=s900-c-k-c0x00ffffff-no-rj">',
    '"vanityChannelUrl":"http://www.youtube.com/@DrNozman"',
    // Une carte vidéo ailleurs dans la page, qui ne doit pas être prise pour l'en-tête :
    '"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"584 k vues"}}]}]}',
    header([
      { metadataParts: [{ text: { content: '@DrNozman' } }] },
      { metadataParts: [{ text: { content: '⁨‎4,93 M d’abonnés⁩' } }, { text: { content: '965 vidéos' } }] },
    ]),
  ].join('\n');

  it('extrait ID, nom, handle, avatar, abonnés et nombre de vidéos', () => {
    expect(parseChannelPage(html, '@DrNozman')).toMatchObject({
      id: 'UCWnfDPdZw6A23UtuBpYBbAg',
      title: 'Dr Nozman',
      handle: '@DrNozman',
      avatar: 'https://yt3.googleusercontent.com/abc=s240-c-k-c0x00ffffff-no-rj',
      subscribers: 4_930_000,
      videoCount: 965,
    });
  });

  it('lit les durées de l’onglet « Vidéos »', () => {
    const data = {
      contents: [
        { lockupViewModel: { contentId: 'vid1', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentImage: { badge: { text: '41:10' } } } },
        { lockupViewModel: { contentId: 'vid2', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO', contentImage: { badges: [{ text: 'NOUVEAU' }, { text: '1:02:03' }] } } },
        { lockupViewModel: { contentId: 'pl1', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST', contentImage: { badge: { text: '12:00' } } } },
      ],
    };
    const page = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
    expect([...parseVideosTabDurations(page)]).toEqual(expect.arrayContaining([['vid1', 2470], ['vid2', 3723]]));
    expect(parseVideosTabDurations(page).has('pl1')).toBe(false);
  });
});

describe('readFrontmatterFields', () => {
  it('lit les champs simples du frontmatter', () => {
    const md = '---\nname: "Micmaths"\nhandle: "@Micmaths"\nchannelId: UC4PasDd25MXqlXBogBw9CAg # vérifié\n---\nCorps';
    expect(readFrontmatterFields(md, ['handle', 'channelId', 'absent'])).toEqual({
      handle: '@Micmaths',
      channelId: 'UC4PasDd25MXqlXBogBw9CAg',
    });
  });
});

describe('chunk', () => {
  it('découpe en paquets', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
