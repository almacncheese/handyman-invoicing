// Dependency-free TCP proxy: preview ingress routes /api -> :8001, everything
// else -> :3000. Next.js serves both on :3000, so forward 8001 -> 3000.
// Used instead of socat so it survives pod resumes (node ships in the base image).
const net = require('net');
const LISTEN_PORT = 8001;
const TARGET_PORT = 3000;
const TARGET_HOST = '127.0.0.1';

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST);
  client.pipe(upstream);
  upstream.pipe(client);
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
});

server.on('error', (e) => {
  console.error('[proxy] server error', e.message);
  process.exit(1);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`[proxy] :${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`);
});
