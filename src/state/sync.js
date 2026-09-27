// Đồng bộ kế hoạch với tài khoản trên server. Module thuần (không phụ thuộc React) — kiểm thử bằng node --test.
//  - Chọn phần dữ liệu cần đồng bộ (bỏ trường chỉ thuộc giao diện).
//  - Bộ nhớ đệm trên máy theo từng tài khoản + dữ liệu cũ trước khi có tài khoản.
//  - Quyết định dùng bản nào khi mở app (planBoot).
//  - Hàng đợi lưu: debounce, mỗi lúc một request, thử lại tăng dần khi mất mạng, xung đột 409 (createSyncer).

import { STORAGE_KEY, createInitialState, hydrate } from './reducer.js';

/** Trường chỉ thuộc giao diện: đổi mục / đổi tuần không cần lưu lên server. */
export const UI_KEYS = ['tab', 'selectedWeekId'];
export const SAVE_DEBOUNCE_MS = 1500;
export const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

/** Phần dữ liệu gửi lên server. */
export function syncPayload(state) {
  const data = { ...state };
  UI_KEYS.forEach((k) => delete data[k]);
  return data;
}

/** Chuỗi so sánh: hai state có cùng key thì không cần lưu lại. */
export function payloadKey(state) {
  return JSON.stringify(syncPayload(state));
}

/** Thời gian chờ trước lần thử lại thứ attempt (0, 1, 2…): 2s, 5s, 15s, 30s, 60s, 60s… */
export function retryDelay(attempt, delays = RETRY_DELAYS) {
  return delays[Math.min(Math.max(attempt, 0), delays.length - 1)];
}

// ---------- Bộ nhớ đệm trên máy ----------

export const LEGACY_KEY = STORAGE_KEY;
export const cacheKey = (userId) => `${STORAGE_KEY}/u/${userId}`;

const defaultStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Bản đệm của một tài khoản: { data, version, dirty, savedAt } hoặc null. */
export function readCache(userId, storage = defaultStorage()) {
  const c = readJson(storage, cacheKey(userId));
  if (!c || typeof c !== 'object' || !c.data) return null;
  return { data: c.data, version: Number(c.version) || 0, dirty: !!c.dirty, savedAt: c.savedAt ?? null };
}

/** Ghi bản đệm; trả false nếu trình duyệt không cho ghi (đầy bộ nhớ, chế độ riêng tư…). */
export function writeCache(userId, cache, storage = defaultStorage()) {
  try {
    storage.setItem(cacheKey(userId), JSON.stringify(cache));
    return true;
  } catch {
    return false;
  }
}

export function clearCache(userId, storage = defaultStorage()) {
  try {
    storage?.removeItem(cacheKey(userId));
  } catch {
    /* bỏ qua */
  }
}

/** Dữ liệu cũ lưu trong trình duyệt từ trước khi kế hoạch gắn với tài khoản. */
export function readLegacy(storage = defaultStorage()) {
  return readJson(storage, LEGACY_KEY);
}

export function removeLegacy(storage = defaultStorage()) {
  try {
    storage?.removeItem(LEGACY_KEY);
  } catch {
    /* bỏ qua */
  }
}

// ---------- Mở app: chọn bản dữ liệu ----------

/** Giữ mục đang mở / tuần đang chọn của lần trước (chỉ lưu trên máy). */
function withUi(state, ui) {
  if (!ui) return state;
  const next = { ...state };
  if (typeof ui.tab === 'string') next.tab = ui.tab;
  if (ui.selectedWeekId && next.calendar.some((w) => w.id === ui.selectedWeekId)) next.selectedWeekId = ui.selectedWeekId;
  return next;
}

/**
 * Quyết định dữ liệu dùng khi mở app.
 * @param {object} args
 * @param {{data, version, updatedAt} | null} args.server  kết quả GET /api/plan (null nếu không tải được)
 * @param {object | null} args.cache   bản đệm của tài khoản (readCache)
 * @param {object | null} args.legacy  dữ liệu cũ (readLegacy)
 * @returns
 *   { kind: 'ready', state, sync }            — dùng ngay; sync là giá trị khởi tạo cho createSyncer
 *   { kind: 'ask-upload', legacyState }       — server trống, máy có dữ liệu cũ → hỏi đưa lên
 *   { kind: 'ask-pick', legacyState, serverState, server } — cả hai đều có và khác nhau → hỏi giữ bản nào
 *   { kind: 'error' }                          — không tải được và máy không có bản đệm
 *   Kèm dropLegacy: true khi dữ liệu cũ không cần hỏi (trống hoặc trùng bản trên server).
 */
