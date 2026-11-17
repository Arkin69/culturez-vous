// Statistiques calculées à partir des vidéos d'une chaîne. Fonctions pures (testées dans tests/stats.test.ts).
import type { Activity } from './format';

/** Vidéo compacte, telle que stockée dans src/data/videos/<slug>.json. */
export interface Video {
  /** ID YouTube */
  id: string;
  /** titre */
  t: string;
  /** date de publication AAAA-MM-JJ */
  d: string;
  /** durée en secondes (0 si inconnue) */
  s: number;
  /** nombre de vues */
  v: number;
}

export interface Stats {
  count: number;
  totalSeconds: number;
  totalViews: number;
  /** Durée médiane (plus représentative que la moyenne avec quelques lives de 3 h). */
  medianSeconds: number;
  /** Vidéos publiées sur les 12 derniers mois. */
  last12Months: number;
  /** Vidéos par mois (sur 12 mois, ou sur la période couverte si elle est plus courte). */
  perMonth: number;
  firstDate: string | null;
  lastDate: string | null;
  daysSinceLast: number | null;
  activity: Activity;
}

const DAY = 86_400_000;

export function daysBetween(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / DAY);
}

export function activityFor(daysSinceLast: number | null): Activity {
  if (daysSinceLast === null) return 'pause';
  if (daysSinceLast <= 60) return 'active';
  if (daysSinceLast <= 365) return 'ralentie';
  return 'pause';
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function computeStats(videos: Video[], now: Date = new Date()): Stats {
  const dates = videos.map((v) => v.d).sort();
  const firstDate = dates[0] ?? null;
  const lastDate = dates.at(-1) ?? null;
  const daysSinceLast = lastDate ? daysBetween(lastDate, now) : null;
  const last12Months = videos.filter((v) => daysBetween(v.d, now) <= 365).length;
  // Le rythme est mesuré sur les 12 derniers mois, ou sur la période couverte par les vidéos connues
  // si elle est plus courte (catalogue partiel : seules les dernières vidéos sont listées).
  const windowDays = firstDate ? Math.max(30, Math.min(365, daysBetween(firstDate, now))) : 365;
  const durations = videos.map((v) => v.s).filter((s) => s > 0);
  return {
    count: videos.length,
    totalSeconds: durations.reduce((a, b) => a + b, 0),
    totalViews: videos.reduce((a, v) => a + v.v, 0),
    medianSeconds: median(durations),
    last12Months,
    perMonth: Math.round(((last12Months / windowDays) * 30.44) * 10) / 10,
    firstDate,
    lastDate,
    daysSinceLast,
    activity: activityFor(daysSinceLast),
  };
}

/** Les n vidéos les plus vues. */
export function topViewed(videos: Video[], n: number): Video[] {
  return [...videos].sort((a, b) => b.v - a.v || a.id.localeCompare(b.id)).slice(0, n);
}

/**
 * « Par où commencer » : les vidéos choisies à la main si elles existent,
 * complétées par les plus vues (hors formats très courts quand la durée est connue).
 */
export function pickStarters(videos: Video[], startWith: string[], n = 3): Video[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  const picked = startWith.map((id) => byId.get(id)).filter((v): v is Video => Boolean(v));
  const substantial = videos.filter((v) => v.s === 0 || v.s >= 300);
  for (const v of topViewed(substantial.length >= n ? substantial : videos, n * 2)) {
    if (picked.length >= n) break;
    if (!picked.some((p) => p.id === v.id)) picked.push(v);
  }
  return picked.slice(0, n);
}

/** Numéro de semaine ISO 8601 (1-53). */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7) };
}

/**
 * Sélection qui tourne chaque semaine, déterministe pour une semaine donnée.
 * Les éléments retenus sont espacés dans la liste : triée par domaine, elle donne une sélection variée.
 */
export function weeklyPick<T>(items: T[], n: number, now: Date = new Date()): T[] {
  if (!items.length) return [];
  const { year, week } = isoWeek(now);
  const count = Math.min(n, items.length);
  const step = Math.max(1, Math.floor(items.length / count));
  const start = (year * 53 + week) % items.length;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(items[(start + i * step) % items.length]);
  return out;
}
