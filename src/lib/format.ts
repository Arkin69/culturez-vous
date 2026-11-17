// Formatage français des nombres, durées et dates. Fonctions pures, utilisables côté serveur et navigateur.

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('fr-FR');
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYearFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** 1 520 000 → « 1,5 M » ; 35 800 → « 35,8 k ». */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return compact.format(n).replace(/ /g, ' ');
}

/** 1 520 000 → « 1 520 000 ». */
export function formatNumber(n: number): string {
  return plain.format(n);
}

/** Secondes → « 1:02:03 » ou « 12:34 » (badge sur les miniatures). */
export function formatClock(seconds: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Secondes → « 1 h 05 », « 23 min », « 45 s ». */
export function formatDuration(seconds: number): string {
  if (!seconds) return '–';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** Durée cumulée → « 312 heures », « 4 h 30 ». */
export function formatTotalHours(seconds: number): string {
  if (seconds < 3600 * 10) return formatDuration(seconds);
  return `${plain.format(Math.round(seconds / 3600))} heures`;
}

/** « 2026-11-13 » → « 13 nov. 2026 ». */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

/** « 2014-03-01 » → « mars 2014 ». */
export function formatMonthYear(iso: string): string {
  return monthYearFmt.format(new Date(`${iso}T00:00:00Z`));
}

/** « il y a 3 jours », « il y a 2 mois », « il y a 4 ans ». */
export function formatAge(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / 86_400_000);
  if (days < 1) return "aujourd'hui";
  if (days < 30) return relative.format(-days, 'day');
  if (days < 365) return relative.format(-Math.round(days / 30.44), 'month');
  return relative.format(-Math.round(days / 365.25), 'year');
}

/** Minuscules sans accents, pour la recherche. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DurationBucket = 'court' | 'moyen' | 'long' | 'tres-long';

export const DURATION_BUCKETS: { id: DurationBucket; label: string; min: number; max: number }[] = [
  { id: 'court', label: 'Moins de 10 min', min: 1, max: 600 },
  { id: 'moyen', label: '10 à 30 min', min: 600, max: 1800 },
  { id: 'long', label: '30 min à 1 h', min: 1800, max: 3600 },
  { id: 'tres-long', label: "Plus d'1 h", min: 3600, max: Infinity },
];

export function durationBucket(seconds: number): DurationBucket | null {
  if (!seconds) return null;
  return DURATION_BUCKETS.find((b) => seconds >= b.min && seconds < b.max)?.id ?? null;
}

export const LEVELS = {
  debutant: { label: 'Accessible à tous', short: 'Débutant' },
  intermediaire: { label: 'Un peu de concentration', short: 'Intermédiaire' },
  avance: { label: 'Pour aller loin', short: 'Avancé' },
} as const;

export type Level = keyof typeof LEVELS;

export const ACTIVITY = {
  active: { label: 'Active', hint: 'Une vidéo dans les 2 derniers mois' },
  ralentie: { label: 'Ralentie', hint: 'Dernière vidéo il y a 2 à 12 mois' },
  pause: { label: 'En pause', hint: "Pas de vidéo depuis plus d'un an : les archives restent précieuses" },
} as const;

export type Activity = keyof typeof ACTIVITY;

/** Pluriel français simple : plural(3, 'vidéo') → « 3 vidéos ». */
export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${formatNumber(n)} ${n > 1 ? pluralWord : word}`;
}

/** Rythme de publication lisible : « 2 par semaine », « 3 par mois », « 1 tous les 4 mois ». */
export function formatRhythm(perMonth: number): string {
  if (perMonth <= 0) return 'Aucune cette année';
  if (perMonth >= 6) return `${Math.round(perMonth / 4.35)} par semaine`;
  const everyMonths = Math.round(1 / perMonth);
  if (perMonth >= 0.95 || everyMonths <= 1) return `${Math.max(1, Math.round(perMonth))} par mois`;
  return `1 tous les ${everyMonths} mois`;
}