export function planBoot({ server, cache, legacy }) {
  const ui = cache?.data;
  const cacheState = cache ? hydrate(cache.data) : null;

  if (!server) {
    if (!cacheState) return { kind: 'error' };
    return {
      kind: 'ready',
      state: withUi(cacheState, ui),
      sync: { version: cache.version, synced: cache.dirty ? null : payloadKey(cacheState), savedAt: cache.savedAt, status: 'offline' },
    };
  }

  const serverState = server.data ? hydrate(server.data) : null;
  const serverSync = serverState
    ? { version: server.version, synced: payloadKey(serverState), savedAt: server.updatedAt }
    : { version: 0, synced: null, savedAt: null };
  let dropLegacy = false;

  // Dữ liệu cũ chỉ hỏi khi máy không còn thay đổi chưa lưu của tài khoản này (tránh chồng hai câu hỏi).
  if (legacy && !cache?.dirty) {
    const legacyState = hydrate(legacy);
    const key = payloadKey(legacyState);
    if (key === payloadKey(createInitialState())) dropLegacy = true; // chưa soạn gì
    else if (!serverState) return { kind: 'ask-upload', legacyState };
    else if (key !== payloadKey(serverState)) return { kind: 'ask-pick', legacyState, serverState, server };
    else dropLegacy = true;
  }

  if (cacheState && cache.dirty) {
    // Server trống (chưa có / đã xóa) → đưa bản trên máy lên.
    if (!serverState) return { kind: 'ready', dropLegacy, state: withUi(cacheState, ui), sync: { version: 0, synced: null, savedAt: null } };
    // Bản trên máy sửa từ đúng phiên bản đang có trên server → đẩy lên.
    if (cache.version === server.version) return { kind: 'ready', dropLegacy, state: withUi(cacheState, ui), sync: serverSync };
    // Server đã có bản mới hơn trong lúc máy này sửa offline → xung đột, để người dùng chọn.
    return {
      kind: 'ready',
      dropLegacy,
      state: withUi(cacheState, ui),
      sync: {
        version: cache.version,
        synced: serverSync.synced,
        savedAt: cache.savedAt,
        status: 'conflict',
        conflict: { version: server.version, updatedAt: server.updatedAt },
      },
    };
  }

  if (serverState) return { kind: 'ready', dropLegacy, state: withUi(serverState, ui), sync: serverSync };
  // Server trống nhưng máy có bản đệm đã đồng bộ trước đây → đưa lại lên.
  if (cacheState) return { kind: 'ready', dropLegacy, state: withUi(cacheState, ui), sync: { version: 0, synced: null, savedAt: null } };
  // Tài khoản mới: chưa lưu gì lên server cho tới khi người dùng sửa.
  const fresh = createInitialState();
  return { kind: 'ready', dropLegacy, state: fresh, sync: { version: 0, synced: payloadKey(fresh), savedAt: null } };
}

/** Trạng thái sau khi người dùng trả lời câu hỏi về dữ liệu cũ. choice: 'local' | 'server' | 'fresh'. */
export function resolveLegacy(boot, choice) {
  if (choice === 'local') {
    const version = boot.server?.version ?? 0;
    return { kind: 'ready', state: boot.legacyState, sync: { version, synced: null, savedAt: null } };
  }
  if (choice === 'server') {
    return {
      kind: 'ready',
      state: boot.serverState,
      sync: { version: boot.server.version, synced: payloadKey(boot.serverState), savedAt: boot.server.updatedAt },
    };
  }
  const fresh = createInitialState();
  return { kind: 'ready', state: fresh, sync: { version: 0, synced: payloadKey(fresh), savedAt: null } };
}

// ---------- Hàng đợi lưu ----------

const isNetworkError = (err) => err?.code === 'NETWORK' || err?.status === 0;
const isRetryable = (err) => isNetworkError(err) || err?.status >= 500 || err?.status === 429;

/**
 * Bộ lưu tự động.
 * @param {object} opts
 * @param {(payload: string, baseVersion: number, opts: {keepalive?: boolean}) => Promise<{version, updatedAt}>} opts.send
 * @param {object} [opts.init]    { version, synced, savedAt, status?, conflict? } — từ planBoot
 * @param {object} [opts.timers]  { setTimeout, clearTimeout } — thay được khi kiểm thử
 *
 * status: 'saved' | 'pending' (chờ debounce) | 'saving' | 'offline' | 'error' | 'conflict'
 */
