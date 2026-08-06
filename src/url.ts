import type { Dataset } from './graph';
import { defaultFilters, mediaKinds, type Filters } from './filters';

/**
 * The whole view lives in the query string so any state worth looking at can be
 * linked to. There is no server, so this is also the only place view state can
 * be persisted at all.
 *
 * Only differences from the default are written. A URL therefore stays empty
 * until you actually change something, and every parameter that does appear is
 * one the reader deliberately chose.
 */
export interface AppState {
  trail: string[];
  filters: Filters;
  focusSelection: boolean;
  showLinkLabels: boolean;
  query: string;
}

export function defaultState(data: Dataset): AppState {
  return {
    trail: [],
    filters: defaultFilters(data),
    focusSelection: true,
    showLinkLabels: true,
    query: '',
  };
}

/** Keys of a record whose value is false, which is what gets written out. */
const offKeys = (record: Record<string, boolean>) =>
  Object.keys(record).filter((k) => record[k] === false);

const list = (values: string[]) => values.join(',');
const parseList = (raw: string | null) => (raw ? raw.split(',').filter(Boolean) : []);

/** Episode ids are `ep-01`-ish; the numeric tail keeps URLs short and readable. */
const shortEpisode = (id: string) => id.replace(/^ep(isode)?[-_]?/, '');

export function encodeState(state: AppState): string {
  const params = new URLSearchParams();
  const { filters: f } = state;

  if (state.trail.length) params.set('at', list(state.trail));
  if (!state.focusSelection) params.set('focus', '0');
  if (!state.showLinkLabels) params.set('labels', '0');
  if (state.query.trim()) params.set('q', state.query.trim());
  if (f.showEpisodes) params.set('eps', '1');

  // Media and hosts are written as exclusions: there are only a handful of
  // each, and turning one off is far more common than picking one.
  const media = offKeys(f.media);
  if (media.length) params.set('nomedia', list(media));

  const hosts = offKeys(f.hosts);
  if (hosts.length) params.set('nohost', list(hosts));

  if (!f.status.featured) params.set('nopicks', '1');
  if (!f.status.mentioned) params.set('nomentions', '1');
  if (!f.personKinds.created) params.set('nocreators', '1');
  if (!f.personKinds.appeared) params.set('nocast', '1');

  // Episodes are the opposite: 18 of them, and scoping to a few is the point,
  // so write the selection rather than the exclusions when it is smaller.
  // An empty selection has to go out as exclusions, since a bare `ep=` is
  // indistinguishable from a stale link and gets ignored on the way back in.
  const on = Object.keys(f.episodes).filter((k) => f.episodes[k]);
  const off = offKeys(f.episodes);
  if (off.length) {
    if (on.length && on.length <= off.length) params.set('ep', list(on.map(shortEpisode)));
    else params.set('noep', list(off.map(shortEpisode)));
  }

  return params.toString();
}

export function decodeState(search: string, data: Dataset): AppState {
  const params = new URLSearchParams(search);
  const state = defaultState(data);
  const has = (k: string) => params.get(k) === '1';

  state.trail = parseList(params.get('at'));
  if (params.get('focus') === '0') state.focusSelection = false;
  if (params.get('labels') === '0') state.showLinkLabels = false;
  state.query = params.get('q') ?? '';
  state.filters.showEpisodes = has('eps');

  // Unknown ids are ignored rather than trusted, so a stale or hand-edited link
  // degrades to the default view instead of hiding the entire graph.
  const known = <T extends string>(raw: string | null, valid: Set<T>) =>
    parseList(raw).filter((v): v is T => valid.has(v as T));

  for (const m of known(params.get('nomedia'), new Set(mediaKinds(data)))) {
    state.filters.media[m] = false;
  }
  for (const h of known(params.get('nohost'), new Set(data.hosts.map((x) => x.id)))) {
    state.filters.hosts[h] = false;
  }

  if (has('nopicks')) state.filters.status.featured = false;
  if (has('nomentions')) state.filters.status.mentioned = false;
  if (has('nocreators')) state.filters.personKinds.created = false;
  if (has('nocast')) state.filters.personKinds.appeared = false;

  const byShort = new Map(data.episodes.map((e) => [shortEpisode(e.id), e.id]));
  const resolve = (raw: string | null) =>
    parseList(raw)
      .map((s) => byShort.get(s))
      .filter((id): id is string => !!id);

  const only = resolve(params.get('ep'));
  const except = resolve(params.get('noep'));
  if (only.length) {
    for (const id of Object.keys(state.filters.episodes)) {
      state.filters.episodes[id] = only.includes(id);
    }
  } else if (except.length) {
    for (const id of except) state.filters.episodes[id] = false;
  }

  return state;
}
