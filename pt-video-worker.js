const ALLOWED_ORIGIN = "https://pct-sc.github.io";
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store"
  };
  if (origin === ALLOWED_ORIGIN) headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  return headers;
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" }
  });
}

function text(request, value, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(value, { status, headers: { ...corsHeaders(request), "Content-Type": contentType } });
}

async function googleAccessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Google token refresh failed (${response.status}).`);
  return data.access_token;
}

function validFileId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : "";
}

function validAttachmentId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9._-]{8,200}$/.test(id) ? id : "";
}

async function driveFetch(token, url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function shareFile(token, fileId) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ role: "reader", type: "anyone", allowFileDiscovery: false })
  });
  if (!response.ok) throw new Error(`Google Drive sharing failed (${response.status}).`);
}

async function deleteFile(token, fileId) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" });
  if (response.ok || response.status === 404) return true;
  throw new Error(`Google Drive delete failed (${response.status}).`);
}

async function fileMetadata(token, fileId) {
  const fields = encodeURIComponent("id,name,size,createdTime,webViewLink,appProperties,trashed");
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${fields}&supportsAllDrives=true`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Drive metadata failed (${response.status}).`);
  return data;
}

async function createUploadSession(token, name, mimeType, size, attachmentId) {
  const response = await driveFetch(token, `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size,webViewLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(size)
    },
    body: JSON.stringify({ name, mimeType, appProperties: { ptVideo: "1", ptAttachmentId: attachmentId } })
  });
  const sessionUrl = response.headers.get("Location");
  if (!response.ok || !sessionUrl || !/^https:\/\/www\.googleapis\.com\//.test(sessionUrl)) {
    throw new Error(`Google Drive upload session failed (${response.status}).`);
  }
  return sessionUrl;
}

async function uploadBytes(token, sessionUrl, bytes, mimeType) {
  const response = await driveFetch(token, sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength)
    },
    body: bytes
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !validFileId(data.id)) throw new Error(`Google Drive upload failed (${response.status}).`);
  return data;
}

async function uploadVideo(request, env) {
  const url = new URL(request.url);
  const name = String(url.searchParams.get("name") || "video").trim().slice(0, 240) || "video";
  const claimedSize = Number(url.searchParams.get("size") || 0);
  const attachmentId = validAttachmentId(url.searchParams.get("attachmentId"));
  const mimeType = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (!mimeType.startsWith("video/")) return json(request, { error: "A video Content-Type is required." }, 400);
  if (!attachmentId) return json(request, { error: "A valid PT attachment ID is required." }, 400);
  if (!Number.isFinite(claimedSize) || claimedSize <= 0 || claimedSize > MAX_VIDEO_BYTES) return json(request, { error: "Invalid video size." }, 400);
  if (contentLength && (contentLength !== claimedSize || contentLength > MAX_VIDEO_BYTES)) return json(request, { error: "Video size does not match the request." }, 400);

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== claimedSize || bytes.byteLength <= 0 || bytes.byteLength > MAX_VIDEO_BYTES) return json(request, { error: "Video size does not match the uploaded body." }, 400);

  const token = await googleAccessToken(env);
  let fileId = "";
  try {
    const sessionUrl = await createUploadSession(token, name, mimeType, bytes.byteLength, attachmentId);
    const file = await uploadBytes(token, sessionUrl, bytes, mimeType);
    fileId = validFileId(file.id);
    await shareFile(token, fileId);
    const metadata = await fileMetadata(token, fileId);
    const viewUrl = String(metadata.webViewLink || `https://drive.google.com/file/d/${fileId}/view`);
    if (!/^https:\/\/drive\.google\.com\//.test(viewUrl)) throw new Error("Google Drive did not return a valid viewing link.");
    return json(request, { fileId, name: String(metadata.name || name), size: Number(metadata.size || bytes.byteLength), url: viewUrl });
  } catch (error) {
    if (fileId) { try { await deleteFile(token, fileId); } catch {} }
    throw error;
  }
}

async function setManagedAttachmentId(token, fileId, attachmentId) {
  const response = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,appProperties&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ appProperties: { ptVideo: "1", ptAttachmentId: attachmentId } })
  });
  if (!response.ok) throw new Error(`Google Drive metadata update failed (${response.status}).`);
}

async function listManagedVideos(token) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: "appProperties has { key='ptVideo' and value='1' } and trashed=false",
      spaces: "drive",
      pageSize: "1000",
      fields: "nextPageToken,files(id,name,size,createdTime,webViewLink,appProperties)"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await driveFetch(token, `${DRIVE_API}/files?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google Drive listing failed (${response.status}).`);
    for (const file of data.files || []) if (validFileId(file.id)) files.push(file);
    pageToken = String(data.nextPageToken || "");
  } while (pageToken);
  return files;
}

