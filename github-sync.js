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
  const VIDEO_WORKER = "https://pt-video.cloudflaresc-aqvny-a60.workers.dev";
  const VIDEO_KEY_PATH = "research/config/video-api.bin";
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
  let driveStatus="Not configured",driveBusy=false,drivePending=0,driveError="";
  const snapshot = () => ({connected:!!connection, videoHosting:!!connection?.videoApiKey, busy:!!syncing, status, error:lastError, lastAttemptAt, lastCheckAt, lastSuccessAt, conflicts, pendingCount, driveBusy, driveStatus, drivePending, driveError, pollSeconds:POLL_MS/1000});
  function notifyStatus(){try{onStatus(snapshot());}catch{}}
  function setStatus(message,error="") { status=message;lastError=error;notifyStatus(); }
  function setDriveStatus(message,{busy=driveBusy,pending=drivePending,error=""}={}) {
    driveStatus=String(message||"");driveBusy=!!busy;drivePending=Math.max(0,Number(pending)||0);driveError=String(error||"");notifyStatus();
  }
  async function finishDriveStatus(message="Google Drive up to date") {
    const [uploads,deletes]=await Promise.all([storage.videoUploadQueue().catch(()=>[]),storage.videoDeleteQueue().catch(()=>[])]);
    const pending=uploads.length+deletes.length;
    const last=[...uploads,...deletes].map(item=>String(item?.lastError||"")).filter(Boolean).pop()||"";
    setDriveStatus(pending?`${pending} Google Drive task${pending===1?"":"s"} pending`:message,{busy:false,pending,error:last});
  }
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
  async function readEncryptedConfig(path) {
    let file;
    try { file=await request(`${baseUrl()}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(connection.branch)}`); }
    catch(error){if(error.status===404)return null;throw error;}
    if(file?.type!=="file" || file.encoding!=="base64" || !file.content || !/^[a-f0-9]{40}$/i.test(file.sha||""))throw new Error("Invalid encrypted video-hosting configuration.");
    return {sha:file.sha,plain:await decrypt(path,fromBase64(file.content))};
  }
  async function loadVideoApiKey() {
    try {
      const saved=await readEncryptedConfig(VIDEO_KEY_PATH);
      if(!saved)return null;
      const payload=JSON.parse(dec.decode(saved.plain));
      const key=String(payload?.key||"").trim();
      if(payload?.v!==1 || payload?.kind!=="pt-video-api-key" || key.length<20)return null;
      return key;
    } catch {return null;}
  }
  async function provisionVideoApiKey(value) {
    if(!connection)throw new Error("Connect to GitHub first.");
    const key=String(value||"").trim();
    if(key.length<20)throw new Error("The video API key is invalid.");
    let existingSha=null;
    try {
      const file=await request(`${baseUrl()}/contents/${VIDEO_KEY_PATH.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(connection.branch)}`);
      if(file?.type!=="file" || !/^[a-f0-9]{40}$/i.test(file.sha||""))throw new Error("Invalid video-hosting configuration file.");
      existingSha=file.sha;
    } catch(error){if(error.status!==404)throw error;}
    const payload=enc.encode(JSON.stringify({v:1,kind:"pt-video-api-key",key}));
    await writeBlob(VIDEO_KEY_PATH,payload,existingSha);
    connection.videoApiKey=key;
    return true;
  }
  async function videoApi(path,body) {
    if(!connection?.videoApiKey)throw new Error("Video hosting is not configured for this research repository.");
    let response;
    try {response=await fetch(`${VIDEO_WORKER}${path}`,{method:"POST",headers:{"Authorization":`Bearer ${connection.videoApiKey}`,"Content-Type":"application/json"},body:JSON.stringify(body||{}),cache:"no-store"});}
    catch {throw new Error("Video hosting service is unavailable.");}
    let data=null;try{data=await response.json();}catch{}
    if(!response.ok){const error=new Error(String(data?.error||`Video hosting HTTP ${response.status}`));error.status=response.status;error.remoteStatus=Number(data?.status)||0;throw error;}
    return data||{};
  }
  async function uploadHostedVideo(blob,name,attachmentId,onProgress=null) {
    if(!(blob instanceof Blob) || !String(blob.type||"").toLowerCase().startsWith("video/"))throw new Error("Invalid video attachment.");
    if(blob.size<=0 || blob.size>MAX_MEDIA_BYTES)throw new Error(`Video must be between 1 byte and ${MAX_MEDIA_BYTES/1024/1024} MiB.`);
    const mediaId=String(attachmentId||"");
    if(!/^[A-Za-z0-9._-]{8,200}$/.test(mediaId))throw new Error("Invalid video attachment ID.");
    if(!connection?.videoApiKey)throw new Error("Video hosting is not configured for this research repository.");
    if(onProgress)onProgress(0);
    const url=`${VIDEO_WORKER}/api/upload?name=${encodeURIComponent(String(name||"video").slice(0,240))}&size=${encodeURIComponent(blob.size)}&attachmentId=${encodeURIComponent(mediaId)}`;
    const data=await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open("POST",url,true);
      xhr.setRequestHeader("Authorization",`Bearer ${connection.videoApiKey}`);
      xhr.setRequestHeader("Content-Type",blob.type);
      xhr.upload.onprogress=event=>{if(onProgress&&event.lengthComputable&&event.total>0)onProgress(event.loaded/event.total);};
      xhr.onerror=()=>reject(new Error("Video hosting service is unavailable."));
      xhr.onload=()=>{
        let payload=null;try{payload=JSON.parse(xhr.responseText||"null");}catch{}
        if(xhr.status>=200&&xhr.status<300){resolve(payload||{});return;}
        const error=new Error(String(payload?.error||`Video hosting HTTP ${xhr.status}`));error.status=xhr.status;error.remoteStatus=Number(payload?.status)||0;reject(error);
      };
      xhr.send(blob);
    });
    const fileId=String(data?.fileId||""),viewUrl=String(data?.url||"");
    if(!/^[A-Za-z0-9_-]{10,200}$/.test(fileId) || !/^https:\/\/drive\.google\.com\//.test(viewUrl))throw new Error("Video host returned invalid file metadata.");
    if(onProgress)onProgress(1);
    return {provider:"gdrive",fileId,url:viewUrl};
  }
  let videoDeleteRunning=null;
  async function processHostedVideoDeletes() {
    if(videoDeleteRunning || !connection?.videoApiKey)return videoDeleteRunning;
    const session=connection;
    videoDeleteRunning=(async()=>{
      const items=await storage.videoDeleteQueue();
      let index=0;
      for(const item of items){
        if(connection!==session)break;
        const due=Date.parse(item.nextAttempt||"");if(Number.isFinite(due)&&due>Date.now())continue;
        index++;
        setDriveStatus(`Removing unused Drive video ${index} of ${items.length}...`,{busy:true,pending:Math.max(drivePending,items.length-index+1),error:""});
        try {await videoApi("/api/delete",{fileId:item.fileId});await storage.ackVideoDelete(item.id);drivePending=Math.max(0,drivePending-1);notifyStatus();}
        catch(error){if(error.remoteStatus===404)await storage.ackVideoDelete(item.id);else await storage.deferVideoDelete(item.id,error.message);}
      }
    })().finally(()=>{videoDeleteRunning=null;});
    return videoDeleteRunning;
  }
  let videoUploadRunning=null,videoReconcileRunning=null,videoWorkTimer=null;
  async function processHostedVideoUploads() {
    if(videoUploadRunning || !connection?.videoApiKey)return videoUploadRunning;
    const session=connection;
    videoUploadRunning=(async()=>{
      const items=await storage.videoUploadQueue();
      let index=0;
      for(const item of items){
        if(connection!==session)break;
        const due=Date.parse(item.nextAttempt||"");if(Number.isFinite(due)&&due>Date.now())continue;
        index++;
        const attachmentId=String(item.attachmentId||item.id||"");
        try {
          const inventory=await storage.videoHostInventory();
          const target=inventory.videos.find(video=>video.attachmentId===attachmentId);
          if(!target || target.host){await storage.ackVideoUpload(item.id);continue;}
          const stored=await storage.readAttachment(attachmentId);
          if(!(stored?.blob instanceof Blob))throw new Error(`Video attachment ${attachmentId} is not available locally yet.`);
          const remaining=Math.max(1,items.length-index+1);
          setDriveStatus(`Uploading video ${index} of ${items.length} · 0%`,{busy:true,pending:Math.max(drivePending,remaining),error:""});
          const host=await uploadHostedVideo(stored.blob,target.name||stored.name||"video",attachmentId,progress=>{
            if(connection===session)setDriveStatus(`Uploading video ${index} of ${items.length} · ${Math.round(Math.max(0,Math.min(1,Number(progress)||0))*100)}%`,{busy:true,pending:Math.max(drivePending,remaining),error:""});
          });
          if(connection!==session){try{await videoApi("/api/delete",{fileId:host.fileId});}catch{}break;}
          await storage.setAttachmentVideoHost(attachmentId,host);
          drivePending=Math.max(0,drivePending-1);notifyStatus();
        } catch(error){
          if(connection!==session)break;
          await storage.deferVideoUpload(item.id,error?.message||"Video upload failed");
          setDriveStatus(`Video upload failed; retry queued`,{busy:false,pending:Math.max(1,drivePending),error:error?.message||"Video upload failed"});
        }
      }
    })().finally(()=>{videoUploadRunning=null;});
    return videoUploadRunning;
  }
  async function reconcileHostedVideos(fullAudit=false) {
    if(videoReconcileRunning || !connection?.videoApiKey)return videoReconcileRunning;
    const session=connection;
    setDriveStatus(fullAudit?"Checking Google Drive videos...":"Checking video hosting...",{busy:true,pending:drivePending,error:""});
    videoReconcileRunning=(async()=>{
      let inventory=await storage.videoHostInventory();
      if(fullAudit){
        try {
          setDriveStatus(`Reconciling ${inventory.videos.length} video attachment${inventory.videos.length===1?"":"s"} with Google Drive...`,{busy:true,pending:drivePending,error:""});
          const remote=await videoApi("/api/reconcile",{attachments:inventory.videos.map(video=>({attachmentId:video.attachmentId,fileId:video.host?.fileId||""}))});
          if(connection!==session)return;
          const remoteByAttachment=new Map((Array.isArray(remote?.videos)?remote.videos:[]).map(item=>[String(item?.attachmentId||""),item]));
          for(const video of inventory.videos){
            const remoteVideo=remoteByAttachment.get(video.attachmentId);
            if(remoteVideo){
              const fileId=String(remoteVideo.fileId||""),url=String(remoteVideo.url||"");
              if(/^[A-Za-z0-9_-]{10,200}$/.test(fileId) && /^https:\/\/drive\.google\.com\//.test(url) &&
                (!video.host || video.host.fileId!==fileId || video.host.url!==url)){
                await storage.setAttachmentVideoHost(video.attachmentId,{provider:"gdrive",fileId,url});
              }
            } else if(video.host) {
              await storage.clearAttachmentVideoHost(video.attachmentId,video.host.fileId);
            }
          }
          inventory=await storage.videoHostInventory();
        } catch(error) {
          setDriveStatus("Google Drive reconciliation failed",{busy:false,pending:drivePending,error:error?.message||"Google Drive reconciliation failed"});
        }
      }
      if(connection!==session)return;
      const missing=inventory.videos.filter(video=>!video.host).map(video=>video.attachmentId);
      await storage.replaceVideoUploadQueue(missing);
      const deletes=await storage.videoDeleteQueue().catch(()=>[]);
      drivePending=missing.length+deletes.length;
      notifyStatus();
      await processHostedVideoUploads();
      try{await processHostedVideoDeletes();}catch{}
      if(connection===session)await finishDriveStatus();
    })().finally(()=>{videoReconcileRunning=null;});
    return videoReconcileRunning;
  }
  function queueHostedVideoWork() {
    if(!connection||!active)return;
    clearTimeout(videoWorkTimer);
    videoWorkTimer=setTimeout(()=>void reconcileHostedVideos(false),1200);
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
  const pendingMedia = new Map();
  let mediaPrefetchStarted = false, mediaPrefetch = null;
  async function downloadMedia(id, info={}) {
    if(mediaDownloads.has(id))return mediaDownloads.get(id);
    const job=(async()=>{
      if(await storage.readOne("attachments",id))return true;
      const path=filePath("media",id),sha=remoteFiles.get(path);
      if(!sha)return false;
      const bytes=await readBlob(path,sha);
      await storage.storeRemoteAttachment({id,name:info.name||"Attachment",type:info.type||"application/octet-stream",size:bytes.length,created:new Date().toISOString(),blob:new Blob([bytes],{type:info.type||"application/octet-stream"}),...(info.video_host?{video_host:info.video_host}:{})});
      return true;
    })();
    mediaDownloads.set(id,job);
    try {return await job;} finally {if(mediaDownloads.get(id)===job)mediaDownloads.delete(id);}
  }
  function startMediaPrefetch() {
    if(!mediaPrefetchStarted || !active || mediaPrefetch || !pendingMedia.size)return;
    const session=connection;
    mediaPrefetch=(async()=>{
      let firstError=null;
      async function worker() {
        while(active && connection===session && pendingMedia.size){
          const [id,info]=pendingMedia.entries().next().value;
          pendingMedia.delete(id);
          try{if(!await downloadMedia(id,info))throw new Error(`Missing remote attachment ${id}.`);}
          catch(error){if(!firstError)firstError=error;}
        }
      }
      await Promise.all(Array.from({length:Math.min(3,pendingMedia.size)},()=>worker()));
      if(firstError && connection===session)setStatus("Connected - some attachments could not download",firstError.message);
    })().finally(()=>{mediaPrefetch=null;if(active && pendingMedia.size)startMediaPrefetch();});
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
        // Resume missing attachment downloads after an interrupted browser session.
        const cachedPlace=await storage.readOne(collection,id);
        if(cachedPlace?.id===id && !await storage.readOne("sync_outbox",`${collection}:${id}`)){
          for(const media of cachedPlace.attachments||[]){
            const mediaId=String(media?.id||"");
            if(/^[a-zA-Z0-9_-]{8,100}$/.test(mediaId) && remoteFiles.has(filePath("media",mediaId)))pendingMedia.set(mediaId,media);
          }
        }
        // Keep recognizing legacy deletion markers already cached by old builds.
        if(!cachedPlace){
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
          const mediaId=String(media?.id||"");
          if(!/^[a-zA-Z0-9_-]{8,100}$/.test(mediaId)||!remoteFiles.has(filePath("media",mediaId)))
            throw new Error("A referenced attachment is missing from the repository.");
          pendingMedia.set(mediaId,media);
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
    startMediaPrefetch();
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
        try {await processHostedVideoDeletes();} catch {}
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
    pendingMedia.clear();
    mediaPrefetchStarted=false;
    connection={owner,repo,branch,token:String(token).trim(),key,videoApiKey:null};
    emitProgress(10,"Checking private repository access");
    try {
      await storage.discardLegacyNonPoiQueue();
      const details=await request(`${baseUrl()}`);
      if(!details.private)throw new Error("Only private GitHub repositories are supported to avoid exposing research metadata.");
      connection.videoApiKey=await loadVideoApiKey();
      driveStatus=connection.videoApiKey?"Waiting for map to load":"Not configured";driveBusy=false;drivePending=0;driveError="";notifyStatus();
      emitProgress(17,"Checking encrypted research files");
      // Validate the passphrase by decrypting existing data before enabling uploads.
      await pull((completed,total)=>{
        const percent=total?20+Math.floor(54*completed/total):74;
        emitProgress(percent,total?`Loaded ${completed} of ${total} POIs (including attachments)`:"No remote POIs to download");
      });
      emitProgress(77,"Reconciling local and remote changes");
    } catch(e){connection=null;remoteFiles.clear();verifiedPlaceRefs.clear();pendingMedia.clear();throw e;}
    active=true;
    lastMediaSnapshot="";
    setStatus("Connected - POIs loaded; attachment downloads and sync pending");
    clearInterval(pollTimer);pollTimer=setInterval(()=>void sync(),POLL_MS);
    emitProgress(92,"Preparing local map");
    return true;
  }
  async function repoInfo(){
    if(!connection)return null;
    const [tree,commit]=await Promise.all([request(`${baseUrl()}/git/trees/${encodeURIComponent(connection.branch)}?recursive=1`),request(`${baseUrl()}/commits/${encodeURIComponent(connection.branch)}`)]);
    if(tree.truncated)throw new Error("Incomplete repository tree");
    const types=new Map();
    for(const p of await storage.readAll("places"))for(const a of p.attachments||[])types.set(String(a.id),String(a.type||"").toLowerCase());
    const groups={places:[0,0],videos:[0,0],images:[0,0],otherMedia:[0,0],unknown:[0,0],other:[0,0]};
    let total=0;
    for(const f of tree.tree||[]){
      if(f.type!=="blob")continue;
      const bytes=Number(f.size)||0;
      const match=/^research\/media\/([^/]+)\.bin$/.exec(f.path);
      const mime=match?types.get(match[1])||"":"";
      const group=/^research\/places\/[^/]+\.bin$/.test(f.path)?"places":match?(mime.startsWith("video/")?"videos":mime.startsWith("image/")?"images":mime?"otherMedia":"unknown"):"other";
      groups[group][0]++;groups[group][1]+=bytes;total+=bytes;
    }
    return {total,groups,last:commit.commit?.committer?.date||commit.commit?.author?.date||null};
  }
  function startBackgroundTransfers(){mediaPrefetchStarted=true;startMediaPrefetch();if(connection?.videoApiKey)setDriveStatus("Starting Google Drive reconciliation...",{busy:true,pending:drivePending,error:""});void reconcileHostedVideos(true);queueSoon();}
  async function syncNow(){await sync();if(connection?.videoApiKey)await reconcileHostedVideos(true);}
  function disconnect(){active=false;needsResync=false;connection=null;remoteFiles.clear();verifiedPlaceRefs.clear();pendingMedia.clear();mediaPrefetchStarted=false;clearInterval(pollTimer);clearTimeout(delayTimer);clearTimeout(videoWorkTimer);driveStatus="Not configured";driveBusy=false;drivePending=0;driveError="";setStatus("Not connected - browser cache available");}
  function onVisibility(){if(document.visibilityState==="visible")void sync();}
  window.addEventListener("pt-local-change",()=>{queueSoon();queueHostedVideoWork();});
  document.addEventListener("visibilitychange",onVisibility);
  window.FAGitHubSync=Object.freeze({connect,disconnect,sync,syncNow,queueSoon,downloadMedia,startBackgroundTransfers,repoInfo,snapshot,uploadHostedVideo,provisionVideoApiKey,setHandlers:(a,b,c)=>{onChange=a||onChange;onStatus=b||onStatus;onProgress=c||onProgress;}, publishExisting:storage.queueExisting});
})();
