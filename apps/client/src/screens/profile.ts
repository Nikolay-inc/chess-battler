import { t } from '../i18n';
import type { UiKey } from '../i18n';
import { $, el } from '../ui';

/** Профиль — каркас: данные (ник, аватар, статистика, история) подключаются в подэтапе C. */
export function renderProfile(): void {
  const root = $('profile');
  root.replaceChildren();

  const card = el('div', 'profile-card');
  const avatar = el('div', 'avatar', '♞');
  avatar.setAttribute('aria-hidden', 'true');
  const who = el('div', 'profile-who');
  who.append(
    el('strong', 'profile-name', t('profile.guest')),
    el('span', 'muted', t('profile.notLinked')),
  );
  card.append(avatar, who);

  const link = el('button', 'secondary wide', t('profile.link'));
  link.type = 'button';
  link.disabled = true;
  const linkHint = el('p', 'hint', t('profile.linkHint'));

  const stats = el('div', 'stat-grid');
  const labels: UiKey[] = ['profile.runs', 'profile.wins', 'profile.best', 'profile.favorite'];
  for (const label of labels) {
    const s = el('div', 'stat');
    s.append(el('strong', '', '—'), el('span', '', t(label)));
    stats.append(s);
  }

  const history = el('section', 'page-section');
  history.append(
    el('h2', 'section-title', t('profile.history')),
    el('p', 'empty', t('profile.historyEmpty')),
  );

  root.append(card, link, linkHint, stats, history);
}
