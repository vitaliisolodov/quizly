import { createServer } from 'node:http';
import { Server } from 'socket.io';

const origins = new Set((process.env.QUIZLY_ORIGINS ||
  'https://vitaliisolodov.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',').map(origin => origin.trim()));
const rooms = new Map();
const port = Number(process.env.PORT || 3100);
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404, { 'Content-Type': 'text/plain' });
  response.end(request.url === '/health' ? 'ok' : 'Not found');
});
const io = new Server(server, {
  serveClient: false,
  cors: { origin: [...origins] },
  allowRequest: (request, done) => {
    const origin = request.headers.origin;
    done(null, !origin || origins.has(origin));
  },
  maxHttpBufferSize: 128 * 1024
});

io.on('connection', socket => {
  let room;
  let host = false;
  let windowStarted = Date.now();
  let messages = 0;
  socket.use((_, next) => {
    if (Date.now() - windowStarted >= 1000) {
      windowStarted = Date.now();
      messages = 0;
    }
    if (++messages <= (host ? 2000 : 100)) next();
    else socket.disconnect(true);
  });

  socket.on('room:create', (request, reply) => {
    if (typeof reply !== 'function') return;
    const { pin, token, publicKey } = request ?? {};
    if (room || typeof pin !== 'string' || !/^\d{6}$/.test(pin) ||
        typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token) ||
        typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(publicKey)) {
      return reply({ error: 'invalid-id' });
    }
    let existing = rooms.get(pin);
    if (existing && (existing.token !== token || existing.hostId || existing.publicKey !== publicKey)) {
      return reply({ error: 'unavailable-id' });
    }
    if (!existing) {
      if (rooms.size >= 50) return reply({ error: 'server-error' });
      existing = { pin, token, publicKey, players: new Set() };
      rooms.set(pin, existing);
    }
    clearTimeout(existing.expiry);
    room = existing;
    host = true;
    room.hostId = socket.id;
    reply({ ok: true });
  });

  socket.on('room:join', (pin, reply) => {
    if (typeof reply !== 'function') return;
    const target = rooms.get(pin);
    if (room || !target?.hostId) return reply({ error: 'peer-unavailable' });
    if (target.players.size >= 150) return reply({ error: 'room-full' });
    room = target;
    room.players.add(socket.id);
    io.to(room.hostId).emit('link:open', socket.id);
    reply({ publicKey: room.publicKey });
  });

  socket.on('link:message', (target, message) => {
    if (!room || !message || typeof message !== 'object') return;
    if (host) {
      if (room.players.has(target)) io.to(target).emit('link:message', socket.id, message);
    } else if (room.hostId && room.players.has(socket.id) &&
        ['register:encrypted', 'answer', 'ping'].includes(message.type)) {
      io.to(room.hostId).emit('link:message', socket.id, message);
    }
  });

  function leave(target) {
    if (!room) return;
    if (host && target) {
      if (room.players.delete(target)) io.to(target).emit('link:closed');
    } else if (!host) {
      if (room.players.delete(socket.id) && room.hostId) io.to(room.hostId).emit('link:closed', socket.id);
      room = undefined;
    } else {
      for (const playerId of room.players) io.to(playerId).emit('link:closed');
      room.players.clear();
      room.hostId = undefined;
      const pin = room.pin;
      room.expiry = setTimeout(() => rooms.delete(pin), 60000);
      room = undefined;
    }
  }

  socket.on('link:close', leave);
  socket.on('disconnect', () => leave());
});

server.listen(port, '0.0.0.0', () => console.log('Quizly relay listening on port ' + port));
