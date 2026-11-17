// Gabarit HTML d'une carte vidéo, partagé par le rendu serveur (VideoCard.astro) et le rendu navigateur.
import { formatClock, formatCount, formatDate } from '../lib/format';
import type { Video } from '../lib/stats';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export interface CardOptions {
  /** Nom du vulgarisateur, affiché dans le catalogue global. */
  creator?: string;
  /** Grande carte (miniature en meilleure qualité). */
  large?: boolean;
  /** Charge l'image tout de suite (cartes visibles sans défiler). */
  eager?: boolean;
}

export function videoCardHtml(v: Video, opts: CardOptions = {}): string {
  const id = escapeHtml(v.id);
  const thumb = `https://i.ytimg.com/vi/${id}/${opts.large ? 'hqdefault' : 'mqdefault'}.jpg`;
  const clock = formatClock(v.s);
  const meta = [
    opts.creator ? `<span class="vcard-creator">${escapeHtml(opts.creator)}</span>` : '',
    formatDate(v.d),
    v.v ? `${formatCount(v.v)} vues` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    `<a class="vcard${opts.large ? ' vcard-lg' : ''}" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" data-id="${id}">` +
    `<span class="vcard-thumb"><img src="${thumb}" alt="" width="320" height="180" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">` +
    (clock ? `<span class="vcard-dur"><span class="visually-hidden">Durée : </span>${clock}</span>` : '') +
    `</span><span><span class="vcard-title">${escapeHtml(v.t)}</span>` +
    `<span class="vcard-meta">${meta}</span><span class="visually-hidden"> (s'ouvre sur YouTube dans un nouvel onglet)</span></span></a>`
  );
}
