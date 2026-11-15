import type { RunState } from '@chess-battler/sim';
import { t } from './i18n';

export type TutorialStep = 'buy' | 'place' | 'fight';
const ORDER: readonly TutorialStep[] = ['buy', 'place', 'fight'];
export const TUTORIAL_KEY = 'chess-battler.tutorial.v1';

/** Шаг обучения по состоянию забега: нет фигур → купить; на скамейке → поставить; на поле → в бой. */
export function tutorialStep(s: RunState): TutorialStep {
  if (s.board.length > 0) return 'fight';
  if (s.bench.some((b) => b !== null)) return 'place';
  return 'buy';
}

interface StepView {
  readonly text: () => string;
  /** Прямоугольник, на который указывает подсказка. */
  anchor(): DOMRect | null;
}

/** Подсказки первого запуска: купить → поставить → в бой. */
export class Tutorial {
  private step: TutorialStep | null;
  private readonly steps: Record<TutorialStep, StepView>;
  private readonly text: HTMLElement;

  constructor(
    private readonly bubble: HTMLElement,
    anchors: {
      shop: () => DOMRect | null;
      board: () => DOMRect | null;
      fight: () => DOMRect | null;
    },
  ) {
    this.step = Tutorial.done() ? null : 'buy';
    this.steps = {
      buy: { text: () => t('tutorial.buy'), anchor: anchors.shop },
      place: { text: () => t('tutorial.place'), anchor: anchors.board },
      fight: { text: () => t('tutorial.fight'), anchor: anchors.fight },
    };
    this.text = bubble.querySelector('.coach-text')!;
    bubble.querySelector('.coach-skip')!.addEventListener('click', () => this.finish());
    window.addEventListener('resize', () => this.position());
  }

  static done(): boolean {
    try {
      return localStorage.getItem(TUTORIAL_KEY) === 'done';
    } catch {
      return false;
    }
  }

  get active(): TutorialStep | null {
    return this.step;
  }

  /** Обновить подсказку по состоянию (после каждой перерисовки подготовки). */
  update(s: RunState): void {
    if (this.step === null) return this.hide();
    // Только вперёд: продажа последней фигуры не возвращает к первому шагу.
    const derived = tutorialStep(s);
    if (ORDER.indexOf(derived) > ORDER.indexOf(this.step)) this.step = derived;
    const n = ORDER.indexOf(this.step) + 1;
    this.text.textContent = t('tutorial.step', { n, text: this.steps[this.step].text() });
    this.bubble.hidden = false;
    this.position();
  }

  /** Игрок нажал «В бой» — обучение пройдено. */
  onFight(): void {
    if (this.step !== null) this.finish();
  }

  hide(): void {
    this.bubble.hidden = true;
  }

  private finish(): void {
    this.step = null;
    this.hide();
    try {
      localStorage.setItem(TUTORIAL_KEY, 'done');
    } catch {
      // без хранилища обучение покажется снова — не страшно
    }
  }

  /** Пузырь над целью, стрелка — на её центр. */
  private position(): void {
    if (this.step === null || this.bubble.hidden) return;
    const r = this.steps[this.step].anchor();
    if (!r) return;
    // Сначала в левый верхний угол: иначе у края экрана пузырь ужимается и замер врёт.
    this.bubble.style.left = '0px';
    this.bubble.style.top = '0px';
    const b = this.bubble.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(
      window.innerWidth - b.width - margin,
      Math.max(margin, r.left + r.width / 2 - b.width / 2),
    );
    const top = Math.max(margin, r.top - b.height - 12);
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
    const arrowX = Math.min(b.width - 18, Math.max(18, r.left + r.width / 2 - left));
    this.bubble.style.setProperty('--arrow-x', `${arrowX}px`);
  }
}
