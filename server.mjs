// Zero-dependency dev server:
//  - HTTPS (WebXR requires a secure context when the Quest loads the page over the LAN)
//  - serves the app, /data (public/data) and /node_modules (resolved via the import map)
//  - caching proxy for the public data sources, which avoids CORS issues and is polite:
//    buildings are cached forever, orbits for 6 h (CelesTrak asks for this), planes live
import https from 'node:https';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT) || 5173;
const UA = 'xray-vision-demo/0.1 (personal hobby project)';
const CACHE_DIR = join(ROOT, '.cache');
const CERT_DIR = join(ROOT, '.cert');
mkdirSync(CACHE_DIR, { recursive: true });

const SOURCES = {
  '/api/adsb': { base: 'https://api.adsb.lol', ttlMs: 0 },
  '/api/celestrak': { base: 'https://celestrak.org', ttlMs: 6 * 3600e3 },
  '/api/overpass': { base: 'https://overpass-api.de/api/interpreter', ttlMs: Infinity, overpass: true },
  // Map tiles + place search for the drop-in map. OSM's usage policy asks for caching and a
  // real User-Agent; search is limited to 1 request/second.
  '/api/osmtiles': { base: 'https://tile.openstreetmap.org', ttlMs: 7 * 86400e3 },
  '/api/search': { base: 'https://nominatim.openstreetmap.org', ttlMs: 30 * 86400e3, minIntervalMs: 1100 },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

function lanIps() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function ensureCert() {
  const key = join(CERT_DIR, 'key.pem');
  const cert = join(CERT_DIR, 'cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(CERT_DIR, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanIps().map((ip) => 'IP:' + ip)].join(',');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '825',
      '-keyout', key, '-out', cert, '-subj', '/CN=xray-vision-local', '-addext', `subjectAltName=${san}`,
    ], { stdio: 'ignore' });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const lastCall = new Map();

async function proxy(src, reqUrl, res) {
  const url = src.overpass ? src.base : src.base + reqUrl;
  const file = join(CACHE_DIR, createHash('sha1').update(src.overpass ? reqUrl : url).digest('hex') + '.bin');
  const typeFile = file + '.type';
  if (src.ttlMs > 0 && existsSync(file) && Date.now() - statSync(file).mtimeMs < src.ttlMs) {
    const type = existsSync(typeFile) ? readFileSync(typeFile, 'utf8') : 'application/json';
    res.writeHead(200, { 'content-type': type, 'x-cache': 'hit' });
    return res.end(readFileSync(file));
  }
  if (src.minIntervalMs) {
    const wait = (lastCall.get(src) || 0) + src.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall.set(src, Date.now());
  }
  let upstream;
  if (src.overpass) {
    const data = new URL(reqUrl, 'http://x').searchParams.get('data') || '';
    upstream = await fetch(url, {
      method: 'POST',
      headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(data),
      signal: AbortSignal.timeout(90_000),
    });
  } else {
    upstream = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20_000) });
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  const type = upstream.headers.get('content-type') || 'application/json';
  if (upstream.ok && src.ttlMs > 0) {
    writeFileSync(file, body);
    writeFileSync(typeFile, type);
  }
  res.writeHead(upstream.status, { 'content-type': type });
  res.end(body);
}

function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  if (rel.startsWith('/data/')) rel = '/public' + rel;
  const allowed = rel === '/index.html' || /^\/(src|public|node_modules)\//.test(rel);
  // node_modules is a symlink outside ROOT; check traversal on the unresolved path.
  const full = resolve(ROOT, '.' + rel);
  if (!allowed || !full.startsWith(ROOT + sep) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(full).pipe(res);
}

const server = https.createServer(ensureCert(), async (req, res) => {
  try {
    const u = new URL(req.url, 'https://x');
    for (const [prefix, src] of Object.entries(SOURCES)) {
      if (u.pathname === prefix || u.pathname.startsWith(prefix + '/')) {
        return await proxy(src, req.url.slice(prefix.length) || '/', res);
      }
    }
    serveStatic(u.pathname, res);
  } catch (e) {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(e) }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  X-Ray Vision running:\n`);
  console.log(`    desktop:  https://localhost:${PORT}`);
  for (const ip of lanIps()) console.log(`    headset:  https://${ip}:${PORT}`);
  console.log(`\n  (accept the self-signed certificate warning once per device)\n`);
});
