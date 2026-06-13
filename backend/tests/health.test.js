import { describe, expect, it } from 'vitest';

import { api } from './helpers.js';

describe('Health', () => {
  it('GET /api/health → ok + db connected', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});
