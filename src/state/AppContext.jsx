import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import ppctData from '../data/ppct.json';
import defaults from '../data/defaults.json';
import { reducer, hydrate, toBackup } from './reducer.js';
import {
  createSyncer,
  payloadKey,
  planBoot,
  readCache,
  readLegacy,
  removeLegacy,
  resolveLegacy,
  syncPayload,
  writeCache,
} from './sync.js';
import { buildPpctIndex } from '../lib/ppct.js';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ChoiceDialog from '../components/ChoiceDialog.jsx';

const AppContext = createContext(null);

// Chỉ mục PPCT dựng một lần cho mỗi khối.
const indexCache = new Map();
export function getPpctIndex(grade) {
  const g = String(grade);
  if (!indexCache.has(g)) indexCache.set(g, buildPpctIndex(ppctData[g] || []));
  return indexCache.get(g);
}

/** Tải một bản kế hoạch về máy dưới dạng file sao lưu .json. */
export async function downloadPlanJson(state, label = 'tren-may') {
  const { downloadJson } = await import('../lib/download.js');
  const d = new Date().toISOString().slice(0, 10);
  downloadJson(toBackup(state), `sao-luu-ke-hoach-giang-day_${state.info?.className || 'lop'}_${label}_${d}.json`);
}

/** Đẩy bản đệm của tài khoản lên server khi không có AppProvider (VD: đăng xuất từ trang nạp điểm). */
export async function saveCachedPlan(userId) {
  const c = readCache(userId);
  if (!c?.dirty) return;
  const res = await api.put('/plan', { data: syncPayload(c.data), baseVersion: c.version });
  writeCache(userId, { ...c, version: res.version, dirty: false, savedAt: res.updatedAt });
}

/** Kế hoạch gắn với tài khoản đang đăng nhập — đổi tài khoản thì tải lại từ đầu. */
export function AppProvider({ children }) {
  const { user } = useAuth();
  return <PlanLoader key={user.id} userId={user.id}>{children}</PlanLoader>;
}

const planLabel = (s) => [s.info?.className && `Lớp ${s.info.className}`, s.info?.school, s.info?.teacher].filter(Boolean).join(' · ');

