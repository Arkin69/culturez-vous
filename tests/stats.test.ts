import { describe, expect, it } from 'vitest';
import { activityFor, computeStats, isoWeek, median, pickStarters, topViewed, weeklyPick, type Video } from '../src/lib/stats';

const NOW = new Date('2026-11-17T12:00:00Z');
const v = (id: string, d: string, s: number, views: number): Video => ({ id, t: `Vidéo ${id}`, d, s, v: views });

const videos: Video[] = [
  v('a', '2026-11-10', 1200, 5000),
  v('b', '2026-06-01', 600, 90000),
  v('c', '2025-12-01', 0, 300),
  v('d', '2024-01-15', 3600, 120000),
  v('e', '2015-03-02', 240, 70000),
];

describe('computeStats', () => {
  const s = computeStats(videos, NOW);

  it('compte, cumule les durées connues et les vues', () => {
    expect(s.count).toBe(5);
    expect(s.totalSeconds).toBe(1200 + 600 + 3600 + 240);
    expect(s.totalViews).toBe(285300);
  });

  it('calcule la médiane sur les durées connues seulement', () => {
    expect(s.medianSeconds).toBe(900);
  });

  it('mesure le rythme sur 12 mois et la fraîcheur', () => {
    expect(s.last12Months).toBe(3);
    expect(s.perMonth).toBe(0.3);
    expect(s.firstDate).toBe('2015-03-02');
    expect(s.lastDate).toBe('2026-11-10');
    expect(s.daysSinceLast).toBe(7);
    expect(s.activity).toBe('active');
  });

  it('gère une chaîne sans vidéo', () => {
    expect(computeStats([], NOW)).toMatchObject({ count: 0, lastDate: null, activity: 'pause', medianSeconds: 0 });
  });
});

describe('activityFor', () => {
  it.each([
    [0, 'active'],
    [60, 'active'],
    [61, 'ralentie'],
    [365, 'ralentie'],
    [366, 'pause'],
    [null, 'pause'],
  ] as const)('%s jours → %s', (days, expected) => expect(activityFor(days)).toBe(expected));
});

describe('median', () => {
  it('pair, impair, vide', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(3);
    expect(median([])).toBe(0);
  });
});

describe('pickStarters', () => {
  it('prend d’abord les vidéos choisies à la main, puis les plus vues (hors formats très courts)', () => {
    expect(pickStarters(videos, ['c', 'inconnue']).map((x) => x.id)).toEqual(['c', 'd', 'b']);
  });

  it('sans choix manuel : les plus vues de plus de 5 minutes', () => {
    expect(pickStarters(videos, []).map((x) => x.id)).toEqual(['d', 'b', 'a']);
  });

  it('topViewed trie par vues décroissantes', () => {
    expect(topViewed(videos, 2).map((x) => x.id)).toEqual(['d', 'b']);
  });
});

describe('isoWeek et weeklyPick', () => {
  it('numérote les semaines ISO', () => {
    expect(isoWeek(new Date('2026-11-17T00:00:00Z'))).toEqual({ year: 2026, week: 47 });
    expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toEqual({ year: 2026, week: 53 });
  });

  it('est stable dans la semaine, change la semaine suivante, sans doublon', () => {
    const items = Array.from({ length: 47 }, (_, i) => i);
    const monday = weeklyPick(items, 3, new Date('2026-11-16T08:00:00Z'));
    const sunday = weeklyPick(items, 3, new Date('2026-11-22T20:00:00Z'));
    const next = weeklyPick(items, 3, new Date('2026-11-23T08:00:00Z'));
    expect(monday).toEqual(sunday);
    expect(next).not.toEqual(monday);
    expect(new Set(monday).size).toBe(3);
  });

  it('gère les listes courtes ou vides', () => {
    expect(weeklyPick([1, 2], 3, NOW)).toHaveLength(2);
    expect(weeklyPick([], 3, NOW)).toEqual([]);
  });
});

describe('rythme sur catalogue partiel', () => {
  it('mesure le rythme sur la période couverte quand elle fait moins d’un an', () => {
    // 15 vidéos sur les 150 derniers jours ≈ 3 par mois.
    const recent = Array.from({ length: 15 }, (_, i) => v(`r${i}`, new Date(NOW.getTime() - (i * 10 + 1) * 86_400_000).toISOString().slice(0, 10), 900, 100));
    expect(computeStats(recent, NOW).perMonth).toBeCloseTo(3, 0);
  });
});
