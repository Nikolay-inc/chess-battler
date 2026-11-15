import { describe, expect, it } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { stateFromUser } from './account';

const user = (over: Partial<User>): User =>
  ({
    id: 'u1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '',
    ...over,
  }) as User;

describe('состояние аккаунта', () => {
  it('гость: анонимный, без способов входа', () => {
    expect(stateFromUser(user({ is_anonymous: true, identities: [] }), 'ready')).toEqual({
      status: 'ready',
      userId: 'u1',
      anonymous: true,
      email: null,
      providers: [],
    });
  });

  it('привязанный аккаунт: тот же id, email и провайдеры', () => {
    const s = stateFromUser(
      user({
        is_anonymous: false,
        email: 'a@b.co',
        identities: [{ provider: 'email' }, { provider: 'google' }] as User['identities'],
      }),
      'ready',
    );
    expect(s).toMatchObject({
      userId: 'u1',
      anonymous: false,
      email: 'a@b.co',
      providers: ['email', 'google'],
    });
  });

  it('без пользователя', () => {
    expect(stateFromUser(null, 'offline')).toMatchObject({ status: 'offline', userId: null });
  });
});
