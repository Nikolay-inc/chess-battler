import type { Account } from '../account';
import { GLYPH } from '../board-view';
import { familyName, locale, t } from '../i18n';
import type { UiKey } from '../i18n';
import { AVATARS, validNickname } from '../profile-store';
import type { AvatarId, ProfileStore } from '../profile-store';
import { $, el, toast } from '../ui';

const AVATAR_GLYPH: Record<string, string> = {
  pawn: GLYPH.legion,
  knight: GLYPH.riders,
  bishop: GLYPH.mystics,
  rook: GLYPH.guards,
};
const AVATAR_COLOR: Record<string, string> = {
  accent: 'var(--color-accent)',
  a: 'var(--color-side-a)',
  b: 'var(--color-side-b)',
};

/** Кружок аватара из набора (глиф семьи + цвет из токенов). */
export function avatarEl(id: string | null, cls = 'avatar'): HTMLElement {
  const [piece, color] = (id ?? 'knight-accent').split('-');
  const a = el('div', cls, AVATAR_GLYPH[piece ?? 'knight'] ?? GLYPH.riders);
  a.style.color = AVATAR_COLOR[color ?? 'accent'] ?? AVATAR_COLOR.accent!;
  a.setAttribute('aria-hidden', 'true');
  return a;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class ProfileScreen {
  private editing = false;
  /** Аккаунтное действие в процессе (кнопки заблокированы). */
  private busy = false;

  constructor(
    private readonly account: Account,
    private readonly store: ProfileStore,
    private readonly isVisible: () => boolean,
  ) {
    const refresh = () => {
      if (this.isVisible()) this.render();
    };
    account.onChange(refresh);
    store.onChange(refresh);
  }

  render(): void {
    const root = $('profile');
    root.replaceChildren(
      this.header(),
      ...this.accountSection(),
      this.statsSection(),
      this.historySection(),
    );
  }

  // ---------- Шапка: аватар, ник, правка ----------

  private header(): HTMLElement {
    const p = this.store.profile;
    const s = this.account.state;
    const box = el('section', 'profile-head');
    if (this.editing) return this.editForm();

    const card = el('div', 'profile-card');
    const who = el('div', 'profile-who');
    const status = s.anonymous
      ? t('profile.notLinked')
      : s.providers.includes('telegram')
        ? t('profile.linkedTelegram')
        : s.providers.includes('google') && !s.email
          ? t('profile.linkedGoogle')
          : t('profile.linkedEmail', { email: s.email ?? '' });
    who.append(
      el('strong', 'profile-name', p.nickname ?? t('profile.guest')),
      el('span', 'muted', status),
    );
    const edit = el('button', 'secondary small', t('profile.edit'));
    edit.type = 'button';
    edit.addEventListener('click', () => {
      this.editing = true;
      this.render();
    });
    card.append(avatarEl(p.avatar), who, edit);
    box.append(card);
    return box;
  }

  private editForm(): HTMLElement {
    const p = this.store.profile;
    const form = el('form', 'profile-edit') as HTMLFormElement;
    const label = el('label', 'field');
    const input = el('input', 'input') as HTMLInputElement;
    input.value = p.nickname ?? '';
    input.placeholder = t('profile.nicknamePlaceholder');
    input.maxLength = 20;
    input.setAttribute('autocomplete', 'nickname');
    label.append(el('span', 'setting-label', t('profile.nickname')), input);
    const err = el('p', 'hint error');
    err.hidden = true;

    let avatar: AvatarId | null = (p.avatar as AvatarId | null) ?? null;
    const grid = el('div', 'avatar-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', t('profile.avatar'));
    for (const id of AVATARS) {
      const b = el('button', 'avatar-pick');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === avatar));
      b.setAttribute('aria-label', id);
      b.append(avatarEl(id, 'avatar small'));
      b.addEventListener('click', () => {
        avatar = id;
        for (const x of grid.children) x.setAttribute('aria-checked', String(x === b));
      });
      grid.append(b);
    }

    const buttons = el('div', 'row-buttons');
    const cancel = el('button', 'secondary', t('profile.cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      this.editing = false;
      this.render();
    });
    const save = el('button', 'fight', t('profile.save'));
    save.type = 'submit';
    buttons.append(cancel, save);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nickname = input.value.trim() === '' ? null : validNickname(input.value);
      if (input.value.trim() !== '' && !nickname) {
        err.textContent = t('profile.nicknameInvalid');
        err.hidden = false;
        return;
      }
      this.editing = false;
      void this.store.saveProfile({ nickname, avatar }).then((ok) => {
        toast(ok ? t('profile.saved') : t('profile.error', { error: '—' }));
      });
      this.render();
    });
    form.append(label, err, el('span', 'setting-label', t('profile.avatar')), grid, buttons);
    return form;
  }

  // ---------- Аккаунт ----------

  private accountSection(): HTMLElement[] {
    const s = this.account.state;
    const box = el('section', 'page-section');
    box.append(el('h2', 'section-title', t('profile.account')));

    if (s.status === 'disabled' || s.status === 'offline') {
      box.append(
        el('p', 'hint', t(s.status === 'disabled' ? 'profile.authDisabled' : 'profile.offline')),
      );
      return [box];
    }
    if (s.status === 'loading') {
      box.append(el('p', 'hint', t('profile.loading')));
      return [box];
    }

    if (s.anonymous) {
      box.append(el('p', 'hint', t('profile.linkHint')));
      box.append(
        this.emailForm('profile.linkEmail', async (email) => {
          const r = await this.account.linkEmail(email);
          return r.ok ? t('profile.linkEmailSent', { email }) : null;
        }),
      );
      const google = el('button', 'secondary wide', t('profile.linkGoogle'));
      google.type = 'button';
      google.disabled = this.busy;
      google.addEventListener(
        'click',
        () =>
          void this.act(async () => {
            const r = await this.account.linkGoogle();
            if (!r.ok) toast(t('profile.googleUnavailable'));
          }),
      );
      box.append(google);
      const other = el('details', 'have-account');
      other.append(el('summary', '', t('profile.haveAccount')));
      other.append(
        this.emailForm('profile.signIn', async (email) => {
          const r = await this.account.signInWithEmail(email);
          return r.ok ? t('profile.signInSent', { email }) : null;
        }),
      );
      box.append(other);
      return [box];
    }

    const out = el('button', 'secondary wide', t('profile.signOut'));
    out.type = 'button';
    out.disabled = this.busy;
    out.addEventListener('click', () => {
      if (!confirm(t('profile.signOutConfirm'))) return;
      void this.act(async () => {
        const r = await this.account.signOut();
        if (!r.ok) toast(t('profile.error', { error: r.error }));
      });
    });
    const del = el('button', 'danger wide', t('profile.deleteAccount'));
    del.type = 'button';
    del.disabled = this.busy;
    del.addEventListener('click', () => {
      if (!confirm(t('profile.deleteConfirm'))) return;
      void this.act(async () => {
        const r = await this.account.deleteAccount();
        toast(r.ok ? t('profile.deleted') : t('profile.error', { error: r.error }));
      });
    });
    // Аккаунт Telegram входит сам при каждом запуске — «Выйти» не имеет смысла.
    if (s.providers.includes('telegram')) box.append(del);
    else box.append(out, del);
    return [box];
  }

  /** Поле email + кнопка; onSend возвращает текст успеха или null (ошибка). */
  private emailForm(button: UiKey, onSend: (email: string) => Promise<string | null>): HTMLElement {
    const form = el('form', 'email-form') as HTMLFormElement;
    const input = el('input', 'input') as HTMLInputElement;
    input.type = 'email';
    input.inputMode = 'email';
    input.autocomplete = 'email';
    input.placeholder = t('profile.emailPlaceholder');
    input.setAttribute('aria-label', t('profile.emailPlaceholder'));
    const send = el('button', 'secondary', t(button));
    send.type = 'submit';
    send.disabled = this.busy;
    const note = el('p', 'hint');
    note.hidden = true;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!EMAIL.test(email)) {
        note.textContent = t('profile.emailInvalid');
        note.hidden = false;
        return;
      }
      void this.act(async () => {
        const ok = await onSend(email);
        toast(ok ?? t('profile.error', { error: '—' }));
        if (ok) {
          note.textContent = ok;
          note.hidden = false;
        }
      }, false);
    });
    form.append(input, send, note);
    return form;
  }

  private async act(fn: () => Promise<void>, rerender = true): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
    } finally {
      this.busy = false;
      if (rerender) this.render();
    }
  }

  // ---------- Статистика и история ----------

  private statsSection(): HTMLElement {
    const st = this.store.stats;
    const grid = el('div', 'stat-grid');
    const best = st.best
      ? st.best.result === 'won'
        ? t('profile.bestWon')
        : t('count.winsCount', { n: st.best.wins })
      : '—';
    const cells: [string, UiKey][] = [
      [String(st.runs), 'profile.runs'],
      [String(st.wins), 'profile.wins'],
      [best, 'profile.best'],
      [st.favorite ? familyName(st.favorite) : '—', 'profile.favorite'],
    ];
    for (const [value, label] of cells) {
      const c = el('div', 'stat');
      c.append(el('strong', '', value), el('span', '', t(label)));
      grid.append(c);
    }
    return grid;
  }

  private historySection(): HTMLElement {
    const box = el('section', 'page-section');
    box.append(el('h2', 'section-title', t('profile.history')));
    const runs = this.store.history;
    if (runs.length === 0) {
      box.append(el('p', 'empty', t('profile.historyEmpty')));
      return box;
    }
    const list = el('ul', 'history');
    const fmt = new Intl.DateTimeFormat(locale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    for (const r of runs) {
      const li = el('li', `history-row ${r.result}`);
      li.append(
        el('span', 'history-date', fmt.format(new Date(r.finished_at))),
        el(
          'strong',
          '',
          r.result === 'won' ? t('profile.resultWon') : t('profile.resultLost', { wins: r.wins }),
        ),
        el('span', 'muted', `${r.rounds} ${t('count.roundsWord', { n: r.rounds })}`),
      );
      list.append(li);
    }
    box.append(list);
    return box;
  }
}
