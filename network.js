(() => {
  "use strict";
  function networkAbortError() {
    try { return new DOMException("Request cancelled.", "AbortError"); }
    catch { const error = new Error("Request cancelled."); error.name = "AbortError"; return error; }
  }

  function networkRetryDelay(attempt, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(networkAbortError()); return; }
      const delay = Math.min(5000, 750 * Math.pow(2, attempt));
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        reject(networkAbortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      }, delay);
      signal?.addEventListener?.("abort", onAbort, {once: true});
    });
  }

  async function networkFetch(input, init = {}, policy = {}) {
    const timeoutMs = Math.max(0, Number(policy.timeoutMs ?? 20000));
    const retries = Math.max(0, Math.floor(Number(policy.retries ?? 0)));
    const retryStatuses = Array.isArray(policy.retryStatuses) ? policy.retryStatuses : [408, 429, 500, 502, 503, 504];
    const label = String(policy.label || "Request");
    const outerSignal = init.signal;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (outerSignal?.aborted) throw networkAbortError();
      const controller = new AbortController();
      let timedOut = false;
      const forwardAbort = () => controller.abort();
      outerSignal?.addEventListener?.("abort", forwardAbort, {once: true});
      const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
      let retry = false;
      let error = null;
      try {
        const response = await fetch(input, {...init, signal: controller.signal});
        if (attempt < retries && retryStatuses.includes(response.status)) {
          retry = true;
          try { await response.body?.cancel?.(); } catch {}
          error = new Error(`${label} returned HTTP ${response.status}.`);
          error.status = response.status;
        } else {
          return response;
        }
      } catch (caught) {
        if (outerSignal?.aborted) throw networkAbortError();
        if (timedOut) {
          error = new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
          error.name = "TimeoutError";
        } else {
          error = caught;
        }
        if (error?.name === "AbortError" || attempt >= retries) throw error;
        retry = true;
      } finally {
        if (timer) clearTimeout(timer);
        outerSignal?.removeEventListener?.("abort", forwardAbort);
      }

      if (!retry || attempt >= retries) throw error || new Error(`${label} failed.`);
      try { policy.onRetry?.({attempt: attempt + 1, error}); } catch {}
      await networkRetryDelay(attempt, outerSignal);
    }
    throw new Error(`${label} failed.`);
  }

  async function networkLoadImage(url, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs ?? 20000));
    const retries = Math.max(0, Math.floor(Number(options.retries ?? 0)));
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await new Promise((resolve, reject) => {
          const image = new Image();
          let settled = false;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            fn(value);
          };
          const timer = setTimeout(() => {
            try { image.src = ""; } catch {}
            const error = new Error(`${options.label || "Image"} timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
            error.name = "TimeoutError";
            finish(reject, error);
          }, timeoutMs);
          if (options.crossOrigin !== undefined) image.crossOrigin = options.crossOrigin;
          if (options.decoding) image.decoding = options.decoding;
          image.onload = () => finish(resolve, image);
          image.onerror = () => finish(reject, new Error(`${options.label || "Image"} failed to load.`));
          image.src = url;
        });
      } catch (error) {
        if (attempt >= retries) throw error;
        try { options.onRetry?.({attempt: attempt + 1, error}); } catch {}
        await networkRetryDelay(attempt);
      }
    }
    throw new Error(`${options.label || "Image"} failed to load.`);
  }

  window.FANetwork = {fetch: networkFetch, loadImage: networkLoadImage};

})();
