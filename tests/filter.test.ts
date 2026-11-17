import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterVideos, filtersFromParams, filtersToParams, indexVideos, sortVideos, yearsOf } from '../src/lib/filter';
import type { Video } from '../src/lib/stats';

const videos: Video[] = [
  { id: 'a', t: 'La physique quantique expliquée', d: '2026-03-01', s: 1500, v: 1000 },
  { id: 'b', t: "L'énigme de la bouteille", d: '2025-12-17', s: 400, v: 5000 },
  { id: 'c', t: 'Fusion nucléaire : piéger un plasma', d: '2026-06-12', s: 4000, v: 300 },
  { id: 'd', t: 'Live sans durée', d: '2024-01-01', s: 0, v: 10 },
];
const indexed = indexVideos(videos);

describe('filterVideos', () => {
  it('recherche sans accents, tous les mots requis', () => {
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, q: 'ENIGME bouteille' }).map((v) => v.id)).toEqual(['b']);
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, q: 'piege plasma' }).map((v) => v.id)).toEqual(['c']);
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, q: 'plasma bouteille' })).toEqual([]);
  });

  it('filtre par tranche de durée et par année', () => {
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, duration: 'court' }).map((v) => v.id)).toEqual(['b']);
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, duration: 'tres-long' }).map((v) => v.id)).toEqual(['c']);
    expect(filterVideos(indexed, { ...DEFAULT_FILTERS, year: '2026' }).map((v) => v.id)).toEqual(['c', 'a']);
  });

  it('accepte un filtre supplémentaire (ex. domaine dans le catalogue global)', () => {
    expect(filterVideos(indexed, DEFAULT_FILTERS, (v) => v.v > 500).map((v) => v.id)).toEqual(['a', 'b']);
  });
});

describe('sortVideos', () => {
  const ids = (sort: Parameters<typeof sortVideos>[1]) => sortVideos(videos, sort).map((v) => v.id);
  it('trie dans tous les sens, durées inconnues à la fin pour « plus courtes »', () => {
    expect(ids('recent')).toEqual(['c', 'a', 'b', 'd']);
    expect(ids('ancien')).toEqual(['d', 'b', 'a', 'c']);
    expect(ids('vues')).toEqual(['b', 'a', 'c', 'd']);
    expect(ids('courtes')).toEqual(['b', 'a', 'c', 'd']);
    expect(ids('longues')).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('paramètres d’URL', () => {
  it('aller-retour, valeurs par défaut omises, valeurs invalides ignorées', () => {
    const f = { q: 'plasma', sort: 'vues' as const, duration: 'long' as const, year: '2026' };
    const params = filtersToParams(f);
    expect(params.toString()).toBe('q=plasma&tri=vues&duree=long&annee=2026');
    expect(filtersFromParams(params)).toEqual(f);
    expect(filtersToParams(DEFAULT_FILTERS).toString()).toBe('');
    expect(filtersFromParams(new URLSearchParams('tri=nimp&duree=x&annee=20'))).toEqual(DEFAULT_FILTERS);
  });
});

describe('yearsOf', () => {
  it('liste les années, de la plus récente à la plus ancienne', () => {
    expect(yearsOf(videos)).toEqual(['2026', '2025', '2024']);
  });
});
