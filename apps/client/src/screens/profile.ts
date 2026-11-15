import { $, el } from '../ui';

/** Профиль — каркас: данные (ник, аватар, статистика, история) подключаются в подэтапе C. */
export function renderProfile(): void {
  const root = $('profile');
  root.replaceChildren();

  const card = el('div', 'profile-card');
  const avatar = el('div', 'avatar', '♞');
  avatar.setAttribute('aria-hidden', 'true');
  const who = el('div', 'profile-who');
  who.append(el('strong', 'profile-name', 'Гость'), el('span', 'muted', 'Аккаунт не привязан'));
  card.append(avatar, who);

  const link = el('button', 'secondary wide', 'Привязать аккаунт');
  link.type = 'button';
  link.disabled = true;
  const linkHint = el('p', 'hint', 'Скоро: вход по email и через Google — прогресс сохранится');

  const stats = el('div', 'stat-grid');
  for (const label of ['Забеги', 'Победы', 'Лучший результат', 'Любимая семья']) {
    const s = el('div', 'stat');
    s.append(el('strong', '', '—'), el('span', '', label));
    stats.append(s);
  }

  const history = el('section', 'page-section');
  history.append(
    el('h2', 'section-title', 'Последние забеги'),
    el('p', 'empty', 'Здесь появится история ваших забегов'),
  );

  root.append(card, link, linkHint, stats, history);
}
