import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, RULES } from './server.mjs';

const A = { 'x-device-id': 'device-aaaa-1111' }, B = { 'x-device-id': 'device-bbbb-2222' };
const pier = { name: 'Pier wall', character: 'alien', move: 'hop', lat: 47.6062, lng: -122.3421, prompt: 'an alien jumping over the wall' };
const post = (app, path, h, body) => app.handle('POST', path, h, JSON.stringify(body || {}));

test('create is metered and charged', async () => {
  const app = createApp();
  const r = await post(app, '/v1/creations', A, pier);
  assert.equal(r.status, 201);
  assert.equal((await app.handle('GET', '/v1/me', A)).body.credits, RULES.startCredits - RULES.createCost);
});

test('prompt is checked before anything is created or charged', async () => {
  const app = createApp();
  const r = await post(app, '/v1/creations', A, { ...pier, prompt: 'a dog with a gun' });
  assert.equal(r.status, 422); assert.equal(r.body.word, 'gun');
  assert.equal((await app.handle('GET', '/v1/me', A)).body.credits, RULES.startCredits);
});

test('validation and auth', async () => {
  const app = createApp();
  assert.equal((await post(app, '/v1/creations', {}, pier)).status, 401);
  assert.equal((await post(app, '/v1/creations', A, { ...pier, character: 'dragon' })).status, 400);
  assert.equal((await post(app, '/v1/creations', A, { ...pier, lat: 123 })).status, 400);
  assert.equal((await app.handle('POST', '/v1/creations', A, '{oops')).status, 400);
});

test('nearby search returns close creations, nearest first', async () => {
  const app = createApp();
  await post(app, '/v1/creations', A, pier);
  await post(app, '/v1/creations', A, { ...pier, name: 'Market sign', lat: 47.6097, lng: -122.3422 });
  await post(app, '/v1/creations', A, { ...pier, name: 'Portland', lat: 45.5152, lng: -122.6784 });
  const r = await app.handle('GET', '/v1/creations?lat=47.6063&lng=-122.3420&radiusKm=2');
  assert.deepEqual(r.body.items.map(i => i.name), ['Pier wall', 'Market sign']);
  assert.ok(r.body.items[0].distanceKm < 0.1);
  assert.equal(r.body.items[0].owner, undefined);
});

test('likes pay the creator once; no self-likes', async () => {
  const app = createApp();
  const id = (await post(app, '/v1/creations', A, pier)).body.id;
  assert.equal((await post(app, `/v1/creations/${id}/like`, A)).status, 403);
  await post(app, `/v1/creations/${id}/like`, B);
  const again = await post(app, `/v1/creations/${id}/like`, B);
  assert.equal(again.body.likes, 1);
  assert.equal((await app.handle('GET', '/v1/me', A)).body.credits, RULES.startCredits - RULES.createCost + RULES.likeReward);
});

test('enough distinct flags hides a creation for review', async () => {
  const app = createApp();
  const id = (await post(app, '/v1/creations', A, pier)).body.id;
  for (let i = 0; i < RULES.flagsToHide; i++) {
    await post(app, `/v1/creations/${id}/flag`, B, { reason: 'x' });          // repeat flags from one account count once
    assert.equal((await app.handle('GET', `/v1/creations/${id}`)).status, 200);
  }
  await post(app, `/v1/creations/${id}/flag`, { 'x-device-id': 'device-cccc-3333' });
  await post(app, `/v1/creations/${id}/flag`, { 'x-device-id': 'device-dddd-4444' });
  assert.equal((await app.handle('GET', `/v1/creations/${id}`)).status, 404);
  assert.equal((await app.handle('GET', '/v1/creations?lat=47.6062&lng=-122.3421')).body.items.length, 0);
});

test('daily limit and running out of credits', async () => {
  let t = 1e12; const app = createApp(':memory:', () => t);
  for (let i = 0; i < RULES.dailyCreateLimit; i++) assert.equal((await post(app, '/v1/creations', A, pier)).status, 201);
  assert.equal((await post(app, '/v1/creations', A, pier)).status, 429);
  t += 2 * 864e5;
  for (let i = 0; i < RULES.startCredits - RULES.dailyCreateLimit; i++) await post(app, '/v1/creations', A, pier);
  t += 2 * 864e5;
  assert.equal((await post(app, '/v1/creations', A, pier)).status, 402);
});

test('collaboration: add to someone else\'s creation; target round-trips', async () => {
  const app = createApp();
  const target = Buffer.from('fake-target-bytes').toString('base64');
  const id = (await post(app, '/v1/creations', A, { ...pier, target })).body.id;
  const child = await post(app, '/v1/creations', B, { ...pier, name: 'Dog friend', character: 'dog', move: 'dance', parent: id });
  assert.equal(child.body.parent, id);
  assert.equal((await post(app, '/v1/creations', B, { ...pier, parent: 999 })).status, 404);
  assert.equal((await app.handle('GET', `/v1/creations/${id}/target`)).raw.toString(), 'fake-target-bytes');
});
