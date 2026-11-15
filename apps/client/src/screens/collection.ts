import { FAMILY_NAMES, SYNERGIES, UNIT_LIST } from '@chess-battler/content';
import type { Family } from '@chess-battler/sim';
import { GLYPH } from '../board-view';
import { $, el, showUnitCard } from '../ui';

const FAMILIES: readonly Family[] = ['legion', 'riders', 'mystics', 'guards'];
type Tab = 'units' | 'synergies';

/** Коллекция: справочник фигур (схема, статы ★1–★3, способность) и синергий семей. */
export class CollectionScreen {
  private tab: Tab = 'units';

  constructor() {
    $('col-tab-units').addEventListener('click', () => this.show('units'));
    $('col-tab-synergies').addEventListener('click', () => this.show('synergies'));
  }

  show(tab: Tab = this.tab): void {
    this.tab = tab;
    $('col-tab-units').setAttribute('aria-selected', String(tab === 'units'));
    $('col-tab-synergies').setAttribute('aria-selected', String(tab === 'synergies'));
    const root = $('collection');
    root.replaceChildren(...(tab === 'units' ? this.units() : this.synergies()));
    root.scrollTop = 0;
  }

  private units(): HTMLElement[] {
    return FAMILIES.map((f) => {
      const block = el('section', 'col-family');
      const head = el('h2', `col-family-title fam-${f}`);
      head.append(el('span', 'card-glyph', GLYPH[f]), ` ${FAMILY_NAMES[f]}`);
      const grid = el('div', 'col-grid');
      for (const u of UNIT_LIST.filter((d) => d.family === f)) {
        const card = el('button', `shop-card fam-${f}`);
        card.type = 'button';
        card.setAttribute('aria-label', `${u.name}, уровень ${u.cost}`);
        card.append(
          el('span', 'card-glyph', GLYPH[f]),
          el('span', 'card-name', u.name),
          el('span', 'card-stats', `${u.hp}♥ ${u.atk}⚔️`),
          el('span', 'card-cost', `${u.cost}`),
        );
        card.addEventListener('click', () => showUnitCard($('info'), u.id, 1, { pickStars: true }));
        grid.append(card);
      }
      block.append(head, grid);
      return block;
    });
  }

  private synergies(): HTMLElement[] {
    return SYNERGIES.map((syn) => {
      const block = el('section', 'col-synergy');
      const head = el('h2', `col-family-title fam-${syn.family}`);
      head.append(el('span', 'card-glyph', GLYPH[syn.family]), ` ${FAMILY_NAMES[syn.family]}`);
      const members = UNIT_LIST.filter((u) => u.family === syn.family)
        .map((u) => u.name)
        .join(', ');
      block.append(head, el('p', 'col-members', members));
      for (const t of syn.tiers) {
        const p = el('p', 'col-tier');
        p.append(el('b', '', `${t.count} фигуры · ${t.name}`), el('span', '', t.description));
        block.append(p);
      }
      return block;
    });
  }
}
