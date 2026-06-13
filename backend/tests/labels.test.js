import { beforeEach, describe, expect, it } from 'vitest';

import { api, createOwnerWithNursery, setFreePlan } from './helpers.js';

function binaryParser(res, cb) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
}

function countPages(buf) {
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('M12 — Этикетки', () => {
  let ctx;
  let base;
  let plantIds;

  beforeEach(async () => {
    ctx = await createOwnerWithNursery();
    base = `/api/nurseries/${ctx.nurseryId}/plants`;
    plantIds = [];
    for (let i = 0; i < 5; i += 1) {
      const p = await api().post(base).set('Cookie', ctx.cookie).send({ variety: `L${i}` });
      plantIds.push(p.body.id);
    }
  });

  it('feature_qr обязательна → 403', async () => {
    await setFreePlan({ feature_qr: false });
    const res = await api()
      .post(`${base}/labels`)
      .set('Cookie', ctx.cookie)
      .send({ plantIds: [plantIds[0]], layout: 'grid' });
    expect(res.status).toBe(403);
  });

  it('PDF генерируется', async () => {
    const res = await api()
      .post(`${base}/labels`)
      .set('Cookie', ctx.cookie)
      .send({ plantIds: [plantIds[0]], layout: 'grid' })
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('несуществующий plantId → 404', async () => {
    const res = await api()
      .post(`${base}/labels`)
      .set('Cookie', ctx.cookie)
      .send({ plantIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(res.status).toBe(404);
  });

  it('layout grid — одна страница A4 (≤12 шт.)', async () => {
    const res = await api()
      .post(`${base}/labels`)
      .set('Cookie', ctx.cookie)
      .send({ plantIds, layout: 'grid' })
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(countPages(res.body)).toBe(1);
  });

  it('layout single — страница на растение', async () => {
    const res = await api()
      .post(`${base}/labels`)
      .set('Cookie', ctx.cookie)
      .send({ plantIds: plantIds.slice(0, 3), layout: 'single' })
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(countPages(res.body)).toBe(3);
  });
});
