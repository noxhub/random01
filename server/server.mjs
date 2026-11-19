// Pop-Up Places API, v0. Zero dependencies: Node 22+ (node:http, node:sqlite).
// Identity is a device id header for now; real accounts replace it later.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const BLOCKED = /\b(kill\w*|blood\w*|gore|gory|guns?|shoot\w*|stab\w*|murder\w*|nude|naked|sex\w*|porn\w*|drugs?|drunk|weapons?|knife|knives|bomb\w*|corpse|dead|fight\w*|punch\w*|hate\w*)\b/i;
const CHARACTERS = ['alien', 'dog', 'robot'];
const MOVES = ['hop', 'dance', 'peek', 'fly'];

export const RULES = {
  startCredits: 20,     // every new account
  createCost: 1,        // credits per published creation
  likeReward: 1,        // credits a creator earns per like
  dailyCreateLimit: 10, // per account
  flagsToHide: 3,       // distinct flags before a creation is pulled for review
  maxTargetBytes: 3_000_000,
};

export function createApp(dbPath = ':memory:', now = () => Date.now()) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, credits INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS creations(
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT,
      character TEXT NOT NULL, move TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, aspect REAL NOT NULL,
      target BLOB, parent INTEGER, status TEXT NOT NULL DEFAULT 'published', likes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS creations_geo ON creations(lat, lng);
    CREATE TABLE IF NOT EXISTS likes(creation INTEGER, user TEXT, PRIMARY KEY(creation, user));
    CREATE TABLE IF NOT EXISTS flags(creation INTEGER, user TEXT, reason TEXT, created INTEGER, PRIMARY KEY(creation, user));
    CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, delta INTEGER, reason TEXT, ref INTEGER, created INTEGER);
  `);

  const q = (sql) => db.prepare(sql);
  const user = (id) => {
    let u = q('SELECT * FROM users WHERE id=?').get(id);
    if (!u) {
      q('INSERT INTO users(id,credits,created) VALUES(?,?,?)').run(id, RULES.startCredits, now());
      q('INSERT INTO ledger(user,delta,reason,created) VALUES(?,?,?,?)').run(id, RULES.startCredits, 'welcome', now());
      u = q('SELECT * FROM users WHERE id=?').get(id);
    }
    return u;
  };
  const credit = (id, delta, reason, ref) => {
    q('UPDATE users SET credits=credits+? WHERE id=?').run(delta, id);
    q('INSERT INTO ledger(user,delta,reason,ref,created) VALUES(?,?,?,?,?)').run(id, delta, reason, ref ?? null, now());
  };
  const pub = (c) => ({ id: c.id, name: c.name, prompt: c.prompt, character: c.character, move: c.move, lat: c.lat, lng: c.lng,
    aspect: c.aspect, parent: c.parent, likes: c.likes, created: c.created, hasTarget: c.hasTarget === 1 });
  const COLS = 'id,owner,name,prompt,character,move,lat,lng,aspect,parent,status,likes,created,(target IS NOT NULL) AS hasTarget';
  const km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
  const fail = (status, error, extra) => ({ status, body: { error, ...extra } });

  const routes = {
    'GET /v1/me': ({ me }) => ({ body: { id: me.id, credits: me.credits } }),

    'POST /v1/creations': ({ me, body }) => {
      const { name, prompt = '', character, move, lat, lng, aspect = 0.5625, target, parent } = body;
      if (typeof name !== 'string' || !name.trim() || name.length > 60) return fail(400, 'name is required (60 characters max)');
      if (!CHARACTERS.includes(character) || !MOVES.includes(move)) return fail(400, 'unknown character or move');
      if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return fail(400, 'a valid location is required');
      if (!(aspect > 0.2 && aspect < 5)) return fail(400, 'invalid aspect');
      const bad = `${name} ${prompt}`.match(BLOCKED);          // checked before anything is created or charged
      if (bad) return fail(422, 'not allowed: all-ages content only', { word: bad[0] });
      const today = q('SELECT COUNT(*) n FROM creations WHERE owner=? AND created>?').get(me.id, now() - 864e5).n;
      if (today >= RULES.dailyCreateLimit) return fail(429, 'daily creation limit reached');
      if (me.credits < RULES.createCost) return fail(402, 'not enough credits');
      if (parent != null && !q("SELECT 1 FROM creations WHERE id=? AND status='published'").get(parent)) return fail(404, 'parent creation not found');
      let blob = null;
      if (target) { blob = Buffer.from(target, 'base64'); if (blob.length > RULES.maxTargetBytes) return fail(413, 'target too large'); }
      const r = q('INSERT INTO creations(owner,name,prompt,character,move,lat,lng,aspect,target,parent,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(me.id, name.trim(), String(prompt).slice(0, 300), character, move, lat, lng, aspect, blob, parent ?? null, now());
      credit(me.id, -RULES.createCost, 'create', Number(r.lastInsertRowid));
      return { status: 201, body: pub(q(`SELECT ${COLS} FROM creations WHERE id=?`).get(r.lastInsertRowid)) };
    },

    'GET /v1/creations': ({ query }) => {
      const lat = +query.get('lat'), lng = +query.get('lng'), radius = Math.min(+query.get('radiusKm') || 2, 50);
      if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180) || !query.has('lat')) return fail(400, 'lat and lng are required');
      const dLat = radius / 111, dLng = radius / (111 * Math.max(0.1, Math.cos(lat * Math.PI / 180)));
      const rows = q(`SELECT ${COLS} FROM creations WHERE status='published' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
        .all(lat - dLat, lat + dLat, lng - dLng, lng + dLng);
      const items = rows.map(c => ({ ...pub(c), distanceKm: +km(lat, lng, c.lat, c.lng).toFixed(3) }))
        .filter(c => c.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 100);
      return { body: { items } };
    },

    'GET /v1/creations/:id': ({ id }) => {
      const c = q(`SELECT ${COLS} FROM creations WHERE id=? AND status='published'`).get(id);
      return c ? { body: pub(c) } : fail(404, 'not found');
    },

    'GET /v1/creations/:id/target': ({ id }) => {
      const c = q("SELECT target FROM creations WHERE id=? AND status='published'").get(id);
      return c?.target ? { raw: Buffer.from(c.target) } : fail(404, 'not found');
    },

    'POST /v1/creations/:id/like': ({ me, id }) => {
      const c = q("SELECT owner FROM creations WHERE id=? AND status='published'").get(id);
      if (!c) return fail(404, 'not found');
      if (c.owner === me.id) return fail(403, 'you cannot like your own creation');
      if (q('INSERT OR IGNORE INTO likes(creation,user) VALUES(?,?)').run(id, me.id).changes) {
        q('UPDATE creations SET likes=likes+1 WHERE id=?').run(id);
        credit(c.owner, RULES.likeReward, 'like', id);
      }
      return { body: { likes: q('SELECT likes FROM creations WHERE id=?').get(id).likes } };
    },

    'POST /v1/creations/:id/flag': ({ me, id, body }) => {
      if (!q('SELECT 1 FROM creations WHERE id=?').get(id)) return fail(404, 'not found');
      q('INSERT OR IGNORE INTO flags(creation,user,reason,created) VALUES(?,?,?,?)').run(id, me.id, String(body.reason || '').slice(0, 200), now());
      const n = q('SELECT COUNT(*) n FROM flags WHERE creation=?').get(id).n;
      // Enough distinct flags pulls it from the map until review. The AI review step plugs in here.
      if (n >= RULES.flagsToHide) q("UPDATE creations SET status='review' WHERE id=? AND status='published'").run(id);
      return { body: { flagged: true } };
    },
  };

  async function handle(method, url, headers = {}, rawBody = '') {
    const u = new URL(url, 'http://x');
    const parts = u.pathname.replace(/\/$/, '').split('/');
    let key = `${method} ${u.pathname.replace(/\/$/, '')}`, id;
    if (!routes[key] && parts[2] === 'creations' && /^\d+$/.test(parts[3] || '')) {
      id = +parts[3]; key = `${method} /v1/creations/:id${parts[4] ? '/' + parts[4] : ''}`;
    }
    const route = routes[key];
    if (!route) return fail(404, 'no such route');
    const device = headers['x-device-id'];
    if (method !== 'GET' || key === 'GET /v1/me') {
      if (!device || !/^[\w-]{8,64}$/.test(device)) return fail(401, 'x-device-id header is required');
    }
    let body = {};
    if (rawBody) { try { body = JSON.parse(rawBody); } catch { return fail(400, 'invalid JSON'); } }
    return { status: 200, ...route({ me: device ? user(device) : null, body, query: u.searchParams, id }) };
  }

  const server = http.createServer(async (req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-device-id', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let raw = ''; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 5_000_000) { res.writeHead(413, cors); return res.end(); } raw += chunk; }
    let out;
    try { out = await handle(req.method, req.url, req.headers, raw); } catch (e) { console.error(e); out = fail(500, 'server error'); }
    if (out.raw) { res.writeHead(200, { ...cors, 'content-type': 'application/octet-stream' }); return res.end(out.raw); }
    res.writeHead(out.status || 200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body));
  });
  return { handle, server, db };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 8080;
  createApp(process.env.DB_PATH || 'popup-places.db').server.listen(port, () => console.log(`Pop-Up Places API on :${port}`));
}
