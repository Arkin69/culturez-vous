import { describe, expect, it } from 'vitest';
import {
  durationBucket,
  formatAge,
  formatClock,
  formatCount,
  formatDate,
  formatDuration,
  formatRhythm,
  formatTotalHours,
  normalize,
  plural,
} from '../src/lib/format';

const NNBSP = ' ';

describe('formatage', () => {
  it('formatCount : notation compacte française', () => {
    expect(formatCount(1_520_000)).toBe(`1,5${NNBSP}M`);
    expect(formatCount(35_800)).toBe(`35,8${NNBSP}k`);
    expect(formatCount(950)).toBe('950');
    expect(formatCount(null)).toBe('–');
  });

  it('formatClock : badge de durée', () => {
    expect(formatClock(2470)).toBe('41:10');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(0)).toBe('');
  });

  it('formatDuration : durée lisible', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(1380)).toBe('23 min');
    expect(formatDuration(3900)).toBe('1 h 05');
    expect(formatDuration(7200)).toBe('2 h');
    expect(formatDuration(0)).toBe('–');
  });

  it('formatTotalHours : cumul', () => {
    expect(formatTotalHours(5400)).toBe('1 h 30');
    expect(formatTotalHours(3600 * 312.4)).toBe('312 heures');
  });

  it('formatDate et formatAge', () => {
    expect(formatDate('2026-11-13')).toBe('13 nov. 2026');
    const now = new Date('2026-11-17T12:00:00Z');
    expect(formatAge('2026-11-14', now)).toBe('il y a 3 jours');
    expect(formatAge('2026-09-01', now)).toBe('il y a 3 mois');
    expect(formatAge('2018-09-10', now)).toBe('il y a 8 ans');
  });

  it('normalize : sans accents ni majuscules', () => {
    expect(normalize('  L’Énigme de la   Bouteille ')).toBe('l enigme de la bouteille');
  });

  it('durationBucket', () => {
    expect(durationBucket(300)).toBe('court');
    expect(durationBucket(600)).toBe('moyen');
    expect(durationBucket(2400)).toBe('long');
    expect(durationBucket(7200)).toBe('tres-long');
    expect(durationBucket(0)).toBeNull();
  });

  it('plural', () => {
    expect(plural(1, 'vidéo')).toBe('1 vidéo');
    expect(plural(12, 'vidéo')).toBe('12 vidéos');
  });
});


describe('formatRhythm', () => {
  it.each([
    [13, '3 par semaine'],
    [6.5, '1 par semaine'],
    [4, '4 par mois'],
    [1, '1 par mois'],
    [0.5, '1 tous les 2 mois'],
    [0.83, '1 par mois'],
    [0.08, '1 tous les 13 mois'],
    [0, 'Aucune cette année'],
  ])('%s par mois → %s', (n, expected) => expect(formatRhythm(n)).toBe(expected));
});
