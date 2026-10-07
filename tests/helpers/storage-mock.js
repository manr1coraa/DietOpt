// Minimal localStorage mock for Node-based tests. Import (for side effects)
// BEFORE any DietOpt module that reads storage at load time.
class MemoryStorage {
  constructor() {
    this._data = new Map();
  }
  getItem(key) {
    return this._data.has(String(key)) ? this._data.get(String(key)) : null;
  }
  setItem(key, value) {
    this._data.set(String(key), String(value));
  }
  removeItem(key) {
    this._data.delete(String(key));
  }
  clear() {
    this._data.clear();
  }
  key(index) {
    return [...this._data.keys()][index] ?? null;
  }
  get length() {
    return this._data.size;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { language: 'de-DE' };
}

export function resetStorage() {
  globalThis.localStorage.clear();
}
