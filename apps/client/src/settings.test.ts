import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('настройки', () => {
  it('битые и неизвестные значения заменяются значениями по умолчанию', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{oops')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ locale: 'de', speed: 3, sound: 'yes' }))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('корректные значения сохраняются', () => {
    const s = { locale: 'uk', sound: false, music: false, speed: 4, vibration: false };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
});
