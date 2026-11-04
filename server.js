// Статика мини-аппа + WebSocket-релей «компьютер -> мини-апп».
// Релей ничего не хранит: хост шлёт 10 байт (уровни полос), сервер раздаёт их зрителям комнаты.
//
// Общий эфир (для всех, кто открыл мини-апп):
//   PUBLIC_ROOM = 6 символов A-Z0-9 (код общей комнаты)
//   HOST_SECRET = пароль передатчика (без него в общую комнату транслировать нельзя)
// Личные комнаты по коду работают как раньше, без пароля.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const ROOM_RE = /^[A-Z0-9]{6}$/;
let PUBLIC_ROOM = (process.env.PUBLIC_ROOM || '').trim().toUpperCase();
if (PUBLIC_ROOM && !ROOM_RE.test(PUBLIC_ROOM)) {
  console.warn('PUBLIC_ROOM должен состоять из 6 символов A-Z0-9, общий эфир выключен');
  PUBLIC_ROOM = '';
}
const HOST_SECRET = process.env.HOST_SECRET || '';
if (PUBLIC_ROOM && !HOST_SECRET) {
  console.warn('PUBLIC_ROOM задан, но HOST_SECRET пуст: транслировать в общий эфир будет нельзя');
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const secretOk = (given) => !!HOST_SECRET && crypto.timingSafeEqual(sha(given), sha(HOST_SECRET));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// room -> { host: ws|null, viewers: Set<ws> }
const rooms = new Map();
const MAX_ROOMS = 1000;
const MAX_VIEWERS = 20;
const MAX_VIEWERS_PUBLIC = 300;
const MAX_SOCKETS_PER_IP = 12;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (p === '/config') {
    const r = PUBLIC_ROOM && rooms.get(PUBLIC_ROOM);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ room: PUBLIC_ROOM || null, live: !!(r && r.host), viewers: r ? r.viewers.size : 0 }));
  }
  if (p === '/') p = '/index.html';
  if (p === '/host') p = '/host.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Permissions-Policy': 'microphone=(self), display-capture=(self)',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 512 });
const ipCount = new Map();
const ipOf = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';

server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url || '/', 'http://x');
  if (u.pathname !== '/ws') return socket.destroy();
  const room = (u.searchParams.get('room') || '').toUpperCase();
  const role = u.searchParams.get('role');
  if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'view')) return socket.destroy();
  const ip = ipOf(req);
  if ((ipCount.get(ip) || 0) >= MAX_SOCKETS_PER_IP) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, room, role, ip));
});

function getRoom(code) {
  let r = rooms.get(code);
  if (!r) {
    if (rooms.size >= MAX_ROOMS) return null;
    r = { host: null, viewers: new Set() };
    rooms.set(code, r);
  }
  return r;
}
const sendJson = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
function cleanup(code) {
  const r = rooms.get(code);
  if (r && !r.host && r.viewers.size === 0) rooms.delete(code);
}
const notifyHost = (r) => r.host && sendJson(r.host, { t: 'viewers', n: r.viewers.size });

function attachHost(ws, r, code) {
  if (r.host && r.host !== ws) {
    try { r.host.close(4001, 'replaced'); } catch {}
  }
  r.host = ws;
  r.viewers.forEach((v) => sendJson(v, { t: 'host', on: true }));
  notifyHost(r);
  let bucket = 0, ts = Date.now();
  ws.on('message', (data, isBinary) => {
    if (!isBinary || data.length < 10 || data.length > 32) return;
    const now = Date.now(); // не больше ~120 пакетов/с
    if (now - ts > 1000) { ts = now; bucket = 0; }
    if (++bucket > 120) return;
    for (const v of r.viewers) if (v.readyState === 1) v.send(data, { binary: true });
  });
}

function onConnect(ws, code, role, ip) {
  const r = getRoom(code);
  if (!r) return ws.close(1013, 'busy');
  ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('error', () => {});
  ws.on('close', () => {
    const n = (ipCount.get(ip) || 1) - 1;
    if (n <= 0) ipCount.delete(ip); else ipCount.set(ip, n);
    if (role === 'host') {
      if (r.host === ws) {
        r.host = null;
        r.viewers.forEach((v) => sendJson(v, { t: 'host', on: false }));
      }
    } else {
      r.viewers.delete(ws);
      notifyHost(r);
    }
    cleanup(code);
  });

  if (role === 'host') {
    if (code !== PUBLIC_ROOM) return attachHost(ws, r, code);
    // общий эфир: хостом становятся только после пароля (первое сообщение)
    if (!HOST_SECRET) {
      sendJson(ws, { t: 'auth', ok: false, err: 'no-secret-configured' });
      return ws.close(4003, 'no secret configured');
    }
    const timer = setTimeout(() => ws.close(4003, 'auth timeout'), 5000);
    ws.once('message', (data, isBinary) => {
      clearTimeout(timer);
      let ok = false;
      try { ok = !isBinary && JSON.parse(data.toString()).t === 'auth' && secretOk(JSON.parse(data.toString()).secret); } catch {}
      if (!ok) {
        sendJson(ws, { t: 'auth', ok: false });
        return ws.close(4003, 'bad secret');
      }
      sendJson(ws, { t: 'auth', ok: true });
      attachHost(ws, r, code);
    });
  } else {
    const max = code === PUBLIC_ROOM ? MAX_VIEWERS_PUBLIC : MAX_VIEWERS;
    if (r.viewers.size >= max) return ws.close(1013, 'room full');
    r.viewers.add(ws);
    sendJson(ws, { t: 'host', on: !!r.host });
    notifyHost(r);
    ws.on('message', () => {}); // зрители ничего не шлют
  }
}

// пинг, чтобы прокси Render не рвал «тихие» соединения и умершие клиенты чистились
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 25000);

server.listen(PORT, () => console.log(`Skycoder mini app on :${PORT}${PUBLIC_ROOM ? ` (общий эфир: ${PUBLIC_ROOM})` : ''}`));
