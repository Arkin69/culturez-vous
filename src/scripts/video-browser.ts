// Liste de vidéos filtrable (page d'un vulgarisateur et catalogue global).
// Le HTML de départ est rendu au build (premières vidéos) ; ce script prend le relais pour filtrer et paginer.
import {
  filterVideos,
  filtersFromParams,
  filtersToParams,
  indexVideos,
  type Filters,
  type Indexed,
} from '../lib/filter';
import { formatNumber } from '../lib/format';
import type { Video } from '../lib/stats';
import { videoCardHtml } from './video-card';

/** Ligne compacte : [id, titre, date, durée, vues, index du vulgarisateur] */
type Row = [string, string, string, number, number, number?];

interface CatalogueCreator {
  id: string;
  name: string;
  domains: string[];
}

interface Catalogue {
  creators: CatalogueCreator[];
  videos: Row[];
}

type V = Video & { c?: number };

async function loadRows(root: HTMLElement): Promise<{ rows: Row[]; creators: CatalogueCreator[] }> {
  const inline = root.querySelector<HTMLScriptElement>('script[data-videos]');
  if (inline) return { rows: JSON.parse(inline.textContent ?? '[]'), creators: [] };
  const res = await fetch(root.dataset.src!);
  if (!res.ok) throw new Error(`Catalogue indisponible (${res.status})`);
  const data = (await res.json()) as Catalogue;
  return { rows: data.videos, creators: data.creators };
}

export async function initVideoBrowser(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('form')!;
  const grid = root.querySelector<HTMLElement>('[data-grid]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const more = root.querySelector<HTMLButtonElement>('[data-more]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const pageSize = Number(root.dataset.pageSize ?? 48);
  const syncUrl = root.dataset.syncUrl === 'true';

  let rows: Row[];
  let creators: CatalogueCreator[];
  try {
    ({ rows, creators } = await loadRows(root));
  } catch (e) {
    count.textContent = 'Impossible de charger le catalogue. Rechargez la page pour réessayer.';
    console.error(e);
    return;
  }

  const videos: Indexed<V>[] = indexVideos(
    rows.map(([id, t, d, s, v, c]) => ({ id, t, d, s, v, c })),
    (v) => (v.c !== undefined ? creators[v.c]?.name ?? '' : ''),
  );
  const total = videos.length;

  const field = <T extends HTMLElement = HTMLInputElement>(name: string) =>
    form.elements.namedItem(name) as unknown as T | null;
  const creatorSelect = field<HTMLSelectElement>('chaine');
  const domainSelect = field<HTMLSelectElement>('domaine');

  // État initial : depuis l'URL (recherche partagée ou venue de l'en-tête).
  const params = new URLSearchParams(location.search);
  let filters: Filters = filtersFromParams(params);
  let creatorFilter = params.get('chaine') ?? '';
  let domainFilter = params.get('domaine') ?? '';

  const setValue = (name: string, value: string) => {
    const el = field<HTMLInputElement | HTMLSelectElement>(name);
    if (!el) return;
    // Une valeur d'URL absente des options (chaîne inconnue…) est ignorée.
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value)) return;
    el.value = value;
  };
  setValue('q', filters.q);
  setValue('tri', filters.sort);
  setValue('duree', filters.duration);
  setValue('annee', filters.year);
  if (creatorSelect) setValue('chaine', creatorFilter);
  if (domainSelect) setValue('domaine', domainFilter);
  creatorFilter = creatorSelect?.value ?? '';
  domainFilter = domainSelect?.value ?? '';

  const creatorIndex = new Map(creators.map((c, i) => [c.id, i]));
  const extra = (v: V) => {
    if (v.c === undefined) return true;
    if (creatorFilter && v.c !== creatorIndex.get(creatorFilter)) return false;
    if (domainFilter && !creators[v.c]?.domains.includes(domainFilter)) return false;
    return true;
  };

  let results: Indexed<V>[] = [];
  let shown = 0;

  const card = (v: Indexed<V>) =>
    videoCardHtml(v, { creator: v.c !== undefined ? creators[v.c]?.name : undefined });

  function renderCount() {
    const n = results.length;
    const label = `${formatNumber(n)} vidéo${n > 1 ? 's' : ''}`;
    count.textContent = n === total ? label : `${label} sur ${formatNumber(total)}`;
    more.hidden = shown >= n;
    more.textContent = `Voir plus (${formatNumber(Math.min(pageSize, n - shown))} sur ${formatNumber(n - shown)} restantes)`;
    empty.hidden = n > 0;
  }

  function render() {
    shown = Math.min(pageSize, results.length);
    grid.innerHTML = results.slice(0, shown).map(card).join('');
    renderCount();
  }

  function apply() {
    results = filterVideos(videos, filters, extra);
    render();
    if (syncUrl) {
      const p = filtersToParams(filters, new URLSearchParams(location.search));
      creatorFilter ? p.set('chaine', creatorFilter) : p.delete('chaine');
      domainFilter ? p.set('domaine', domainFilter) : p.delete('domaine');
      const qs = p.toString();
      history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    }
  }

  function readForm() {
    const data = new FormData(form);
    filters = filtersFromParams(
      new URLSearchParams({
        q: String(data.get('q') ?? ''),
        tri: String(data.get('tri') ?? 'recent'),
        duree: String(data.get('duree') ?? ''),
        annee: String(data.get('annee') ?? ''),
      }),
    );
    creatorFilter = String(data.get('chaine') ?? '');
    domainFilter = String(data.get('domaine') ?? '');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  form.addEventListener('input', (e) => {
    clearTimeout(timer);
    const isText = (e.target as HTMLElement).matches('input[type="search"]');
    timer = setTimeout(
      () => {
        readForm();
        apply();
      },
      isText ? 180 : 0,
    );
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    readForm();
    apply();
  });
  form.addEventListener('reset', () => {
    setTimeout(() => {
      readForm();
      apply();
    });
  });

  more.addEventListener('click', () => {
    const next = results.slice(shown, shown + pageSize);
    grid.insertAdjacentHTML('beforeend', next.map(card).join(''));
    const firstNew = grid.children[shown] as HTMLElement | undefined;
    shown += next.length;
    renderCount();
    firstNew?.focus({ preventScroll: true });
  });

  root.dataset.ready = 'true';
  apply();
}

document.querySelectorAll<HTMLElement>('[data-video-browser]').forEach((root) => {
  void initVideoBrowser(root);
});
