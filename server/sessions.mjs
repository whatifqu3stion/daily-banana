import { randomBytes } from 'node:crypto';

export const SESSION_TTL = 30 * 60 * 1000;
export const TAB_PATTERN = /^[a-f0-9-]{36}$/;
export const cookieName = tab => `__Secure-gemini-${tab}`;

export class SessionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// No database, disk, shared owner key, or credential logging.
export class CredentialSessions {
  constructor({ now = Date.now, ttl = SESSION_TTL, maxSessions = 1000 } = {}) {
    this.now = now;
    this.ttl = ttl;
    this.maxSessions = maxSessions;
    this.sessions = new Map();
    this.pending = new Set();
  }
  prune() {
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= this.now() && !session.active) this.erase(token);
    }
  }
  erase(token) {
    const session = this.sessions.get(token);
    if (session) session.key = '';
    this.sessions.delete(token);
  }
  get(token, tab, required = true) {
    const session = this.sessions.get(token);
    if (!session || session.tab !== tab || session.expiresAt <= this.now()) {
      if (session?.tab === tab && !session.active) this.erase(token);
      if (required) throw new SessionError(401, 'Your API key session expired or was removed. Reconnect in API settings.');
      return null;
    }
    return session;
  }
  async connect(token, tab, key, validate) {
    this.prune();
    const existing = this.sessions.get(token);
    if (existing?.tab === tab && existing.active) throw new SessionError(409, 'Wait for the current AI request to finish before changing your key.');
    const current = this.get(token, tab, false);
    if (current?.active || this.pending.has(tab)) throw new SessionError(409, 'Wait for the current AI request to finish before changing your key.');
    if (this.sessions.size + this.pending.size >= this.maxSessions && !current) throw new SessionError(503, 'Too many active API sessions. Try again shortly.');
    this.pending.add(tab);
    if (current) current.active++;
    try {
      await validate(key);
      if (token && current) this.erase(token);
      const next = randomBytes(32).toString('hex');
      const expiresAt = this.now() + this.ttl;
      this.sessions.set(next, { tab, key, expiresAt, active: 0 });
      return { token: next, expiresAt };
    } finally {
      if (current) current.active--;
      this.pending.delete(tab);
    }
  }
  remove(token, tab) {
    const existing = this.sessions.get(token);
    if (existing?.tab === tab && existing.active) throw new SessionError(409, 'Wait for the current AI request to finish before removing your key.');
    const current = this.get(token, tab, false);
    if (current?.active || this.pending.has(tab)) throw new SessionError(409, 'Wait for the current AI request to finish before removing your key.');
    if (current) this.erase(token);
  }
  async request(token, tab, callback) {
    const session = this.get(token, tab);
    if (this.pending.has(tab)) throw new SessionError(409, 'Wait for the Google key check to finish before generating content.');
    session.active++;
    try { return await callback(session.key); }
    finally {
      session.active--;
      if (!session.active && session.expiresAt <= this.now()) this.erase(token);
    }
  }
  clear() {
    for (const token of this.sessions.keys()) this.erase(token);
  }
}
