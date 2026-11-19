// Keep Prisma's schema engine while verifying hosted TLS with Node on macOS.
// The temporary bridge listens only on loopback and closes with the CLI.
import 'dotenv/config';
import net from 'node:net';
import tls from 'node:tls';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';

const url = new URL(process.env.DATABASE_URL);
const certificate = url.searchParams.get('sslrootcert');
const sockets = new Set();
let server;
function track(socket) {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  return socket;
}
if (certificate && process.platform === 'darwin') {
  const ca = readFileSync(certificate, 'utf8');
  server = net.createServer(client => {
    track(client).pause();
    const upstream = track(net.connect({host: url.hostname, port: Number(url.port || 5432)}));
    const fail = () => {client.destroy(); upstream.destroy();};
    client.on('error', fail);
    client.once('close', () => upstream.destroy());
    upstream.on('error', fail);
    upstream.setTimeout(30000, fail);
    upstream.once('connect', () => {
      // PostgreSQL SSLRequest, before authentication or any application data.
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0); request.writeInt32BE(80877103, 4);
      upstream.write(request);
    });
    upstream.once('data', response => {
      if (response.length !== 1 || response[0] !== 83) return fail();
      const secure = track(tls.connect({socket: upstream, servername: url.hostname, ca, rejectUnauthorized: true}));
      secure.on('error', fail);
      secure.once('secureConnect', () => {
        upstream.setTimeout(0);
        client.pipe(secure).pipe(client);
        client.resume();
      });
      secure.once('close', () => client.destroy());
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const forwarded = new URL(url);
  forwarded.hostname = '127.0.0.1';
  forwarded.port = String(server.address().port);
  for (const key of ['sslrootcert', 'sslcert', 'sslaccept', 'host']) forwarded.searchParams.delete(key);
  forwarded.searchParams.set('sslmode', 'disable'); // loopback only; upstream TLS is mandatory
  process.env.DATABASE_URL = forwarded.toString();
}
const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', ...process.argv.slice(2)], {stdio: 'inherit', env: process.env});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
try {
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
} finally {
  for (const socket of sockets) socket.destroy();
  server?.close();
}
