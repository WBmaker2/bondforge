import type { Route } from './state';

export interface ParsedRoute {
  route: Route;
  missionId: string | null;
}

const ROUTES: Route[] = ['build', 'missions', 'teacher'];

export function parseRoute(hash: string): ParsedRoute {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return { route: 'build', missionId: null };
  const [path, query = ''] = raw.split('?');
  const route = (ROUTES.includes(path as Route) ? path : 'build') as Route;
  const params = new URLSearchParams(query);
  const missionId = params.get('mission');
  return { route, missionId };
}

export function routeHash(route: Route, missionId?: string | null): string {
  const base = `#/${route}`;
  return missionId ? `${base}?mission=${encodeURIComponent(missionId)}` : base;
}

export function navigate(route: Route, missionId?: string | null): void {
  const hash = routeHash(route, missionId);
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
}
