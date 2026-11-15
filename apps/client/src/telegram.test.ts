import { describe, expect, it } from 'vitest';
import { launchedInTelegram, themeOverrides } from './telegram';

describe('Telegram Mini App', () => {
  it('узнаёт запуск в Telegram по параметрам в адресе', () => {
    expect(
      launchedInTelegram({ hash: '#tgWebAppData=query_id%3D1&tgWebAppVersion=8.0', search: '' }),
    ).toBe(true);
    expect(launchedInTelegram({ hash: '#/play', search: '' })).toBe(false);
    expect(launchedInTelegram({ hash: '', search: '?tgWebAppStartParam=x' })).toBe(false);
  });

  it('тема Telegram → токены интерфейса; мусор игнорируется', () => {
    expect(
      themeOverrides({
        bg_color: '#FFFFFF',
        text_color: '#000000',
        button_color: 'red',
        hint_color: '#999999',
      }),
    ).toEqual({ bg: '#ffffff', text: '#000000', textMuted: '#999999' });
  });
});
