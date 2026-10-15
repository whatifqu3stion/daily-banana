/** An immutable run identity prevents an old async result becoming current
 * merely because a shared cancellation boolean was reset by a newer run. */
export class PanelRun {
  constructor(id) {
    this.id = id;
    this.active = true;
    this.scheduling = true;
    this.entries = new Map();
  }
  stopScheduling() { this.scheduling = false; }
  invalidate() { this.active = false; this.scheduling = false; this.entries.clear(); }
  getOrStart(panelId, produce) {
    if (!this.active) return Promise.reject(new Error('This comic generation was superseded.'));
    const existing = this.entries.get(panelId);
    if (existing) return existing;
    const promise = Promise.resolve().then(() => {
      if (!this.active) throw new Error('This comic generation was superseded.');
      return produce();
    }).then(image => {
      if (!this.active) throw new Error('This comic generation was superseded.');
      return image;
    });
    this.entries.set(panelId, promise);
    // A cached rejection represents a failed panel, not permission to silently
    // repeat a paid request. Only explicit Retry starts a replacement.
    promise.catch(() => {});
    return promise;
  }
}
