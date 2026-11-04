// Статика мини-аппа + WebSocket-релей «компьютер -> мини-апп».
// Релей ничего не хранит: хост шлёт 10 байт (уровни полос), сервер раздаёт их зрителям комнаты.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
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

// room -> { host: ws|null, viewers: Set<ws> }
const rooms = new Map();
const MAX_ROOMS = 1000;
const MAX_VIEWERS = 20;
const ROOM_RE = /^[A-Z0-9]{6}$/;

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 });

server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url || '/', 'http://x');
  if (u.pathname !== '/ws') return socket.destroy();
  const room = (u.searchParams.get('room') || '').toUpperCase();
  const role = u.searchParams.get('role');
  if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'view')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws, room, role));
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

function onConnect(ws, code, role) {
  const r = getRoom(code);
  if (!r) return ws.close(1013, 'busy');
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  if (role === 'host') {
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
    ws.on('close', () => {
      if (r.host === ws) {
        r.host = null;
        r.viewers.forEach((v) => sendJson(v, { t: 'host', on: false }));
      }
      cleanup(code);
    });
  } else {
    if (r.viewers.size >= MAX_VIEWERS) return ws.close(1013, 'room full');
    r.viewers.add(ws);
    sendJson(ws, { t: 'host', on: !!r.host });
    notifyHost(r);
    ws.on('message', () => {}); // зрители ничего не шлют
    ws.on('close', () => {
      r.viewers.delete(ws);
      notifyHost(r);
      cleanup(code);
    });
  }
  ws.on('error', () => {});
}

// пинг, чтобы прокси Render не рвал «тихие» соединения и умершие клиенты чистились
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 25000);

server.listen(PORT, () => console.log(`Skycoder mini app on :${PORT}`));
