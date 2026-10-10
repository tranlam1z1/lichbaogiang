import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import ppctData from '../data/ppct.json';
import defaults from '../data/defaults.json';
import { createInitialState, reducer, hydrate, toBackup } from './reducer.js';
import {
  createSyncer,
  oldestPlanId,
  payloadKey,
  pickPlan,
  planBoot,
  readCache,
  readLegacy,
  removeLegacy,
  resolveLegacy,
  syncPayload,
  writeCache,
} from './sync.js';
import { buildPpctIndex } from '../lib/ppct.js';
import { planLabel } from '../../shared/plan.js';
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

/**
 * Gửi một bản kế hoạch lên tài khoản: hồ sơ chưa có thì tạo, có rồi thì lưu có điều kiện theo version.
 * Trả { id, version, updatedAt }.
 */
async function pushPlan({ id, name }, data, baseVersion, opts) {
  if (id == null) return api.post('/plans', { data, name });
  const res = await api.put(`/plans/${id}`, { data, baseVersion }, opts);
  return { id, ...res };
}

/**
 * Id hồ sơ của một bản đang sửa. Bản đệm ghi từ trước khi tài khoản có nhiều hồ sơ không kèm id (nhưng đã có version):
 * đó là hồ sơ đầu tiên của tài khoản. Trả null nếu hồ sơ chưa có trên tài khoản.
 */
async function resolvePlanId(id, baseVersion) {
  if (id != null || baseVersion === 0) return id;
  return oldestPlanId((await api.get('/plans')).plans);
}

/** Đẩy bản đệm của tài khoản lên server khi không có AppProvider (VD: đăng xuất từ trang nạp điểm). */
export async function saveCachedPlan(userId) {
  const c = readCache(userId);
  if (!c?.dirty) return;
  const id = await resolvePlanId(c.planId, c.version);
  const res = await pushPlan({ id, name: c.name }, syncPayload(c.data), c.version);
  writeCache(userId, { ...c, planId: res.id, version: res.version, dirty: false, savedAt: res.updatedAt });
}

/** Kế hoạch gắn với tài khoản đang đăng nhập — đổi tài khoản thì tải lại từ đầu. */
export function AppProvider({ children }) {
  const { user } = useAuth();
  return <PlanLoader key={user.id} userId={user.id}>{children}</PlanLoader>;
}

/** Tài khoản chưa có hồ sơ nào: lần lưu đầu tiên sẽ tạo. */
const NO_PLAN = { id: null, name: '', data: null, version: 0, updatedAt: null };

