// Recherche, filtres et tris des listes de vidéos (page d'un vulgarisateur et catalogue global).
// Fonctions pures, exécutées dans le navigateur et testées dans tests/filter.test.ts.
import { DURATION_BUCKETS, normalize, type DurationBucket } from './format';
import type { Video } from './stats';

export type SortKey = 'recent' | 'ancien' | 'vues' | 'courtes' | 'longues';

export const SORTS: { id: SortKey; label: string }[] = [
  { id: 'recent', label: 'Plus récentes' },
  { id: 'vues', label: 'Plus vues' },
  { id: 'ancien', label: 'Plus anciennes' },
  { id: 'courtes', label: 'Plus courtes' },
  { id: 'longues', label: 'Plus longues' },
];

export interface Filters {
  q: string;
  sort: SortKey;
  duration: DurationBucket | '';
  year: string;
}

export const DEFAULT_FILTERS: Filters = { q: '', sort: 'recent', duration: '', year: '' };

/** Vidéo indexée pour la recherche : titre normalisé calculé une seule fois. */
export type Indexed<V extends Video = Video> = V & { n: string };

export function indexVideos<V extends Video>(videos: V[], extraText?: (v: V) => string): Indexed<V>[] {
  return videos.map((v) => ({ ...v, n: normalize(`${v.t} ${extraText?.(v) ?? ''}`) }));
}

export function matchesQuery(normalizedText: string, q: string): boolean {
  const tokens = normalize(q).split(' ').filter(Boolean);
  return tokens.every((t) => normalizedText.includes(t));
}

export function filterVideos<V extends Video>(
  videos: Indexed<V>[],
  f: Filters,
  extra?: (v: Indexed<V>) => boolean,
): Indexed<V>[] {
  const bucket = DURATION_BUCKETS.find((b) => b.id === f.duration);
  const out = videos.filter(
    (v) =>
      (!f.q || matchesQuery(v.n, f.q)) &&
      (!bucket || (v.s >= bucket.min && v.s < bucket.max)) &&
      (!f.year || v.d.startsWith(f.year)) &&
      (!extra || extra(v)),
  );
  return sortVideos(out, f.sort);
}

export function sortVideos<V extends Video>(videos: V[], sort: SortKey): V[] {
  const byDate = (a: V, b: V) => b.d.localeCompare(a.d) || a.id.localeCompare(b.id);
  const cmp: Record<SortKey, (a: V, b: V) => number> = {
    recent: byDate,
    ancien: (a, b) => -byDate(a, b),
    vues: (a, b) => b.v - a.v || byDate(a, b),
    // Les durées inconnues (0) vont à la fin.
    courtes: (a, b) => (a.s || Infinity) - (b.s || Infinity) || byDate(a, b),
    longues: (a, b) => b.s - a.s || byDate(a, b),
  };
  return [...videos].sort(cmp[sort]);
}

/** Années présentes, de la plus récente à la plus ancienne. */
export function yearsOf(videos: Video[]): string[] {
  return [...new Set(videos.map((v) => v.d.slice(0, 4)))].sort().reverse();
}

/** Lit les filtres depuis l'URL (?q=…&tri=…&duree=…&annee=…). */
export function filtersFromParams(params: URLSearchParams): Filters {
  const sort = params.get('tri') as SortKey | null;
  const duration = params.get('duree') as DurationBucket | null;
  return {
    q: params.get('q') ?? '',
    sort: sort && SORTS.some((s) => s.id === sort) ? sort : 'recent',
    duration: duration && DURATION_BUCKETS.some((b) => b.id === duration) ? duration : '',
    year: /^\d{4}$/.test(params.get('annee') ?? '') ? (params.get('annee') as string) : '',
  };
}

/** Écrit les filtres non par défaut dans l'URL, pour qu'une recherche puisse être partagée. */
export function filtersToParams(f: Filters, params = new URLSearchParams()): URLSearchParams {
  const set = (k: string, v: string, def: string) => (v && v !== def ? params.set(k, v) : params.delete(k));
  set('q', f.q.trim(), '');
  set('tri', f.sort, 'recent');
  set('duree', f.duration, '');
  set('annee', f.year, '');
  return params;
}