export function createSyncer({ send, init = {}, debounceMs = SAVE_DEBOUNCE_MS, delays = RETRY_DELAYS, timers = globalThis }) {
  const s = {
    status: init.status || 'saved',
    version: init.version ?? 0,
    synced: init.synced ?? null,
    current: init.synced ?? null,
    savedAt: init.savedAt ?? null,
    error: null,
    conflict: init.conflict ?? null,
    attempt: 0,
    inFlight: null,
  };
  let debounceTimer = null;
  let retryTimer = null;
  const listeners = new Set();

  const isDirty = () => s.current !== null && s.current !== s.synced;
  const snapshot = () => ({
    status: s.status,
    version: s.version,
    savedAt: s.savedAt,
    error: s.error,
    conflict: s.conflict,
    dirty: isDirty() || !!s.inFlight,
  });
  let snap = snapshot();
  const emit = () => {
    snap = snapshot();
    listeners.forEach((fn) => fn(snap));
  };
  const clearDebounce = () => {
    if (debounceTimer) timers.clearTimeout(debounceTimer);
    debounceTimer = null;
  };
  const clearRetry = () => {
    if (retryTimer) timers.clearTimeout(retryTimer);
    retryTimer = null;
  };

  function scheduleRetry() {
    clearRetry();
    const delay = retryDelay(s.attempt, delays);
    s.attempt += 1;
    retryTimer = timers.setTimeout(() => {
      retryTimer = null;
      flush();
    }, delay);
  }

  async function run(opts) {
    const payload = s.current;
    if (s.status !== 'offline') s.status = 'saving';
    emit();
    try {
      const res = await send(payload, s.version, opts);
      s.version = res.version;
      s.synced = payload;
      s.savedAt = res.updatedAt ?? null;
      s.error = null;
      s.attempt = 0;
      s.status = isDirty() ? 'pending' : 'saved';
    } catch (err) {
      if (err?.status === 409) {
        s.status = 'conflict';
        s.conflict = { version: err.details?.version ?? 0, updatedAt: err.details?.updatedAt ?? null };
        s.error = null;
      } else {
        s.status = isNetworkError(err) ? 'offline' : 'error';
        s.error = err?.message || 'Lỗi không xác định.';
        if (isRetryable(err)) scheduleRetry();
      }
    }
  }

  /** Gửi ngay phần chưa lưu (chờ request đang chạy xong trước). Trả true nếu đã lưu hết. */
  async function flush(opts = {}) {
    clearDebounce();
    while (s.inFlight) await s.inFlight;
    if (s.status === 'conflict') return false;
    if (!isDirty()) return true;
    clearRetry();
    s.inFlight = run(opts);
    await s.inFlight;
    s.inFlight = null;
    emit();
    // Có thay đổi mới trong lúc đang lưu và không còn hẹn giờ nào → lưu tiếp bằng version mới.
    if (s.status === 'pending' && !debounceTimer) flush();
    return !isDirty() && s.status !== 'conflict';
  }

  return {
    /** Gọi mỗi khi state đổi, với payloadKey(state). */
    update(current) {
      s.current = current;
      if (s.status === 'conflict') return emit();
      if (!isDirty()) {
        clearDebounce();
        if (!s.inFlight && (s.status === 'pending' || s.status === 'error')) s.status = 'saved';
        return emit();
      }
      // Đang chờ thử lại (mất mạng): lần thử sau sẽ gửi bản mới nhất.
      if (retryTimer) return emit();
      if (!s.inFlight && s.status !== 'offline') s.status = 'pending';
      clearDebounce();
      debounceTimer = timers.setTimeout(() => {
        debounceTimer = null;
        flush();
      }, debounceMs);
      return emit();
    },
    flush,
    /** Thử lại ngay (bấm "Thử lại" hoặc có mạng trở lại). */
    retry() {
      clearRetry();
      s.attempt = 0;
      if (s.status === 'conflict') return Promise.resolve(false);
      if (!isDirty() && !s.inFlight) {
        if (s.status === 'offline' || s.status === 'error') s.status = 'saved';
        emit();
        return Promise.resolve(true);
      }
      return flush();
    },
    /** Xung đột → giữ bản đang mở: ghi đè lên phiên bản mới nhất của server. */
    keepLocal() {
      if (!s.conflict) return Promise.resolve(false);
      s.version = s.conflict.version;
      s.conflict = null;
      s.status = 'pending';
      s.synced = null; // buộc gửi lại cả khi nội dung trùng
      return flush();
    },
    /** Xung đột → dùng bản trên server (đã tải về và RESTORE). synced = payloadKey(state sau RESTORE). */
    acceptRemote({ version, updatedAt, synced }) {
      clearDebounce();
      clearRetry();
      Object.assign(s, { version, savedAt: updatedAt, synced, current: synced, conflict: null, error: null, attempt: 0, status: 'saved' });
      emit();
    },
    /** Báo mất mạng khi trình duyệt biết trước (sự kiện offline). */
    markOffline() {
      if (s.status === 'conflict') return;
      s.status = 'offline';
      emit();
    },
    isDirty: () => isDirty() || !!s.inFlight,
    getState: () => snap,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      clearDebounce();
      clearRetry();
      listeners.clear();
    },
  };
}

// ---------- Hiển thị ----------

const pad = (n) => String(n).padStart(2, '0');

/** "14:32" nếu cùng ngày với now; khác ngày thì "14:32 ngày 25/09" (khác năm thêm năm). */
export function formatSavedAt(value, now = new Date()) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return time;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${time} ngày ${d.getFullYear() === now.getFullYear() ? date : `${date}/${d.getFullYear()}`}`;
}
