import {
  COSMETICS,
  DEFAULT_COSMETICS,
  getCosmetic,
  isDefaultCosmetic,
} from '@chess-battler/content';
import type { CosmeticKind } from '@chess-battler/content';
import type { Account } from '../account';

export type Equipped = Readonly<Record<CosmeticKind, string>>;

const LOCAL_KEY = 'chess-battler.cosmetics.v1';

/** Надетые скины: только известные, своего вида и купленные; иначе — стандартные. */
export function normalizeEquipped(raw: unknown, owned: ReadonlySet<string>): Equipped {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_COSMETICS };
  for (const kind of Object.keys(DEFAULT_COSMETICS) as CosmeticKind[]) {
    const id = src[kind];
    const c = typeof id === 'string' ? getCosmetic(id) : undefined;
    if (c && c.kind === kind && (isDefaultCosmetic(c.id) || owned.has(c.id))) out[kind] = c.id;
  }
  return out;
}

/**
 * Купленные и надетые скины. Источник правды — сервер (purchases, profiles.equipped);
 * локально — кэш надетого, чтобы скины применялись сразу при запуске.
 */
export class PurchasesStore {
  private ownedIds = new Set<string>();
  private equippedValue: Equipped;
  private listeners: (() => void)[] = [];

  constructor(private readonly account: Account) {
    let cached: unknown = null;
    try {
      cached = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
    } catch {
      cached = null;
    }
    const c = (cached ?? {}) as { owned?: string[]; equipped?: unknown };
    this.ownedIds = new Set((c.owned ?? []).filter((id) => getCosmetic(id)));
    this.equippedValue = normalizeEquipped(c.equipped, this.ownedIds);
    account.onChange(() => void this.load());
  }

  get equipped(): Equipped {
    return this.equippedValue;
  }

  owns(id: string): boolean {
    return isDefaultCosmetic(id) || this.ownedIds.has(id);
  }

  get ownedCount(): number {
    return this.ownedIds.size;
  }

  onChange(cb: () => void): void {
    this.listeners.push(cb);
  }

  private emit(): void {
    try {
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify({ owned: [...this.ownedIds], equipped: this.equippedValue }),
      );
    } catch {
      // без хранилища — только в памяти
    }
    for (const cb of this.listeners) cb();
  }

  private get db() {
    const s = this.account.state;
    return s.status === 'ready' && s.userId ? this.account.client : null;
  }

  /** Перечитать покупки и надетое с сервера («Восстановить покупки» делает то же). */
  async load(): Promise<number> {
    const db = this.db;
    if (!db) {
      if (this.account.state.status === 'ready') this.reset();
      return this.ownedIds.size;
    }
    const [purchases, profile] = await Promise.all([
      db.from('purchases').select('product_id').eq('status', 'paid'),
      db.from('profiles').select('equipped').maybeSingle(),
    ]);
    if (purchases.error) return this.ownedIds.size;
    const known = new Set(COSMETICS.map((c) => c.id));
    this.ownedIds = new Set(
      (purchases.data as { product_id: string }[])
        .map((p) => p.product_id)
        .filter((id) => known.has(id)),
    );
    this.equippedValue = normalizeEquipped(profile.data?.equipped, this.ownedIds);
    this.emit();
    return this.ownedIds.size;
  }

  private reset(): void {
    this.ownedIds = new Set();
    this.equippedValue = { ...DEFAULT_COSMETICS };
    this.emit();
  }

  /** Надеть скин (сервер ещё раз проверит владение триггером). */
  async equip(id: string): Promise<boolean> {
    const c = getCosmetic(id);
    if (!c || !this.owns(id)) return false;
    const next = { ...this.equippedValue, [c.kind]: id };
    const db = this.db;
    if (db) {
      const { error } = await db
        .from('profiles')
        .update({ equipped: next })
        .eq('id', this.account.state.userId!);
      if (error) return false;
    }
    this.equippedValue = next;
    this.emit();
    return true;
  }
}
