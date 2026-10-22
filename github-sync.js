(() => {
  "use strict";
  // Each research record is an encrypted binary file in a private GitHub repository.
  // Credentials are held in memory during synchronization. A separate optional
  // browser device-login vault can remember them for automatic reconnection.
  // The research cache and pending-upload queue remain in IndexedDB.
  const storage = window.FALocalStore;
  const TARGET = Object.freeze({owner:"PCT-SC",repo:"pt-d",branch:"main"});
  const ENCRYPTION_CONTEXT_REPO = "project-tracker";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const POLL_MS = 30000, DEBOUNCE_MS = 900, MAX_MEDIA_BYTES = 12 * 1024 * 1024;
  let lastMediaSnapshot = "";
  // References are trusted only for the exact encrypted Git blob SHA.
  // They never contain attachment bytes or original filenames.
  const verifiedPlaceRefs = new Map();
  function rememberVerifiedPlaceRefs(path,sha,payload) {
    const match=/^research\/places\/([^/]+)\.bin$/.exec(path);
    if(!match || payload?.v!==1 || payload?.collection!=="places" || payload?.id!==match[1])
      throw new Error("Cannot verify encrypted POI attachment references.");
    const refs=[];
    if(!payload.deleted){
      if(!payload.record || !Array.isArray(payload.record.attachments||[]) || (payload.record.id && payload.record.id!==match[1]))
        throw new Error("Cannot verify encrypted POI attachments: invalid record.");
      for(const item of payload.record.attachments||[]){
        const id=String(item?.id||"");
        if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new Error("Cannot verify encrypted POI attachments: invalid reference.");
        refs.push(filePath("media",id));
      }
    }
    verifiedPlaceRefs.set(path,{sha,refs});
  }

  let connection = null, active = false, syncing = null, delayTimer = null, pollTimer = null, needsResync = false;
  let onChange = () => {}, onStatus = () => {}, onProgress = () => {};
  function emitProgress(percent,detail) { try { onProgress({percent,detail}); } catch {} }
  let status = "Not connected", remoteFiles = new Map(), lastError = "";
  let lastAttemptAt=null, lastCheckAt=null, lastSuccessAt=null, conflicts=0, pendingCount=0;
  const snapshot = () => ({connected:!!connection, busy:!!syncing, status, error:lastError, lastAttemptAt, lastCheckAt, lastSuccessAt, conflicts, pendingCount, pollSeconds:POLL_MS/1000});
  function setStatus(message,error="") { status=message;lastError=error;try{onStatus(snapshot());}catch{} }
  const toBase64 = bytes => { let result="";for(let i=0;i<bytes.length;i+=0x8000) result+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(result); };
  const fromBase64 = text => Uint8Array.from(atob(text.replace(/\s/g,"")),c=>c.charCodeAt(0));
  const filePath = (name,id) => `research/${name}/${id}.bin`;
  function assertSafe(value, name) { if(!/^[a-zA-Z0-9_.-]+$/.test(value) || value==="." || value==="..") throw new Error(`Invalid ${name}.`);return value; }
  async function deriveKey(passphrase,owner,repo) {
    if (!crypto?.subtle || !crypto?.getRandomValues) throw new Error("Encryption is unavailable here. Open this app through an HTTPS website or a secure browser context.");
    if (passphrase.length<16) throw new Error("Use a long group passphrase (at least 16 characters). A weak passphrase makes encrypted files vulnerable to guessing.");
    const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    const salt=enc.encode(`ProjectTracker-GitHub-encryption-v1:${owner.toLowerCase()}/${repo.toLowerCase()}`);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function encrypt(path,plain) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(path)},connection.key,plain));
    const output=new Uint8Array(4+iv.length+ciphertext.length);
    output.set(enc.encode("PTG1"),0);output.set(iv,4);output.set(ciphertext,16);
    return output;
  }
  async function decrypt(path,file) {
    if(file.length<33 || dec.decode(file.slice(0,4))!=="PTG1") throw new Error("Unsupported encrypted research format. Expected PTG1.");
    try { return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:file.slice(4,16),additionalData:enc.encode(path)},connection.key,file.slice(16))); }
    catch { throw new Error("Cannot decrypt research: incorrect passphrase or damaged encrypted file."); }
  }
  function baseUrl() { return `https://api.github.com/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.repo)}`; }
  async function request(url,opts={}) {
    if(!connection)throw new Error("GitHub is not connected.");
    const {body,method="GET"}=opts;
    let result;
    try { result=await fetch(url,{method,headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${connection.token}`,"X-GitHub-Api-Version":"2022-11-28",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"}); }
    catch { throw new Error("Network unavailable. Changes remain saved in this browser until synchronization succeeds."); }
    let data=null;
    try {data=await result.json();} catch {}
    if(!result.ok){
      const e=new Error(`GitHub HTTP ${result.status} (${method} ${new URL(url).pathname}): ${String(data?.message||result.statusText).slice(0,200)}`);
      e.status=result.status;e.retryAfter=result.headers.get("retry-after");throw e;
    }
    return data;
  }
  async function listTree() {
    const url=`${baseUrl()}/git/trees/${encodeURIComponent(connection.branch)}?recursive=1`;
    let tree;
    try { tree=await request(url); }
    catch(error) {
      if(error.status!==404)throw error;
      // GitHub can return 404 for a valid branch whose current tree is empty.
      const ref=await request(`${baseUrl()}/git/ref/heads/${connection.branch.split("/").map(encodeURIComponent).join("/")}`);
      const commit=await request(`${baseUrl()}/git/commits/${ref.object?.sha}`);
      if(commit.tree?.sha==="4b825dc642cb6eb9a060e54bf8d69288fbee4904")return new Map();
      throw error;
    }
    if(tree.truncated)throw new Error("Repository tree is too large for safe synchronization. Split the research repository.");
    const files=new Map();
    for(const file of tree.tree||[])if(file.type==="blob" && /^research\/(places|media)\/[^/]+\.bin$/.test(file.path))files.set(file.path,file.sha);
    return files;
  }
  async function readBlob(path,sha) {
    const blob=await request(`${baseUrl()}/git/blobs/${sha}`);
    if(blob.encoding!=="base64" || !blob.content)throw new Error(`GitHub did not return attachment bytes for ${path}.`);
    const plain=await decrypt(path,fromBase64(blob.content));
    if(/^research\/places\/[^/]+\.bin$/.test(path))
      rememberVerifiedPlaceRefs(path,sha,JSON.parse(dec.decode(plain)));
    return plain;
  }
  async function writeBlob(path,plaintext,sha) {
    const encrypted=await encrypt(path,plaintext);
    // PUT checks SHA, rejecting a concurrent edit instead of silently overwriting it.
    const payload={message:"Update encrypted Project Tracker research",content:toBase64(encrypted),branch:connection.branch};
    if(sha)payload.sha=sha;
    const response=await request(`${baseUrl()}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,{method:"PUT",body:payload});
    if(!response.content?.sha)throw new Error("GitHub did not confirm the new file version.");
    remoteFiles.set(path,response.content.sha);
    return response.content.sha;
  }
  // Missing media references are checked against the current shared POI records.
  async function treeSnapshot() {
    const ref=await request(`${baseUrl()}/git/ref/heads/${connection.branch.split("/").map(encodeURIComponent).join("/")}`);
    const head=ref.object?.sha;
    if(!/^[a-f0-9]{40}$/i.test(head||""))throw new Error("GitHub returned an invalid branch reference during media cleanup.");
    const commit=await request(`${baseUrl()}/git/commits/${head}`);
    const treeSha=commit.tree?.sha;
    if(!/^[a-f0-9]{40}$/i.test(treeSha||""))throw new Error("GitHub returned an invalid tree for media cleanup.");
    if(treeSha==="4b825dc642cb6eb9a060e54bf8d69288fbee4904")return {head,treeSha,files:new Map()};
    const response=await request(`${baseUrl()}/git/trees/${treeSha}?recursive=1`);
    if(response.truncated)throw new Error("Cannot safely clean attachments: repository listing is incomplete.");
    const files=new Map();
    for(const f of response.tree||[])if(f.type==="blob" && /^research\/(?:places|media)\/[^/]+\.bin$/.test(f.path))files.set(f.path,f.sha);
    return {head,treeSha,files};
  }
  async function fetchRemoteMediaReferences(files,progress=null) {
    const entries=[...files].filter(([path])=>/^research\/places\/[^/]+\.bin$/.test(path));
    const references=new Set();
    let cursor=0,checked=0,stopped=false;
    async function worker() {
      while(!stopped && cursor<entries.length){
        const [path,sha]=entries[cursor++];
        try {
          const match=/^research\/places\/([^/]+)\.bin$/.exec(path);
          const payload=JSON.parse(dec.decode(await readBlob(path,sha)));
          if(payload?.v!==1 || payload?.collection!=="places" || payload?.id!==match[1])
            throw new Error("Cannot clean attachments: an encrypted POI record is invalid.");
          if(!payload.deleted){
            if(!payload.record || !Array.isArray(payload.record.attachments||[]))
              throw new Error("Cannot clean attachments: an encrypted POI has an invalid attachment list.");
            for(const item of payload.record.attachments||[]){
              const id=String(item?.id||"");
              if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new Error("Cannot clean attachments: invalid media reference.");
              references.add(filePath("media",id));
            }
          }
          checked++;if(progress)progress(checked,entries.length);
        } catch(error) {stopped=true;throw error;}
      }
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(4,entries.length)},()=>worker()));
    const failed=results.find(result=>result.status==="rejected");
    if(failed)throw failed.reason; // Never delete media if any POI could not be verified.
    return references;
  }
  // Reuse verified references from the initial pull only while GitHub's SHA matches.
  // Any missing or changed record falls back to the original complete verification.
  async function remoteMediaReferences(files,progress=null) {
    const unresolved=new Map(),refs=new Set();
    let cachedCount=0,total=0;
    for(const [path,sha] of files){
      if(!/^research\/places\/[^/]+\.bin$/.test(path))continue;
      total++;
      const entry=verifiedPlaceRefs.get(path);
      if(entry?.sha!==sha){unresolved.set(path,sha);continue;}
      for(const ref of entry.refs)refs.add(ref);
      cachedCount++;
    }
    if(progress)progress(cachedCount,total);
    if(unresolved.size){
      const verified=await fetchRemoteMediaReferences(unresolved,progress?(count)=>progress(cachedCount+count,total):null);
      for(const ref of verified)refs.add(ref);
    }
    return refs;
  }
  async function deleteRemoteFile(path,sha,message) {
    const result=await request(`${baseUrl()}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,{
      method:"DELETE",body:{message,sha,branch:connection.branch}
    });
    if(!/^[a-f0-9]{40}$/i.test(result.commit?.sha||""))
      throw new Error(`GitHub did not confirm deletion of ${path}.`);
    remoteFiles.delete(path);
    verifiedPlaceRefs.delete(path);
    return result.commit.sha;
  }
  async function cleanUnusedMedia(progress=null) {
    if(progress)progress(0,"Checking for unused encrypted attachments");
    if((await storage.syncStatus()).pending.length)return 0;
    // No network requests on unchanged repository states.
    const signature=[...remoteFiles].filter(([path])=>/^research\/(places|media)\//.test(path)).sort(([a],[b])=>a.localeCompare(b)).map(([path,sha])=>`${path}:${sha}`).join("|");
    if(signature===lastMediaSnapshot)return 0;
    if(![...remoteFiles.keys()].some(path=>path.startsWith("research/media/"))){lastMediaSnapshot=signature;return 0;}
    let current=await treeSnapshot();
    if(![...current.files.keys()].some(path=>path.startsWith("research/media/"))){lastMediaSnapshot=signature;return 0;}
    const refs=await remoteMediaReferences(current.files,(completed,total)=>{
      if(progress)progress(total?0.6*completed/total:0.6,`Checked ${completed} of ${total} POIs for unused attachments`);
    });
    const unused=[...current.files].filter(([path])=>path.startsWith("research/media/")&&!refs.has(path));
    let removed=0,checked=0;
    for(const [path,sha] of unused){
      // Before each deletion recheck both branch HEAD and all active references.
      const latest=await treeSnapshot();
      if(latest.head!==current.head)break;
      const latestRefs=await remoteMediaReferences(latest.files);
      if(latest.files.get(path)!==sha||latestRefs.has(path)){
        checked++;if(progress)progress(0.6+0.4*checked/unused.length,`Checked ${checked} of ${unused.length} unused attachments`);
        continue;
      }
      if((await storage.syncStatus()).pending.length)break;
      await deleteRemoteFile(path,sha,"Remove unused encrypted Project Tracker attachment");
      removed++;
      current=await treeSnapshot();
      checked++;if(progress)progress(0.6+0.4*checked/unused.length,`Checked ${checked} of ${unused.length} unused attachments`);
    }
    if(removed){remoteFiles=await listTree();}
    // Retry if another device modified the branch or media still awaits removal.
    const stillUnused=[...remoteFiles.keys()].some(path=>path.startsWith("research/media/")&&!refs.has(path));
    if(!stillUnused)lastMediaSnapshot=[...remoteFiles].filter(([path])=>/^research\/(places|media)\//.test(path)).sort(([a],[b])=>a.localeCompare(b)).map(([path,sha])=>`${path}:${sha}`).join("|");
    return removed;
  }
  const mediaDownloads = new Map();
  async function downloadMedia(id, info={}) {
    if(mediaDownloads.has(id))return mediaDownloads.get(id);
    const job=(async()=>{
      if(await storage.readOne("attachments",id))return true;
      const path=filePath("media",id),sha=remoteFiles.get(path);
      if(!sha)return false;
      const bytes=await readBlob(path,sha);
      await storage.storeRemoteAttachment({id,name:info.name||"Attachment",type:info.type||"application/octet-stream",size:bytes.length,created:new Date().toISOString(),blob:new Blob([bytes],{type:info.type||"application/octet-stream"})});
      return true;
    })();
    mediaDownloads.set(id,job);
    try {return await job;} finally {if(mediaDownloads.get(id)===job)mediaDownloads.delete(id);}
  }
  async function uploadMedia(record,progress=null) {
    const refs=Array.isArray(record?.attachments)?record.attachments:[];
    for(const item of refs){
      const id=String(item.id||"");if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))throw new Error("Invalid attachment reference.");
      const path=filePath("media",id);
      if(!remoteFiles.has(path)){
        const media=await storage.readOne("attachments",id);
        if(!media?.blob)throw new Error(`Missing local attachment ${id}. Nothing was uploaded for this POI.`);
        if(media.blob.size>MAX_MEDIA_BYTES)throw new Error(`Attachment exceeds ${MAX_MEDIA_BYTES/1024/1024} MiB GitHub sync limit. Compress the video first.`);
        await writeBlob(path,new Uint8Array(await media.blob.arrayBuffer()),null);
      }
      if(progress)progress();
    }
  }
  async function pull(progress=null) {
    remoteFiles=await listTree();
    let changed=false,conflicts=0;
    const legacyDeleted=[];
    const entries=[...remoteFiles].filter(([path])=>/^research\/places\/[^/]+\.bin$/.test(path));
    let cursor=0,completedPlaces=0,stopped=false;
    if(progress)progress(0,entries.length);
    async function loadOne([path,sha]) {
      const match=/^research\/places\/([^/]+)\.bin$/.exec(path);
      const collection="places",id=match[1];
      const known=await storage.metadata(path);
      if(known?.sha===sha){
        // The local copy matches this exact Git SHA unless a local edit is pending.
        const cached=verifiedPlaceRefs.get(path);
        if(cached?.sha!==sha && !await storage.readOne("sync_outbox",`${collection}:${id}`)){
          const saved=await storage.readOne(collection,id);
          if(saved?.id===id)rememberVerifiedPlaceRefs(path,sha,{v:1,id,collection,record:saved});
        }
        // Keep recognizing legacy deletion markers already cached by old builds.
        if(!await storage.readOne(collection,id)){
          const previous=JSON.parse(dec.decode(await readBlob(path,sha)));
          if(previous?.v===1 && previous?.id===id && previous?.collection===collection && previous.deleted)legacyDeleted.push([path,sha]);
        }
        return;
      }
      const pending=await storage.readOne("sync_outbox",`${collection}:${id}`);
      if(pending){if(known?.sha!==sha)conflicts++;return;}
      const existing=await storage.readOne(collection,id);
      if(existing && !known?.sha){conflicts++;return;}
      const payload=JSON.parse(dec.decode(await readBlob(path,sha)));
      if(payload?.v!==1 || payload?.id!==id || payload?.collection!==collection)throw new Error("Encrypted record does not match its repository path.");
      if(payload.record?.id && payload.record.id!==id)throw new Error("Encrypted record has a mismatched ID.");
      if(payload.deleted){
        if(await storage.applyRemote(collection,id,null,sha,path))changed=true;
        legacyDeleted.push([path,sha]);
        return;
      }
      if(payload.record?.attachments?.length){
        for(const media of payload.record.attachments){
          if(!await downloadMedia(media.id,media))throw new Error("A referenced attachment is missing from the repository.");
        }
      }
      if(await storage.applyRemote(collection,id,payload.record,sha,path))changed=true;
    }
    async function worker() {
      while(!stopped && cursor<entries.length){
        const entry=entries[cursor++];
        try {
          await loadOne(entry);
          completedPlaces++;
          if(progress)progress(completedPlaces,entries.length);
        } catch(error) {stopped=true;throw error;}
      }
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(4,entries.length)},()=>worker()));
    const failed=results.find(result=>result.status==="rejected");
    if(failed)throw failed.reason; // Never reconcile remote deletions from a failed/incomplete pull.
    // GitHub is authoritative: removed remote POI files must disappear locally.
    for(const entry of await storage.remotePlaceMetadata()){
      if(remoteFiles.has(entry.id))continue;
      const removed=await storage.removeRemotePlace(entry.id);
      if(removed.conflict){conflicts++;continue;}
      if(removed.removed)changed=true;
      if(removed.attachments.length)await storage.deleteUnreferencedAttachments(removed.attachments);
    }
    // Upgrade deletion markers written by older versions to actual file removal.
    for(const [path,sha] of legacyDeleted){
      try{await deleteRemoteFile(path,sha,"Remove legacy Project Tracker deletion record");}
      catch(e){if(e.status!==404&&e.status!==409&&e.status!==422)throw e;}
      // The next check clears stale SHA metadata and any remaining cached record.
    }
    if(changed)onChange();
    return conflicts;
  }
  async function push(progress=null) {
    const queued=(await storage.syncStatus()).pending.filter(item=>item.collection==="places");
    const mediaCount=item=>item.deleted?0:(Array.isArray(item.record?.attachments)?item.record.attachments.length:0);
    const total=queued.reduce((sum,item)=>sum+1+mediaCount(item),0);
    let completed=0,conflicts=0;
    const step=()=>{completed++;if(progress)progress(completed,total,`Processed ${completed} of ${total} pending operations`);};
    if(progress)progress(0,total,total?`Processing ${total} pending POI and attachment operations`:"No pending changes to upload");
    for(const item of queued){
      const path=filePath(item.collection,item.recordId);
      const current=remoteFiles.get(path)||null;
      const known=(await storage.metadata(path))?.sha||null;
      // Permanent removal deletes the encrypted file, not an encrypted tombstone.
      if(item.deleted && !current){await storage.ackRemoval(item,path);step();continue;}
      if(current!==known){conflicts++;for(let i=0;i<=mediaCount(item);i++)step();continue;}
      try{
        if(item.deleted){
          await deleteRemoteFile(path,current,"Permanently remove encrypted Project Tracker POI");
          await storage.ackRemoval(item,path);
        }else{
          if(item.record)await uploadMedia(item.record,step);
          const payload={v:1,id:item.recordId,collection:item.collection,deleted:false,record:item.record};
          const newSha=await writeBlob(path,enc.encode(JSON.stringify(payload)),known);
          rememberVerifiedPlaceRefs(path,newSha,payload);
          await storage.ackPending(item,path,newSha);
        }
        step();
      }catch(e){
        if(e.status===409||e.status===422){conflicts++;step();continue;}
        throw e;
      }
    }
    return conflicts;
  }
  async function sync(progress=null) {
    if(!connection||!active)return;
    if(syncing)return syncing;
    syncing=(async()=>{
      lastAttemptAt=new Date().toISOString();
      try{
        setStatus("Synchronizing encrypted research...");
        if(progress)progress(80,"Checking GitHub for recent POI changes");
        let detected=await pull((completed,total)=>{
          if(progress)progress(total?80+Math.floor(2*completed/total):82,total?`Checked ${completed} of ${total} remote POIs`:"No remote POIs to reconcile");
        });
        if(progress)progress(83,"Checking locally pending changes and attachments");
        detected+=await push((completed,total,detail)=>{
          if(progress)progress(total?83+Math.floor(6*completed/total):89,detail);
        });
        pendingCount=(await storage.syncStatus()).pending.length;
        conflicts=detected;
        lastCheckAt=new Date().toISOString();
        if(detected)setStatus(`${pendingCount} changes need conflict resolution. They remain safely in this browser.`,"Concurrent or preexisting records detected");
        else if(pendingCount)setStatus(`${pendingCount} changes saved locally. Upload pending.`);
        else {
          if(progress)progress(89,"Checking encrypted attachment references");
          const removed=await cleanUnusedMedia((fraction,detail)=>{
            if(progress)progress(89+Math.floor(3*fraction),detail);
          });
          lastSuccessAt=lastCheckAt;
          setStatus(removed ? `Up to date - removed ${removed} unused attachment(s)` : "Up to date - encrypted GitHub sync active");
        }
        if(progress)progress(92,"Finishing encrypted synchronization");
      }catch(e){setStatus("Offline or sync failed - local changes retained",e?.message||"Unknown error");}
    })().finally(()=>{syncing=null;onStatus(snapshot());if(needsResync){needsResync=false;queueSoon();}});
    return syncing;
  }
  function queueSoon() { if(!connection||!active)return;clearTimeout(delayTimer);delayTimer=setTimeout(()=>{if(syncing){needsResync=true;return;}void sync();},DEBOUNCE_MS); }
  async function connect({token,passphrase}) {
    const owner=assertSafe(TARGET.owner,"GitHub owner");
    const repo=assertSafe(TARGET.repo,"repository name");
    const branch=TARGET.branch;
    if(!/^[a-zA-Z0-9_.\/-]+$/.test(branch)||branch.includes(".."))throw new Error("Invalid branch name.");
    if(!String(token||"").trim())throw new Error("A GitHub fine-grained repository token is required for uploads.");
    emitProgress(2,"Deriving encryption key");
    const key=await deriveKey(passphrase,owner,ENCRYPTION_CONTEXT_REPO);
    verifiedPlaceRefs.clear();
    connection={owner,repo,branch,token:String(token).trim(),key};
    emitProgress(10,"Checking private repository access");
    try {
      await storage.discardLegacyNonPoiQueue();
      const details=await request(`${baseUrl()}`);
      if(!details.private)throw new Error("Only private GitHub repositories are supported to avoid exposing research metadata.");
      emitProgress(17,"Checking encrypted research files");
      // Validate the passphrase by decrypting existing data before enabling uploads.
      await pull((completed,total)=>{
        const percent=total?20+Math.floor(54*completed/total):74;
        emitProgress(percent,total?`Loaded ${completed} of ${total} POIs (including attachments)`:"No remote POIs to download");
      });
      emitProgress(77,"Reconciling local and remote changes");
    } catch(e){connection=null;remoteFiles.clear();verifiedPlaceRefs.clear();throw e;}
    active=true;
    lastMediaSnapshot="";
    setStatus("Connected. Downloading encrypted research...");
    clearInterval(pollTimer);pollTimer=setInterval(()=>void sync(),POLL_MS);
    emitProgress(80,"Synchronizing pending changes and attachments");
    await sync(emitProgress);
    return true;
  }
  function disconnect(){active=false;needsResync=false;connection=null;remoteFiles.clear();verifiedPlaceRefs.clear();clearInterval(pollTimer);clearTimeout(delayTimer);setStatus("Not connected - browser cache available");}
  function onVisibility(){if(document.visibilityState==="visible")void sync();}
  window.addEventListener("pt-local-change",queueSoon);
  document.addEventListener("visibilitychange",onVisibility);
  window.FAGitHubSync=Object.freeze({connect,disconnect,sync,queueSoon,downloadMedia,snapshot,setHandlers:(a,b,c)=>{onChange=a||onChange;onStatus=b||onStatus;onProgress=c||onProgress;}, publishExisting:storage.queueExisting});
})();
