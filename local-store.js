(() => {
  "use strict";
  // Internal persistence interface matches the existing mapping code's record operations.
  // All operations are local IndexedDB transactions; nothing is transmitted to a server.
  const DB_NAME = "project-tracker-local-data-v1";
  const COLLECTIONS = ["places", "measurements", "sketches", "settings"];
  const MEDIA_STORE = "attachments";
  const OUTBOX = "sync_outbox";
  const REMOTE = "sync_remote";
  const VIDEO_DELETE_OUTBOX = "video_delete_outbox";
  const VIDEO_UPLOAD_OUTBOX = "video_upload_outbox";
  const SYNC_COLLECTIONS = ["places"];
  let opening = null;

  function database() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("IndexedDB is unavailable in this browser or browsing mode."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 5);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of [...COLLECTIONS, MEDIA_STORE, OUTBOX, REMOTE, VIDEO_DELETE_OUTBOX, VIDEO_UPLOAD_OUTBOX]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, {keyPath: "id"});
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("Unable to open local database."));
      request.onblocked = () => reject(new Error("Close other Project Tracker tabs and retry."));
    }).catch(error => { opening = null; throw error; });
    return opening;
  }

  async function transact(collection, mode, action, additional = []) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([collection, ...additional], mode);
      const store = transaction.objectStore(collection);
      let result;
      try { result = action(store, value => { result = value; }, transaction); }
      catch (err) { transaction.abort(); reject(err); return; }
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save browser data."));
      transaction.onabort = () => reject(transaction.error || new Error("Browser storage transaction aborted."));
    });
  }

  function raise(message, status) {
    const error = new Error(message);
    error.status = status;
    throw error;
  }
  function clone(value) { return value == null ? value : structuredClone(value); }
  const timestamp = () => new Date().toISOString();
  const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`);

  function parseFilter(filter) {
    if (!filter) return () => true;
    const expression = filter.trim();
    const match = expression.match(/^\s*\(?\s*([a-z_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(true|false))\s*\)?\s*$/i);
    if (!match) raise("Unsupported local research filter: " + expression, 400);
    const field = match[1], value = match[2] ?? match[3] ?? match[4];
    if (value === "true" || value === "false") return row => Boolean(row[field]) === (value === "true");
    return row => String(row[field] ?? "") === String(value);
  }
  function sortBy(expression) {
    const descending = String(expression).startsWith("-");
    const field = descending ? String(expression).slice(1) : (expression || "created");
    return (a, b) => {
      const av = a[field] ?? "", bv = b[field] ?? "";
      const compare = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return descending ? -compare : compare;
    };
  }

  function pendingRow(collection, recordId, record, deleted = false) {
    return {id: `${collection}:${recordId}`, collection, recordId, record: deleted ? null : clone(record),
      deleted, changeId: newId(), modified: timestamp()};
  }
  function notifySync() {
    try { window.dispatchEvent(new Event("pt-local-change")); } catch {}
  }
  function markPending(tx, collection, recordId, record, deleted = false) {
    if (SYNC_COLLECTIONS.includes(collection)) tx.objectStore(OUTBOX).put(pendingRow(collection, recordId, record, deleted));
  }
  async function readAll(collection) {
    return transact(collection,"readonly",(store, done)=>{
      const request=store.getAll(); request.onsuccess=()=>done(request.result||[]);
    });
  }
  async function readOne(collection, id) {
    return transact(collection,"readonly",(store,done)=>{
      const request=store.get(id);request.onsuccess=()=>done(request.result||null);
    });
  }
  async function syncStatus() {
    // Old builds queued sketches and measurements; never upload them in POI-only mode.
    return {pending: (await readAll(OUTBOX)).filter(item => item.collection === "places")};
  }
  async function discardLegacyNonPoiQueue() {
    // Discard old upload intents only. Do not touch the locally saved sketches or measurements.
    await transact(OUTBOX,"readwrite",(store)=>{
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (row.value.collection !== "places") row.delete();
        row.continue();
      };
    });
  }
  async function saveSyncCandidates(id, candidates) {
    await transact(REMOTE,"readwrite",store=>store.put({id,candidates}));
  }
  async function metadata(path) { return readOne(REMOTE,path); }
  async function setMetadata(path, sha) {
    await transact(REMOTE,"readwrite",store=>store.put({id:path,sha}));
  }
  async function applyRemote(collection, recordId, record, sha, path) {
    const db = await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([collection,OUTBOX,REMOTE],"readwrite");
      const pending=tx.objectStore(OUTBOX).get(`${collection}:${recordId}`);
      let applied=false;
      pending.onsuccess=()=>{
        if (pending.result) return;
        if (record) tx.objectStore(collection).put(clone(record));
        else tx.objectStore(collection).delete(recordId);
        tx.objectStore(REMOTE).put({id:path,sha});
        applied=true;
      };
      tx.oncomplete=()=>resolve(applied);
      tx.onerror=()=>reject(tx.error||new Error("Failed to apply remote record"));
    });
  }
  async function ackPending(pending, path, sha) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([OUTBOX,REMOTE],"readwrite");
      const req=tx.objectStore(OUTBOX).get(pending.id);
      req.onsuccess=()=>{
        if (req.result?.changeId===pending.changeId) tx.objectStore(OUTBOX).delete(pending.id);
        tx.objectStore(REMOTE).put({id:path,sha});
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  async function ackRemoval(pending,path) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([OUTBOX,REMOTE],"readwrite");
      const req=tx.objectStore(OUTBOX).get(pending.id);
      req.onsuccess=()=>{
        if(req.result?.changeId===pending.changeId){
          tx.objectStore(OUTBOX).delete(pending.id);
          tx.objectStore(REMOTE).delete(path);
        }
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  async function remotePlaceMetadata() {
    return (await readAll(REMOTE)).filter(item=>/^research\/places\/[^/]+\.bin$/.test(item.id) && item.sha);
  }
  async function removeRemotePlace(path) {
    const id=path.match(/^research\/places\/([^/]+)\.bin$/)?.[1];
    if(!id)throw new Error("Invalid remotely removed POI path.");
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(["places",OUTBOX,REMOTE],"readwrite");
      const outbox=tx.objectStore(OUTBOX).get(`places:${id}`);
      let result={removed:false,conflict:false,attachments:[]};
      outbox.onsuccess=()=>{
        if(outbox.result){result.conflict=true;return;}
        const old=tx.objectStore("places").get(id);
        old.onsuccess=()=>{
          result.attachments=Array.isArray(old.result?.attachments)?old.result.attachments.map(a=>clone(a)).filter(a=>a?.id):[];
          result.removed=!!old.result;
          tx.objectStore("places").delete(id);
          tx.objectStore(REMOTE).delete(path);
        };
      };
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error("Failed to remove remote-deleted POI locally."));
    });
  }
  async function storeRemoteAttachment(entry) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(MEDIA_STORE,"readwrite");
      const store=tx.objectStore(MEDIA_STORE);
      const req=store.get(entry.id);
      req.onsuccess=()=>{
        if(!req.result) store.put(entry);
        else if(entry.video_host && !req.result.video_host) store.put({...req.result,video_host:clone(entry.video_host)});
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  async function queueExisting() {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([...SYNC_COLLECTIONS,OUTBOX,REMOTE],"readwrite");
      let number=0;
      for(const name of SYNC_COLLECTIONS){
        const scan=tx.objectStore(name).getAll();
        scan.onsuccess=()=>{
          for(const record of scan.result||[]){
            const path=`research/${name}/${record.id}.bin`;
            const known=tx.objectStore(REMOTE).get(path);
            known.onsuccess=()=>{
              if (!known.result) { tx.objectStore(OUTBOX).put(pendingRow(name,record.id,record)); number++; }
            };
          }
        };
      }
      tx.oncomplete=()=>{notifySync();resolve(number);};
      tx.onerror=()=>reject(tx.error);
    });
  }
  async function api(path, options = {}) {
    const url = new URL(path, "https://local.invalid");
    const parts = url.pathname.match(/^\/collections\/([a-z_]+)\/records(?:\/([^/]+))?\/?$/);
    if (!parts || !COLLECTIONS.includes(parts[1])) raise("Unsupported local storage operation.", 400);
    const collection = parts[1];
    const id = parts[2] ? decodeURIComponent(parts[2]) : null;
    const method = String(options.method || "GET").toUpperCase();
    const body = options.body == null ? {} :
      typeof options.body === "string" ? JSON.parse(options.body) : options.body;

    if (method === "GET" && id) {
      const record = await transact(collection, "readonly", (store, done) => {
        const request = store.get(id);
        request.onsuccess = () => done(request.result);
      });
      if (!record) raise("Record not found.", 404);
      return clone(record);
    }
    if (method === "GET") {
      const rows = await transact(collection, "readonly", (store, done) => {
        const request = store.getAll();
        request.onsuccess = () => done(request.result || []);
      });
      const filtered = rows.filter(parseFilter(url.searchParams.get("filter")));
      filtered.sort(sortBy(url.searchParams.get("sort") || "created"));
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const perPage = Math.min(1000, Math.max(1, Number(url.searchParams.get("perPage")) || 30));
      return {page, perPage, totalItems:filtered.length, totalPages:Math.max(1,Math.ceil(filtered.length/perPage)),items:clone(filtered.slice((page-1)*perPage,page*perPage))};
    }
    if (method === "POST" && !id) {
      const now = timestamp();
      const record = {...body, id: String(body.id || newId()), created:now, updated:now};
      await transact(collection, "readwrite", (store,done,tx) => { store.add(record); markPending(tx,collection,record.id,record); }, SYNC_COLLECTIONS.includes(collection)?[OUTBOX]:[]);
      if (SYNC_COLLECTIONS.includes(collection)) notifySync();
      return clone(record);
    }
    if ((method === "PATCH" || method === "PUT") && id) {
      const record = await transact(collection, "readwrite", (store, done,tx) => {
        const get = store.get(id);
        get.onsuccess = () => {
          if (!get.result) { try { raise("Record not found.", 404); } catch (err) { store.transaction.abort(); } return; }
          const next = {...get.result, ...body, id, created:get.result.created, updated:timestamp()};
          store.put(next);
          markPending(tx,collection,id,next);
          done(next);
        };
      },SYNC_COLLECTIONS.includes(collection)?[OUTBOX]:[]);
      if (!record) raise("Record not found.", 404);
      if (SYNC_COLLECTIONS.includes(collection)) notifySync();
      return clone(record);
    }
    if (method === "DELETE" && id) {
      await transact(collection, "readwrite", (store,done,tx) => { store.delete(id); markPending(tx,collection,id,null,true); },SYNC_COLLECTIONS.includes(collection)?[OUTBOX]:[]);
      if (SYNC_COLLECTIONS.includes(collection)) notifySync();
      return null;
    }
    raise("Unsupported local storage operation.", 400);
  }
  async function saveAttachment(blob, metadata = {}) {
    if (!(blob instanceof Blob)) throw new Error("Invalid attachment file.");
    const entry = {
      id: newId(), name: String(metadata.name || "Attachment").slice(0, 255),
      type: String(blob.type || metadata.type || "application/octet-stream"),
      size: blob.size, created: timestamp(), blob
    };
    await transact(MEDIA_STORE, "readwrite", store => store.add(entry));
    return {id: entry.id, name: entry.name, type: entry.type, size: entry.size};
  }
  async function readAttachment(id) {
    const cached = await readOne(MEDIA_STORE, id);
    if (cached || !window.FAGitHubSync?.snapshot?.().connected) return cached;
    try {
      if (await window.FAGitHubSync.downloadMedia(id)) return readOne(MEDIA_STORE, id);
    } catch {}
    return null;
  }
  async function listAttachments() {
    return transact(MEDIA_STORE, "readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result || []);
    });
  }
  function normalizedVideoHost(value) {
    const host=value && typeof value==="object" ? value : null;
    const fileId=String(host?.fileId||"");
    const url=String(host?.url||"");
    if(host?.provider!=="gdrive" || !/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !/^https:\/\/drive\.google\.com\//.test(url))return null;
    return {provider:"gdrive",fileId,url};
  }
  async function setAttachmentVideoHost(id, host) {
    const attachmentId=String(id);
    const normalized=normalizedVideoHost(host);
    if(!attachmentId || !normalized)throw new Error("Invalid hosted video metadata.");
    const db=await database();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([MEDIA_STORE,"places",OUTBOX,VIDEO_UPLOAD_OUTBOX],"readwrite");
      const media=tx.objectStore(MEDIA_STORE),places=tx.objectStore("places"),queue=tx.objectStore(VIDEO_UPLOAD_OUTBOX);
      const mediaReq=media.get(attachmentId);
      mediaReq.onsuccess=()=>{if(mediaReq.result)media.put({...mediaReq.result,video_host:clone(normalized)});};
      const placeReq=places.getAll();
      placeReq.onsuccess=()=>{
        for(const place of placeReq.result||[]){
          let changed=false;
          const attachments=(place.attachments||[]).map(item=>{
            if(String(item?.id||"")!==attachmentId)return item;
            const current=normalizedVideoHost(item?.video_host);
            if(current?.fileId===normalized.fileId && current?.url===normalized.url)return item;
            changed=true;return {...item,video_host:clone(normalized)};
          });
          if(changed){const next={...place,attachments,updated:timestamp()};places.put(next);markPending(tx,"places",place.id,next);}
        }
      };
      queue.delete(attachmentId);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Unable to save hosted video metadata."));
    });
    notifySync();
  }
  async function clearAttachmentVideoHost(id, fileId="") {
    const attachmentId=String(id), expected=String(fileId||"");
    if(!attachmentId)return;
    const db=await database();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([MEDIA_STORE,"places",OUTBOX,VIDEO_UPLOAD_OUTBOX],"readwrite");
      const media=tx.objectStore(MEDIA_STORE),places=tx.objectStore("places"),queue=tx.objectStore(VIDEO_UPLOAD_OUTBOX);
      const strip=item=>{
        const current=normalizedVideoHost(item?.video_host);
        if(!current || (expected && current.fileId!==expected))return {item,changed:false};
        const next={...item};delete next.video_host;return {item:next,changed:true};
      };
      const mediaReq=media.get(attachmentId);
      mediaReq.onsuccess=()=>{if(mediaReq.result){const result=strip(mediaReq.result);if(result.changed)media.put(result.item);}};
      const placeReq=places.getAll();
      placeReq.onsuccess=()=>{
        for(const place of placeReq.result||[]){
          let changed=false;
          const attachments=(place.attachments||[]).map(item=>{
            if(String(item?.id||"")!==attachmentId)return item;
            const result=strip(item);changed=changed||result.changed;return result.item;
          });
          if(changed){const next={...place,attachments,updated:timestamp()};places.put(next);markPending(tx,"places",place.id,next);}
        }
      };
      queue.put({id:attachmentId,attachmentId,attempts:0,nextAttempt:"",created:timestamp(),lastError:""});
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Unable to reset hosted video metadata."));
    });
    notifySync();
  }
  async function videoHostInventory() {
    const [places,media]=await Promise.all([readAll("places"),readAll(MEDIA_STORE)]);
    const mediaById=new Map(media.map(item=>[String(item?.id||""),item]));
    const videos=new Map();
    for(const place of places){
      for(const item of Array.isArray(place?.attachments)?place.attachments:[]){
        const attachmentId=String(item?.id||"");if(!attachmentId)continue;
        const stored=mediaById.get(attachmentId);
        const type=String(item?.type||stored?.type||"").toLowerCase();
        if(!type.startsWith("video/"))continue;
        const host=normalizedVideoHost(item?.video_host)||normalizedVideoHost(stored?.video_host);
        const existing=videos.get(attachmentId);
        if(!existing)videos.set(attachmentId,{attachmentId,name:String(item?.name||stored?.name||"video"),type,host});
        else if(!existing.host && host)existing.host=host;
      }
    }
    const list=[...videos.values()];
    return {videos:list,keepFileIds:[...new Set(list.map(item=>item.host?.fileId).filter(Boolean))]};
  }
  async function replaceVideoUploadQueue(ids) {
    const wanted=new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean));
    await transact(VIDEO_UPLOAD_OUTBOX,"readwrite",(store,done)=>{
      const req=store.getAll();
      req.onsuccess=()=>{
        const existing=new Map((req.result||[]).map(item=>[String(item.id),item]));
        for(const id of existing.keys())if(!wanted.has(id))store.delete(id);
        for(const id of wanted)if(!existing.has(id))store.put({id,attachmentId:id,attempts:0,nextAttempt:"",created:timestamp(),lastError:""});
        done(true);
      };
    });
  }
  async function videoUploadQueue() { return readAll(VIDEO_UPLOAD_OUTBOX); }
  async function ackVideoUpload(id) { await transact(VIDEO_UPLOAD_OUTBOX,"readwrite",store=>store.delete(String(id))); }
  async function deferVideoUpload(id,error) {
    await transact(VIDEO_UPLOAD_OUTBOX,"readwrite",store=>{
      const req=store.get(String(id));
      req.onsuccess=()=>{
        if(!req.result)return;
        const attempts=Math.min(12,Number(req.result.attempts||0)+1);
        const delay=Math.min(3600,10*Math.pow(2,attempts-1));
        store.put({...req.result,attempts,lastError:String(error||"").slice(0,300),nextAttempt:new Date(Date.now()+delay*1000).toISOString()});
      };
    });
  }
  async function videoDeleteQueue() { return readAll(VIDEO_DELETE_OUTBOX); }
  async function ackVideoDelete(id) { await transact(VIDEO_DELETE_OUTBOX,"readwrite",store=>store.delete(String(id))); }
  async function deferVideoDelete(id,error) {
    await transact(VIDEO_DELETE_OUTBOX,"readwrite",store=>{
      const req=store.get(String(id));
      req.onsuccess=()=>{
        if(!req.result)return;
        const attempts=Math.min(12,Number(req.result.attempts||0)+1);
        const delay=Math.min(3600,5*Math.pow(2,attempts-1));
        store.put({...req.result,attempts,lastError:String(error||"").slice(0,300),nextAttempt:new Date(Date.now()+delay*1000).toISOString()});
      };
    });
  }
  async function deleteUnreferencedAttachments(items) {
    const supplied=new Map();
    for(const value of Array.isArray(items)?items:[]){
      const item=value && typeof value==="object" ? value : {id:value};
      const id=String(item?.id||"");
      if(id)supplied.set(id,item);
    }
    const idsToCheck=[...supplied.keys()];
    if(!idsToCheck.length)return;
    // A duplicated place may reference the same attachment, so check all places before removing a blob.
    const places=await transact("places","readonly",(store,done)=>{
      const request=store.getAll();request.onsuccess=()=>done(request.result||[]);
    });
    const referenced=new Set(places.flatMap(place=>Array.isArray(place.attachments)?place.attachments.map(item=>String(item.id)):[]));
    const unused=idsToCheck.filter(id=>!referenced.has(id));
    if(!unused.length)return;
    const db=await database();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction([MEDIA_STORE,VIDEO_DELETE_OUTBOX,VIDEO_UPLOAD_OUTBOX],"readwrite");
      const media=tx.objectStore(MEDIA_STORE),queue=tx.objectStore(VIDEO_DELETE_OUTBOX),uploadQueue=tx.objectStore(VIDEO_UPLOAD_OUTBOX);
      for(const id of unused){
        const req=media.get(id);
        req.onsuccess=()=>{
          const host=normalizedVideoHost(req.result?.video_host)||normalizedVideoHost(supplied.get(id)?.video_host);
          if(host)queue.put({id:host.fileId,fileId:host.fileId,url:host.url,attachmentId:id,attempts:0,nextAttempt:"",created:timestamp(),lastError:""});
          uploadQueue.delete(id);
          media.delete(id);
        };
      }
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Unable to remove unused attachment."));
    });
    notifySync();
  }
  window.FALocalStore = Object.freeze({api, database, saveAttachment, readAttachment, listAttachments, deleteUnreferencedAttachments, setAttachmentVideoHost, clearAttachmentVideoHost, videoHostInventory, replaceVideoUploadQueue, videoUploadQueue, ackVideoUpload, deferVideoUpload, videoDeleteQueue, ackVideoDelete, deferVideoDelete,
    readAll, readOne, syncStatus, metadata, saveSyncCandidates, setMetadata, applyRemote, ackPending, ackRemoval, remotePlaceMetadata, removeRemotePlace, storeRemoteAttachment, queueExisting, discardLegacyNonPoiQueue});
})();
