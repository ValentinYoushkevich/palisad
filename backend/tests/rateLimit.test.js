import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// B14 — rate limiting на аутентификации. Понижаем лимит через env и импортируем app
// динамически ПОСЛЕ подмены: тестовые файлы в vitest изолированы (свой реестр модулей),
// поэтому низкий лимит виден только здесь и не делает остальные наборы флаки.
describe('B14 — rate limiting на /api/auth/login', () => {
  let app;
  const AUTH_MAX = 3;

  beforeAll(async () => {
    vi.stubEnv('RATE_LIMIT_AUTH_MAX', String(AUTH_MAX));
    app = (await import('../app.js')).default;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it(`после ${AUTH_MAX} попыток POST /api/auth/login → 429`, async () => {
    const attempt = () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'bruteforce@palisad.test', password: 'wrong-password' });

    // Запросы в пределах лимита не должны быть 429 (реальный статус — 400/401).
    for (let i = 0; i < AUTH_MAX; i += 1) {
      const res = await attempt();
      expect(res.status).not.toBe(429);
    }

    // Следующий запрос за пределами лимита — 429 с сообщением в формате проекта.
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBeTruthy();
  });
});
