(() => {
  "use strict";
  // Browser-profile convenience storage, not a hardware-backed credential vault.
  // Code with access to this origin or browser profile can recover/use the login.
  const DB = "project-tracker-device-login-v1";
  const STORE = "vault";
  const KEY_ID = "nonexportable-device-key";
  const LOGIN_ID = "private-github-login";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let dbPromise;

  function open() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error("Cannot open saved-login storage."));
      req.onblocked = () => reject(new Error("Close other Project Tracker tabs and retry."));
    }).catch(err => { dbPromise = null; throw err; });
    return dbPromise;
  }
  async function get(id) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,"readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || tx.error);
    });
  }
  async function putAll(entries) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,"readwrite");
      try {
        for (const [id,value] of entries) tx.objectStore(STORE).put(value,id);
      } catch (error) {
        try { tx.abort(); } catch {}
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Browser blocked saved-login storage."));
      tx.onerror = () => reject(tx.error || new Error("Browser blocked saved-login storage."));
    });
  }
  function isCryptoKey(value) {
    return typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
  }
  async function usableKey(stored) {
    if (isCryptoKey(stored)) return stored;
    // Compatibility fallback for file:// and browsers which cannot store CryptoKey
    // objects in IndexedDB. It is encrypted at rest, but its key also lives in
    // the same browser profile, so this does not provide device-level secrecy.
    if (stored?.format === "raw-key-v1" && stored.bytes instanceof Uint8Array && stored.bytes.byteLength === 32) {
      return crypto.subtle.importKey("raw",stored.bytes,{name:"AES-GCM"},false,["encrypt","decrypt"]);
    }
    return null;
  }
  async function encryptedRecord(key,token,passphrase) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = encoder.encode(JSON.stringify({v:1,token,passphrase}));
    const ciphertext = await crypto.subtle.encrypt({name:"AES-GCM",iv},key,raw);
    return {v:1,iv,ciphertext};
  }
  async function save(token,passphrase) {
    if (!globalThis.crypto?.subtle) throw new Error("Encryption is unavailable in this browser.");
    if (typeof token !== "string" || !token.trim() || typeof passphrase !== "string" || !passphrase) {
      throw new Error("Login values are missing.");
    }
    const stored = await get(KEY_ID);
    const existingKey = await usableKey(stored);
    if (existingKey) {
      await putAll([[LOGIN_ID,await encryptedRecord(existingKey,token,passphrase)]]);
      return;
    }
    // Prefer a non-extractable CryptoKey when the browser supports IDB cloning.
    const secureKey = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    try {
      await putAll([[KEY_ID,secureKey],[LOGIN_ID,await encryptedRecord(secureKey,token,passphrase)]]);
      return;
    } catch (firstError) {
      // Some local-file contexts reject CryptoKey structured cloning even though
      // they can persist ordinary binary data. Retry with a binary key in IDB.
      // Never fall back to plaintext tokens or an unencrypted localStorage entry.
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const fallbackKey = await crypto.subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["encrypt","decrypt"]);
      try {
        await putAll([[KEY_ID,{format:"raw-key-v1",bytes}],[LOGIN_ID,await encryptedRecord(fallbackKey,token,passphrase)]]);
      } catch (secondError) {
        throw new Error(`Could not persist encrypted login (${secondError?.name || firstError?.name || "storage error"}).`);
      }
    }
  }
  async function load() {
    if (!globalThis.crypto?.subtle) return null;
    const saved = await get(LOGIN_ID);
    if (!saved) return null;
    const key = await usableKey(await get(KEY_ID));
    if (!key) throw new Error("Saved login is incomplete. Enter credentials again.");
    try {
      const raw = await crypto.subtle.decrypt({name:"AES-GCM",iv:saved.iv},key,saved.ciphertext);
      const values = JSON.parse(decoder.decode(raw));
      if(values.v!==1 || typeof values.token!=="string" || typeof values.passphrase!=="string")throw new Error("Invalid saved login format.");
      return {token:values.token,passphrase:values.passphrase};
    } catch { throw new Error("Cannot decrypt the saved login. Forget it and connect again."); }
  }
  async function clear() {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).delete(LOGIN_ID);
      tx.objectStore(STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Could not clear saved login."));
      tx.onerror = () => reject(tx.error || new Error("Could not clear saved login."));
    });
  }
  window.PTRememberedLogin = Object.freeze({save,load,clear});
})();