/** Tải hồ sơ cần mở (server + bản đệm + dữ liệu cũ) rồi mới hiện ứng dụng. */
function PlanLoader({ userId, children }) {
  // boot: kết quả planBoot kèm planId / planName của hồ sơ đang mở; seq tăng mỗi lần đổi hồ sơ để dựng lại PlanProvider.
  const [boot, setBoot] = useState(null);
  const [reload, setReload] = useState(0);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBoot(null);
    (async () => {
      const saved = readCache(userId);
      let cache = saved;
      let server = null;
      try {
        const { plans } = await api.get('/plans');
        const pick = pickPlan({ plans, cache });
        const plan = pick.id == null ? NO_PLAN : await api.get(`/plans/${pick.id}`);
        cache = pick.cache;
        server = plan;
      } catch (e) {
        if (e.status === 401) return; // phiên hết hạn → AuthContext tự chuyển về trang đăng nhập
      }
      if (cancelled) return;
      const b = planBoot({ server, cache, legacy: readLegacy(), ui: saved?.data });
      if (b.dropLegacy) removeLegacy();
      // Không tải được → tiếp tục hồ sơ trong bản đệm. Hồ sơ chưa có trên tài khoản thì giữ tên đã đặt trên máy.
      const from = server?.id != null ? server : cache;
      setBoot({ ...b, planId: server ? server.id : cache?.planId ?? null, planName: from?.name ?? '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  // Chỉ xóa dữ liệu cũ sau khi người dùng đã chọn và bản được chọn đã nằm trong bản đệm của tài khoản.
  const chooseLegacy = (choice) => {
    const r = resolveLegacy(boot, choice);
    writeCache(userId, {
      planId: boot.planId,
      name: boot.planName,
      data: r.state,
      version: r.sync.version,
      dirty: r.sync.synced !== payloadKey(r.state),
      savedAt: r.sync.savedAt,
    });
    removeLegacy();
    setBoot({ ...r, planId: boot.planId, planName: boot.planName });
  };

  /** Đổi sang hồ sơ khác (đã tải về từ GET /api/plans/:id). ui: mục / tuần đang xem, giữ lại nếu được. */
  const switchPlan = useCallback((server, ui) => {
    const b = planBoot({ server, cache: null, legacy: null, ui });
    writeCache(userId, { planId: server.id, name: server.name, data: b.state, version: server.version, dirty: false, savedAt: server.updatedAt });
    setBoot({ ...b, planId: server.id, planName: server.name });
    setSeq((n) => n + 1);
  }, [userId]);

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
        <p className="choice-plan">{planLabel(boot.legacyState.info)}</p>
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
        <p className="choice-plan"><b>Trên tài khoản:</b> {planLabel(boot.serverState.info)}</p>
        <p className="choice-plan"><b>Trên máy này:</b> {planLabel(boot.legacyState.info)}</p>
        <p>
          <button type="button" className="link-btn" onClick={() => downloadPlanJson(boot.legacyState)}>Tải bản trên máy về (.json)</button>
        </p>
      </ChoiceDialog>
    );
  }

  return (
    <PlanProvider
      key={seq}
      userId={userId}
      planId={boot.planId}
      planName={boot.planName}
      initial={boot.state}
      syncInit={boot.sync}
      onSwitch={switchPlan}
    >
      {children}
    </PlanProvider>
  );
}

function PlanProvider({ userId, planId, planName, initial, syncInit, onSwitch, children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  // Hồ sơ đang mở. id = null cho tới khi lần lưu đầu tiên tạo hồ sơ trên tài khoản.
  const [plan, setPlan] = useState({ id: planId, name: planName });
  const planRef = useRef(plan);
  const updatePlan = useCallback((patch) => {
    planRef.current = { ...planRef.current, ...patch };
    setPlan(planRef.current);
  }, []);
  const [syncer] = useState(() =>
    createSyncer({
      init: syncInit,
      send: async (payload, baseVersion, opts) => {
        // Ghi nhận id trước khi lưu để nếu gặp xung đột vẫn biết tải bản nào về.
        const id = await resolvePlanId(planRef.current.id, baseVersion);
        if (id !== planRef.current.id) updatePlan({ id });
        const res = await pushPlan(planRef.current, JSON.parse(payload), baseVersion, opts);
        if (res.id !== planRef.current.id) updatePlan({ id: res.id });
        return res;
      },
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
    const ok = writeCache(userId, {
      planId: planRef.current.id,
      name: planRef.current.name,
      data: stateRef.current,
      version: s.version,
      dirty: syncer.isDirty(),
      savedAt: s.savedAt,
    });
    setCacheError(!ok);
  }, [syncer, userId]);

  // Chỉ phần dữ liệu cần đồng bộ mới kích hoạt lưu lên server (đổi mục / đổi tuần thì không).
  const key = useMemo(() => payloadKey(state), [state]);
  useEffect(() => {
    if (!stopped.current) syncer.update(key);
  }, [syncer, key]);

  // Bản đệm trên máy: ghi sau mỗi thay đổi (gom trong 300ms), khi trạng thái lưu đổi và khi hồ sơ được tạo / đổi tên.
  useEffect(() => {
    const t = setTimeout(writeNow, 300);
    return () => clearTimeout(t);
  }, [state, sync, plan, writeNow]);

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
      const res = await api.get(`/plans/${planRef.current.id}`);
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

  // Các hồ sơ của tài khoản: liệt kê, mở hồ sơ khác, tạo, đổi tên, xóa.
  const planActions = useMemo(() => {
    /** Lưu xong hồ sơ đang mở rồi mới rời đi; chưa lưu được thì báo lỗi, không đổi hồ sơ. */
    const saveCurrent = async () => {
      if (await syncer.flush()) return;
      const s = syncer.getState();
      throw new Error(
        s.status === 'conflict'
          ? 'Hồ sơ đang mở có phiên bản mới hơn trên tài khoản. Đóng hộp thoại này và chọn giữ bản nào trước đã.'
          : `Chưa lưu được hồ sơ đang mở: ${s.error || 'không kết nối được máy chủ.'}`,
      );
    };
    const open = async (id) => {
      await saveCurrent();
      const server = await api.get(`/plans/${id}`);
      stopped.current = true;
      syncer.dispose();
      onSwitch(server, stateRef.current);
    };
    return {
      list: async () => (await api.get('/plans')).plans,
      open,
      /** copy: true = sao chép từ hồ sơ đang mở; false = bắt đầu từ dữ liệu mặc định. Tạo xong thì mở luôn. */
      create: async ({ name, copy }) => {
        await saveCurrent();
        const data = syncPayload(copy ? stateRef.current : createInitialState());
        const created = await api.post('/plans', { name, data });
        await open(created.id);
      },
      rename: async (id, name) => {
        const res = await api.patch(`/plans/${id}`, { name });
        if (id === planRef.current.id) updatePlan({ name: res.name });
        return res;
      },
      remove: (id) => api.delete(`/plans/${id}`),
    };
  }, [syncer, onSwitch, updatePlan]);

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
      ppctIntegration: state.ppctIntegration[grade] || {},
      subjectSuggestions: suggestions,
      sync: { ...sync, cacheError, ...actions },
      plan: { ...plan, ...planActions },
    };
  }, [state, sync, cacheError, actions, plan, planActions]);

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
