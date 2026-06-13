import { describe, expect, it } from 'vitest';

import { api, db, register, STRONG_PASSWORD, toCookieHeader, uniqueEmail } from './helpers.js';

function cookieValue(setCookie, name) {
  const arr = setCookie ?? [];
  const found = arr.find((c) => c.startsWith(`${name}=`));
  if (!found) {
    return null;
  }
  const value = found.slice(name.length + 1).split(';')[0];
  return value === '' ? null : value;
}

describe('M2 — Аутентификация', () => {
  it('регистрация создаёт аккаунт и trial-подписку (201)', async () => {
    const email = uniqueEmail('reg');
    const res = await register(email, STRONG_PASSWORD, 'Reg');
    expect(res.status).toBe(201);
    const account = await db('accounts').where({ email }).first();
    expect(account).toBeTruthy();
    const sub = await db('subscriptions').where({ account_id: account.id }).first();
    expect(sub.status).toBe('trial');
  });

  it('повторная регистрация с тем же email → 409', async () => {
    const email = uniqueEmail('dup');
    await register(email, STRONG_PASSWORD, 'Acc One');
    const res = await register(email, STRONG_PASSWORD, 'Acc Two');
    expect(res.status).toBe(409);
  });

  it('слабый пароль при регистрации → 400', async () => {
    const res = await register(uniqueEmail('weak'), '123', 'Weak User');
    expect(res.status).toBe(400);
  });

  it('логин ставит HttpOnly куки access+refresh', async () => {
    const email = uniqueEmail('login');
    await register(email, STRONG_PASSWORD, 'Login User');
    const res = await api().post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    const httpOnly = res.headers['set-cookie'].filter(
      (c) => /^(access_token|refresh_token)=/.test(c) && /httponly/i.test(c)
    );
    expect(httpOnly).toHaveLength(2);
  });

  it('неверный пароль → 401', async () => {
    const email = uniqueEmail('badpass');
    await register(email, STRONG_PASSWORD, 'Login User');
    const res = await api().post('/api/auth/login').send({ email, password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  it('несуществующий email при логине → 401', async () => {
    const res = await api().post('/api/auth/login').send({ email: uniqueEmail('ghost'), password: STRONG_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('refresh обновляет access-токен', async () => {
    const email = uniqueEmail('refresh');
    await register(email, STRONG_PASSWORD, 'Refresh User');
    const login = await api().post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    const oldAccess = cookieValue(login.headers['set-cookie'], 'access_token');
    const cookie = toCookieHeader(login.headers['set-cookie']);

    await new Promise((r) => setTimeout(r, 1100));
    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const newAccess = cookieValue(res.headers['set-cookie'], 'access_token');
    expect(newAccess).toBeTruthy();
    expect(newAccess).not.toBe(oldAccess);
  });

  it('refresh без токена → 401', async () => {
    const res = await api().post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('смена пароля работает, потом логин с новым паролем', async () => {
    const email = uniqueEmail('chpass');
    const newPassword = 'Passw0rd!24';
    await register(email, STRONG_PASSWORD, 'Change User');
    const login = await api().post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    const cookie = toCookieHeader(login.headers['set-cookie']);

    const change = await api()
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: STRONG_PASSWORD, newPassword });
    expect(change.status).toBe(200);

    const relogin = await api().post('/api/auth/login').send({ email, password: newPassword });
    expect(relogin.status).toBe(200);
  });

  it('смена пароля с неверным текущим паролем → 400', async () => {
    const email = uniqueEmail('chbad');
    await register(email, STRONG_PASSWORD, 'Change User');
    const login = await api().post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    const cookie = toCookieHeader(login.headers['set-cookie']);
    const res = await api()
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'WrongCurrent1!', newPassword: 'Passw0rd!24' });
    expect(res.status).toBe(400);
  });

  it('смена пароля без токена → 401', async () => {
    const res = await api()
      .post('/api/auth/change-password')
      .send({ currentPassword: STRONG_PASSWORD, newPassword: 'Passw0rd!24' });
    expect(res.status).toBe(401);
  });

  it('logout очищает куки', async () => {
    const email = uniqueEmail('logout');
    await register(email, STRONG_PASSWORD, 'Logout User');
    const login = await api().post('/api/auth/login').send({ email, password: STRONG_PASSWORD });
    const cookie = toCookieHeader(login.headers['set-cookie']);
    const res = await api().post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'] ?? [];
    expect(cookieValue(setCookie, 'access_token')).toBeNull();
    expect(cookieValue(setCookie, 'refresh_token')).toBeNull();
  });
});