/** Tải kế hoạch (server + bản đệm + dữ liệu cũ) rồi mới hiện ứng dụng. */
function PlanLoader({ userId, children }) {
  const [boot, setBoot] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBoot(null);
    (async () => {
      let server = null;
      try {
        server = await api.get('/plan');
      } catch (e) {
        if (e.status === 401) return; // phiên hết hạn → AuthContext tự chuyển về trang đăng nhập
      }
      if (cancelled) return;
      const b = planBoot({ server, cache: readCache(userId), legacy: readLegacy() });
      if (b.dropLegacy) removeLegacy();
      setBoot(b);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  // Chỉ xóa dữ liệu cũ sau khi người dùng đã chọn và bản được chọn đã nằm trong bản đệm của tài khoản.
  const chooseLegacy = (choice) => {
    const r = resolveLegacy(boot, choice);
    writeCache(userId, { data: r.state, version: r.sync.version, dirty: r.sync.synced !== payloadKey(r.state), savedAt: r.sync.savedAt });
    removeLegacy();
    setBoot(r);
  };

  if (!boot) return <div className="empty" role="status">Đang tải kế hoạch…</div>;

  if (boot.kind === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-card card" role="alert">
          <h1>Không tải được kế hoạch</h1>
          <p className="card-text">Không kết nối được máy chủ và máy này chưa có bản lưu tạm. Kiểm tra mạng rồi thử lại.</p>
          <button type="button" className="btn btn-primary" onClick={() => setReload((n) => n + 1)}>Thử lại</button>
        </div>
      </div>
    );
  }

  if (boot.kind === 'ask-upload') {
    return (
      <ChoiceDialog
        open
        title="Tìm thấy kế hoạch trên máy này"
        actions={[
          { label: 'Bắt đầu kế hoạch mới', onClick: () => chooseLegacy('fresh') },
          { label: 'Đưa lên tài khoản', tone: 'primary', onClick: () => chooseLegacy('local') },
        ]}
      >
        <p>Tìm thấy kế hoạch đã soạn trên máy này. Đưa lên tài khoản của bạn?</p>
        <p className="choice-plan">{planLabel(boot.legacyState)}</p>
        <p>
          Nếu bắt đầu kế hoạch mới, bản trên máy sẽ bị xóa.{' '}
          <button type="button" className="link-btn" onClick={() => downloadPlanJson(boot.legacyState)}>Tải bản trên máy về (.json)</button>
        </p>
      </ChoiceDialog>
    );
  }

  if (boot.kind === 'ask-pick') {
    return (
      <ChoiceDialog
        open
        title="Máy này có kế hoạch khác với bản trên tài khoản"
        actions={[
          { label: 'Dùng bản trên máy này', onClick: () => chooseLegacy('local') },
          { label: 'Dùng bản trên tài khoản', tone: 'primary', onClick: () => chooseLegacy('server') },
        ]}
      >
        <p>Chọn bản muốn giữ. Bản còn lại sẽ bị thay thế — tải về trước nếu cần giữ.</p>
        <p className="choice-plan"><b>Trên tài khoản:</b> {planLabel(boot.serverState)}</p>
        <p className="choice-plan"><b>Trên máy này:</b> {planLabel(boot.legacyState)}</p>
        <p>
          <button type="button" className="link-btn" onClick={() => downloadPlanJson(boot.legacyState)}>Tải bản trên máy về (.json)</button>
        </p>
      </ChoiceDialog>
    );
  }

  return (
    <PlanProvider userId={userId} initial={boot.state} syncInit={boot.sync}>
      {children}
    </PlanProvider>
  );
}

function PlanProvider({ userId, initial, syncInit, children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [syncer] = useState(() =>
    createSyncer({
      init: syncInit,
      send: (payload, baseVersion, opts) => api.put('/plan', { data: JSON.parse(payload), baseVersion }, opts),
    }),
  );
  const sync = useSyncExternalStore(syncer.subscribe, syncer.getState);
  const [cacheError, setCacheError] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const stopped = useRef(false);

  const writeNow = useCallback(() => {
    if (stopped.current) return;
    const s = syncer.getState();
    const ok = writeCache(userId, { data: stateRef.current, version: s.version, dirty: syncer.isDirty(), savedAt: s.savedAt });
    setCacheError(!ok);
  }, [syncer, userId]);

  // Chỉ phần dữ liệu cần đồng bộ mới kích hoạt lưu lên server (đổi mục / đổi tuần thì không).
  const key = useMemo(() => payloadKey(state), [state]);
  useEffect(() => {
    if (!stopped.current) syncer.update(key);
  }, [syncer, key]);

  // Bản đệm trên máy: ghi sau mỗi thay đổi (gom trong 300ms) và khi trạng thái lưu đổi.
  useEffect(() => {
    const t = setTimeout(writeNow, 300);
    return () => clearTimeout(t);
  }, [state, sync, writeNow]);

  useEffect(() => {
    const onOnline = () => syncer.retry();
    const onOffline = () => syncer.markOffline();
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      writeNow();
      syncer.flush({ keepalive: true });
    };
    const onBeforeUnload = (e) => {
      writeNow();
      if (!stopped.current && syncer.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [syncer, writeNow]);

  useEffect(() => () => syncer.dispose(), [syncer]);

  const actions = useMemo(() => ({
    retry: () => syncer.retry(),
    flush: () => syncer.flush(),
    isDirty: () => syncer.isDirty(),
    /** Trạng thái mới nhất (giá trị trong context có thể đã cũ khi đang chờ một request). */
    latest: () => syncer.getState(),
    /** Xung đột → giữ bản đang mở, ghi đè bản trên tài khoản. */
    keepLocal: () => syncer.keepLocal(),
    /** Xung đột → tải bản trên tài khoản về thay cho bản đang mở. */
    acceptServer: async () => {
      const res = await api.get('/plan');
      if (!res.data) return syncer.keepLocal();
      const synced = payloadKey(hydrate(res.data));
      dispatch({ type: 'RESTORE', data: res.data });
      syncer.acceptRemote({ version: res.version, updatedAt: res.updatedAt, synced });
      return true;
    },
    /** Đăng xuất: ghi bản đệm lần cuối rồi ngừng lưu (không ghi lại bản đệm vừa xóa). */
    stop: () => {
      writeNow();
      stopped.current = true;
      syncer.dispose();
    },
  }), [syncer, writeNow]);

  const value = useMemo(() => {
    const grade = state.info.grade;
    const index = getPpctIndex(grade);
    const suggestions = Array.from(new Set([...index.subjects, ...defaults.subjectCatalog])).sort((a, b) =>
      a.localeCompare(b, 'vi'),
    );
    return {
      state,
      dispatch,
      grade,
      index,
      ppctOverrides: state.ppctOverrides[grade] || {},
      equipmentDefaults: state.equipmentDefaults[grade] || {},
      ppctEquipment: state.ppctEquipment[grade] || {},
      subjectSuggestions: suggestions,
      sync: { ...sync, cacheError, ...actions },
    };
  }, [state, sync, cacheError, actions]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp phải dùng bên trong <AppProvider>');
  return ctx;
}

/** Trạng thái lưu của kế hoạch; null khi đang ở trang không có kế hoạch (nạp điểm, lịch sử…). */
export function usePlanSync() {
  return useContext(AppContext)?.sync ?? null;
}
