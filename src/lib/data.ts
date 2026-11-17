// Jointure des fiches éditoriales (src/content) et des données YouTube générées (src/data).
import { getCollection, type CollectionEntry } from 'astro:content';
import channelsJson from '../data/channels.json';
import { computeStats, pickStarters, topViewed, type Stats, type Video } from './stats';

export interface Channel {
  id: string;
  title?: string;
  handle?: string;
  avatar?: string;
  banner?: string;
  subscribers?: number | null;
  videoCount?: number | null;
  publishedAt?: string;
  source: 'api' | 'rss';
  updatedAt: string;
}

interface VideoFile {
  complete: boolean;
  videos: Video[];
}

export type Domain = CollectionEntry<'domains'> & { creators: Creator[] };

export interface Creator {
  id: string;
  entry: CollectionEntry<'creators'>;
  data: CollectionEntry<'creators'>['data'];
  channel: Channel | undefined;
  videos: Video[];
  /** true quand le catalogue vient de l'API (toutes les vidéos), false avec le flux RSS seul. */
  complete: boolean;
  stats: Stats;
  starters: Video[];
  popular: Video[];
  domain: CollectionEntry<'domains'>;
  domains: CollectionEntry<'domains'>[];
  url: string;
  channelUrl: string;
  avatar: string | undefined;
}

const channels = channelsJson as Record<string, Channel>;
const videoFiles = import.meta.glob<VideoFile>('../data/videos/*.json', { eager: true, import: 'default' });

/** Date de référence du build : le site est reconstruit chaque semaine. */
export const NOW = new Date();

export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}

export function youtubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

let cache: Promise<{ domains: Domain[]; creators: Creator[] }> | undefined;

async function load() {
  const domainEntries = (await getCollection('domains')).sort((a, b) => a.data.order - b.data.order);
  const domainById = new Map(domainEntries.map((d) => [d.id, d]));
  const creatorEntries = await getCollection('creators');
  const creatorIds = new Set(creatorEntries.map((c) => c.id));

  const creators: Creator[] = creatorEntries.map((entry) => {
    const { data } = entry;
    for (const d of data.domains) {
      if (!domainById.has(d)) throw new Error(`Fiche ${entry.id} : domaine inconnu « ${d} »`);
    }
    for (const s of data.similar) {
      if (!creatorIds.has(s)) throw new Error(`Fiche ${entry.id} : vulgarisateur similaire inconnu « ${s} »`);
    }
    const file = videoFiles[`../data/videos/${entry.id}.json`] ?? { complete: false, videos: [] };
    const channel = channels[entry.id];
    const handle = channel?.handle ?? data.handle;
    return {
      id: entry.id,
      entry,
      data,
      channel,
      videos: file.videos,
      complete: file.complete,
      stats: computeStats(file.videos, NOW),
      starters: pickStarters(file.videos, data.startWith),
      popular: topViewed(file.videos, 6),
      domain: domainById.get(data.domains[0])!,
      domains: data.domains.map((d) => domainById.get(d)!),
      url: withBase(`/vulgarisateurs/${entry.id}/`),
      channelUrl: `https://www.youtube.com/${handle}`,
      avatar: channel?.avatar,
    };
  });

  // Ordre par défaut : domaine principal, puis abonnés décroissants.
  creators.sort(
    (a, b) =>
      a.domain.data.order - b.domain.data.order ||
      (b.channel?.subscribers ?? 0) - (a.channel?.subscribers ?? 0) ||
      a.data.name.localeCompare(b.data.name, 'fr'),
  );

  const domains: Domain[] = domainEntries.map((d) => ({
    ...d,
    // D'abord les chaînes dont c'est le domaine principal, puis celles qui y touchent aussi.
    creators: [
      ...creators.filter((c) => c.domain.id === d.id),
      ...creators.filter((c) => c.domain.id !== d.id && c.data.domains.includes(d.id)),
    ],
  }));
  return { domains, creators };
}

export function getData() {
  cache ??= load();
  return cache;
}

export async function getCreator(id: string): Promise<Creator | undefined> {
  return (await getData()).creators.find((c) => c.id === id);
}

/** Dernière mise à jour des données YouTube et proportion de catalogues complets. */
export function dataFreshness(creators: Creator[]) {
  const dates = creators.map((c) => c.channel?.updatedAt).filter((d): d is string => Boolean(d)).sort();
  const complete = creators.filter((c) => c.complete).length;
  return { updatedAt: dates.at(-1) ?? null, complete, total: creators.length };
}

/** Toutes les vidéos, avec leur vulgarisateur, de la plus récente à la plus ancienne. */
export function allVideos(creators: Creator[]): (Video & { creator: Creator })[] {
  return creators
    .flatMap((c) => c.videos.map((v) => ({ ...v, creator: c })))
    .sort((a, b) => b.d.localeCompare(a.d) || a.id.localeCompare(b.id));
}
