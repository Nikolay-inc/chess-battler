export type Route = 'home' | 'play' | 'collection' | 'shop' | 'profile' | 'settings';

export const ROUTES: readonly Route[] = [
  'home',
  'play',
  'collection',
  'shop',
  'profile',
  'settings',
];

/** «#/collection» → 'collection'; неизвестное и пустое → 'home'. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home';
}

/** Маршрутизация по hash: переходы попадают в историю, «Назад» браузера работает. */
export class Router {
  private listeners: ((route: Route, prev: Route | null) => void)[] = [];
  private current: Route | null = null;

  constructor() {
    window.addEventListener('hashchange', () => this.sync());
  }

  get route(): Route {
    return this.current ?? parseRoute(location.hash);
  }

  onChange(cb: (route: Route, prev: Route | null) => void): void {
    this.listeners.push(cb);
  }

  go(route: Route): void {
    if (parseRoute(location.hash) === route) this.sync();
    else location.hash = `#/${route}`;
  }

  /** Применить маршрут из адреса (вызвать один раз при старте). */
  sync(): void {
    const next = parseRoute(location.hash);
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const cb of this.listeners) cb(next, prev);
  }
}
