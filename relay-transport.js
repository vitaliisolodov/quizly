(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const hostTokens = new Map();
  let hostIdentity;

  function encode(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }

  function decode(value) {
    return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
  }

  async function identity() {
    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    const raw = await crypto.subtle.exportKey('raw', keys.publicKey);
    return { privateKey: keys.privateKey, publicKey: encode(raw), fingerprint: await fingerprint(raw) };
  }

  async function fingerprint(raw) {
    return encode(await crypto.subtle.digest('SHA-256', raw));
  }

  async function derive(privateKey, remote) {
    const publicKey = await crypto.subtle.importKey('raw', decode(remote), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  class Events {
    listeners = new Map();
    on(event, callback) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(callback);
    }
    emit(event, value) {
      for (const callback of this.listeners.get(event) ?? []) callback(value);
    }
  }

  class RelayLink extends Events {
    open = false;
    constructor(peer, target) {
      super();
      this.peer = peer;
      this.target = target;
    }
    send(message) {
      if (!this.open || !this.peer.socket.connected) return;
      if (message.type !== 'register') {
        this.peer.socket.emit('link:message', this.target, message);
        return;
      }
      this.sendRegistration(message).catch(() => this.emit('error', { type: 'encryption' }));
    }
    async sendRegistration(message) {
      const own = await identity();
      const key = await derive(own.privateKey, this.hostKey);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const additionalData = encoder.encode(`${this.pin}:${this.peer.socket.id}`);
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData },
        key, encoder.encode(JSON.stringify(message)));
      if (this.open && this.peer.socket.connected) {
        this.peer.socket.emit('link:message', this.target, {
          type: 'register:encrypted', publicKey: own.publicKey, iv: encode(iv), ciphertext: encode(ciphertext)
        });
      }
    }
    async receive(message) {
      if (!this.open) return;
      if (message.type !== 'register:encrypted') {
        this.emit('data', message);
        return;
      }
      try {
        const { privateKey } = await hostIdentity;
        const key = await derive(privateKey, message.publicKey);
        const additionalData = encoder.encode(`${this.peer.id.slice(-6)}:${this.target}`);
        const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(message.iv), additionalData },
          key, decode(message.ciphertext));
        const registration = JSON.parse(decoder.decode(clear));
        if (this.open && registration.type === 'register') this.emit('data', registration);
      } catch {
        this.send({ type: 'error', message: 'Не вдалося розшифрувати реєстрацію. Відскануйте актуальний QR-код.' });
      }
    }
    close(notify = true) {
      if (!this.open) return;
      this.open = false;
      this.peer.links.delete(this.target);
      if (notify && this.peer.socket.connected) this.peer.socket.emit('link:close', this.target);
      this.emit('close');
    }
  }

  class RelayPeer extends Events {
    links = new Map();
    destroyed = false;
    disconnected = false;
    constructor(id) {
      super();
      this.id = id;
      this.socket = io(window.QUIZLY_RELAY_URL, {
        autoConnect: false, reconnection: false, transports: ['polling', 'websocket'], timeout: 7000
      });
      this.socket.on('connect', () => this.handleConnect());
      this.socket.on('connect_error', () => this.emit('error', { type: 'network' }));
      this.socket.on('disconnect', () => {
        this.disconnected = true;
        this.closeLinks();
        if (!this.destroyed) this.emit('disconnected');
      });
      this.socket.on('link:open', target => {
        const link = new RelayLink(this, target);
        link.open = true;
        this.links.set(target, link);
        this.emit('connection', link);
      });
      this.socket.on('link:message', (source, message) => {
        (this.id ? this.links.get(source) : this.playerLink)?.receive(message);
      });
      this.socket.on('link:closed', source => {
        (this.id ? this.links.get(source) : this.playerLink)?.close(false);
        this.links.delete(source);
      });
      queueMicrotask(() => { if (!this.destroyed) this.socket.connect(); });
    }
    async handleConnect() {
      this.disconnected = false;
      if (!this.id) {
        this.emit('open');
        return;
      }
      const socketId = this.socket.id;
      const stillConnected = () => !this.destroyed && this.socket.id === socketId;
      const rejectRoom = type => {
        if (!stillConnected()) return;
        this.socket.disconnect();
        this.emit('error', { type });
      };
      try {
        hostIdentity ??= identity();
        const { publicKey, fingerprint } = await hostIdentity;
        if (!stillConnected()) return;
        if (!hostTokens.has(this.id)) hostTokens.set(this.id, crypto.randomUUID());
        const pin = this.id.slice(-6);
        const result = await this.socket.timeout(6000).emitWithAck('room:create', {
          pin, token: hostTokens.get(this.id), publicKey
        });
        if (!stillConnected()) return;
        if (result.error) return rejectRoom(result.error);
        this.fingerprint = fingerprint;
        this.emit('open');
      } catch {
        rejectRoom('network');
      }
    }
    connect(id) {
      const link = new RelayLink(this, null);
      this.playerLink = link;
      this.join(link, id.slice(-6));
      return link;
    }
    async join(link, pin) {
      try {
        const result = await this.socket.timeout(6000).emitWithAck('room:join', pin);
        if (this.destroyed) return;
        if (result.error) return this.emit('error', { type: result.error });
        const expected = new URLSearchParams(location.hash.split('?')[1]).get('key');
        if (expected && expected !== await fingerprint(decode(result.publicKey))) {
          return this.emit('error', { type: 'host-key-mismatch' });
        }
        if (this.destroyed || !this.socket.connected) return;
        link.pin = pin;
        link.hostKey = result.publicKey;
        link.open = true;
        link.emit('open');
      } catch {
        if (!this.destroyed) this.emit('error', { type: 'network' });
      }
    }
    closeLinks() {
      this.playerLink?.close(false);
      for (const link of this.links.values()) link.close(false);
      this.links.clear();
    }
    reconnect() {
      if (!this.destroyed) this.socket.connect();
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.closeLinks();
      this.socket.disconnect();
      this.emit('close');
    }
  }

  window.createQuizPeer = id => window.QUIZLY_RELAY_URL
    ? new RelayPeer(id)
    : new Peer(id, { debug: 1 });
})();