async function reconcileVideos(request, env) {
  const body = await request.json().catch(() => null);
  const rawAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
  if (rawAttachments.length > 10000) return json(request, { error: "Too many PT video attachments." }, 400);

  const desired = new Map();
  const desiredByFileId = new Map();
  for (const item of rawAttachments) {
    const attachmentId = validAttachmentId(item?.attachmentId);
    if (!attachmentId) continue;
    const fileId = validFileId(item?.fileId);
    desired.set(attachmentId, { attachmentId, fileId });
    if (fileId && !desiredByFileId.has(fileId)) desiredByFileId.set(fileId, attachmentId);
  }

  const token = await googleAccessToken(env);
  const files = await listManagedVideos(token);
  const candidates = new Map();
  const deleted = [];
  const cleanupFailed = [];

  async function remove(fileId) {
    try { await deleteFile(token, fileId); deleted.push(fileId); return true; }
    catch { cleanupFailed.push(fileId); return false; }
  }

  for (const file of files) {
    const fileId = validFileId(file.id);
    if (!fileId) continue;
    const taggedAttachmentId = validAttachmentId(file.appProperties?.ptAttachmentId);
    const currentAttachmentId = desiredByFileId.get(fileId) || "";
    const attachmentId = currentAttachmentId || (taggedAttachmentId && desired.has(taggedAttachmentId) ? taggedAttachmentId : "");
    if (!attachmentId) {
      await remove(fileId);
      continue;
    }
    if (!candidates.has(attachmentId)) candidates.set(attachmentId, []);
    candidates.get(attachmentId).push(file);
  }

  const videos = [];
  for (const item of desired.values()) {
    const list = candidates.get(item.attachmentId) || [];
    if (!list.length) continue;

    list.sort((a, b) => Date.parse(b.createdTime || "") - Date.parse(a.createdTime || ""));
    const chosen = (item.fileId && list.find(file => validFileId(file.id) === item.fileId)) || list[0];
    const chosenId = validFileId(chosen.id);
    if (!chosenId) continue;

    if (validAttachmentId(chosen.appProperties?.ptAttachmentId) !== item.attachmentId) {
      await setManagedAttachmentId(token, chosenId, item.attachmentId);
    }

    for (const file of list) {
      const fileId = validFileId(file.id);
      if (fileId && fileId !== chosenId) await remove(fileId);
    }

    const viewUrl = String(chosen.webViewLink || `https://drive.google.com/file/d/${chosenId}/view`);
    videos.push({ attachmentId: item.attachmentId, fileId: chosenId, url: viewUrl });
  }

  return json(request, { videos, deletedFileIds: deleted, cleanupFailedFileIds: cleanupFailed });
}

async function legacyUploadStart(request, env) {
  const body = await request.json().catch(() => null);
  const name = String(body?.name || "video").trim().slice(0, 240) || "video";
  const mimeType = String(body?.mimeType || "").toLowerCase();
  const size = Number(body?.size || 0);
  if (!mimeType.startsWith("video/") || !Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) return json(request, { error: "Invalid video upload request." }, 400);
  const token = await googleAccessToken(env);
  const sessionUrl = await createUploadSession(token, name, mimeType, size, `legacy_${Date.now()}`);
  return json(request, { sessionUrl });
}

async function legacyShare(request, env) {
  const body = await request.json().catch(() => null);
  const fileId = validFileId(body?.fileId);
  if (!fileId) return json(request, { error: "Invalid fileId." }, 400);
  const token = await googleAccessToken(env);
  await shareFile(token, fileId);
  const metadata = await fileMetadata(token, fileId);
  const viewUrl = String(metadata.webViewLink || `https://drive.google.com/file/d/${fileId}/view`);
  return json(request, { fileId, name: String(metadata.name || "video"), size: Number(metadata.size || 0), url: viewUrl });
}

async function legacyDelete(request, env) {
  const body = await request.json().catch(() => null);
  const fileId = validFileId(body?.fileId);
  if (!fileId) return json(request, { error: "Invalid fileId." }, 400);
  const token = await googleAccessToken(env);
  await deleteFile(token, fileId);
  return json(request, { deleted: true, fileId });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers });
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/privacy") {
      return text(request, "Project Tracker Video Hosting stores only videos explicitly uploaded by authorized Project Tracker users in the configured Google Drive account. The service does not sell personal information or use uploaded content for advertising.");
    }

    if (!url.pathname.startsWith("/api/")) {
      return text(request, "Project Tracker Video Hosting\nPrivacy: /privacy\n");
    }

    if (request.headers.get("Authorization") !== `Bearer ${env.PT_API_KEY}`) return json(request, { error: "Unauthorized" }, 401);

    try {
      if (url.pathname === "/api/ping" && request.method === "GET") return text(request, "PT video API OK");
      if (url.pathname === "/api/upload" && request.method === "POST") return await uploadVideo(request, env);
      if (url.pathname === "/api/reconcile" && request.method === "POST") return await reconcileVideos(request, env);
      if (url.pathname === "/api/upload/start" && request.method === "POST") return await legacyUploadStart(request, env);
      if (url.pathname === "/api/share" && request.method === "POST") return await legacyShare(request, env);
      if (url.pathname === "/api/delete" && request.method === "POST") return await legacyDelete(request, env);
      return json(request, { error: "Not found" }, 404);
    } catch (error) {
      return json(request, { error: String(error?.message || "Video hosting request failed.") }, 502);
    }
  }
};
