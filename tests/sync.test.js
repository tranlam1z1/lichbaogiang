import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, reducer } from '../src/state/reducer.js';
import {
  LEGACY_KEY,
  cacheKey,
  clearCache,
  createSyncer,
  payloadKey,
  planBoot,
  readCache,
  resolveLegacy,
  retryDelay,
  syncPayload,
  writeCache,
} from '../src/state/sync.js';

/** Bộ hẹn giờ giả: chỉ chạy khi gọi tick(ms). */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const jobs = new Map();
  return {
    setTimeout(fn, ms) {
      seq += 1;
      jobs.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout(id) {
      jobs.delete(id);
    },
    async tick(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...jobs.entries()].filter(([, j]) => j.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        jobs.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        await flushMicro();
      }
      now = until;
      await flushMicro();
    },
    pending: () => [...jobs.values()].map((j) => j.at - now).sort((a, b) => a - b),
  };
}
const flushMicro = () => new Promise((r) => setImmediate(r));

/** Server giả: ghi nhận các lần gửi, trả kết quả theo hàng đợi. */
function fakeSend(results = []) {
  const calls = [];
  let version = 0;
  const send = async (payload, baseVersion, opts) => {
    calls.push({ payload, baseVersion, opts });
    const r = results.shift();
    if (r instanceof Error || (r && r.status)) throw r;
    version = baseVersion + 1;
    return { version, updatedAt: `t${version}` };
  };
  return { send, calls };
}
const netErr = () => Object.assign(new Error('mất mạng'), { status: 0, code: 'NETWORK' });

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

// ---------- Phần dữ liệu cần đồng bộ ----------

test('đổi mục / đổi tuần không làm đổi phần cần đồng bộ; sửa dữ liệu thì có', () => {
  const s0 = createInitialState();
  const k0 = payloadKey(s0);
  assert.equal(payloadKey(reducer(s0, { type: 'SET_TAB', tab: 'ppct' })), k0);
  assert.equal(payloadKey(reducer(s0, { type: 'SELECT_WEEK', id: s0.calendar[3].id })), k0);
  assert.notEqual(payloadKey(reducer(s0, { type: 'SET_INFO', patch: { className: '4B' } })), k0);
  const p = syncPayload(s0);
  assert.equal(p.tab, undefined);
  assert.equal(p.selectedWeekId, undefined);
  assert.ok(p.calendar && p.timetable && p.info);
});

test('thời gian chờ thử lại tăng dần rồi giữ ở mức cao nhất', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((i) => retryDelay(i)), [2000, 5000, 15000, 30000, 60000, 60000, 60000]);
});

test('bản đệm tách riêng theo tài khoản', () => {
  const st = memoryStorage();
  writeCache(1, { data: { a: 1 }, version: 3, dirty: true, savedAt: null }, st);
  writeCache(2, { data: { b: 2 }, version: 1, dirty: false, savedAt: null }, st);
  assert.deepEqual(readCache(1, st).data, { a: 1 });
  assert.equal(readCache(1, st).dirty, true);
  assert.deepEqual(readCache(2, st).data, { b: 2 });
  clearCache(1, st);
  assert.equal(readCache(1, st), null);
  assert.ok(st.has(cacheKey(2)));
  assert.notEqual(cacheKey(1), LEGACY_KEY);
});

// ---------- Hàng đợi lưu ----------

test('gom thay đổi trong 1,5 giây rồi gửi một lần với version mới nhất', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend();
  const sy = createSyncer({ send, timers, init: { version: 0, synced: 'A' } });
  sy.update('A');
  assert.equal(sy.getState().status, 'saved');
  sy.update('B');
  await timers.tick(1000);
  sy.update('C');
  assert.equal(sy.getState().status, 'pending');
  await timers.tick(1499);
  assert.equal(calls.length, 0);
  await timers.tick(1);
  assert.deepEqual(calls.map((c) => [c.payload, c.baseVersion]), [['C', 0]]);
  assert.equal(sy.getState().status, 'saved');
  assert.equal(sy.getState().version, 1);
  sy.update('D');
  await timers.tick(1500);
  assert.deepEqual(calls.at(-1).baseVersion, 1);
  assert.equal(sy.isDirty(), false);
});

test('không có thay đổi dữ liệu thì không gửi', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend();
  const sy = createSyncer({ send, timers, init: { version: 2, synced: 'A' } });
  sy.update('A');
  sy.update('B');
  sy.update('A'); // sửa rồi hoàn tác
  await timers.tick(5000);
  assert.equal(calls.length, 0);
  assert.equal(sy.getState().status, 'saved');
});

test('chỉ một request tại một thời điểm; thay đổi trong lúc lưu được lưu tiếp bằng version mới', async () => {
  const timers = fakeTimers();
  const calls = [];
  let release;
  const send = (payload, baseVersion) => {
    calls.push([payload, baseVersion]);
    if (calls.length === 1) return new Promise((r) => { release = () => r({ version: baseVersion + 1, updatedAt: 'x' }); });
    return Promise.resolve({ version: baseVersion + 1, updatedAt: 'y' });
  };
  const sy = createSyncer({ send, timers, init: { version: 5, synced: 'A' } });
  sy.update('B');
  await timers.tick(1500);
  assert.equal(sy.getState().status, 'saving');
  sy.update('C');
  await timers.tick(3000); // debounce hết hạn nhưng request đầu chưa xong → chưa gửi thêm
  assert.equal(calls.length, 1);
  release();
  await timers.tick(0);
  assert.deepEqual(calls, [['B', 5], ['C', 6]]);
  assert.equal(sy.getState().status, 'saved');
  assert.equal(sy.getState().version, 7);
});

test('mất mạng: báo offline, thử lại 2s → 5s → 15s, gửi bản mới nhất', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend([netErr(), netErr(), netErr()]);
  const sy = createSyncer({ send, timers, init: { version: 1, synced: 'A' } });
  sy.update('B');
  await timers.tick(1500);
  assert.equal(sy.getState().status, 'offline');
  assert.deepEqual(timers.pending(), [2000]);
  sy.update('C'); // sửa tiếp khi đang mất mạng
  await timers.tick(2000);
  assert.deepEqual(timers.pending(), [5000]);
  await timers.tick(5000);
  assert.deepEqual(timers.pending(), [15000]);
  await timers.tick(15000);
  assert.deepEqual(calls.map((c) => c.payload), ['B', 'C', 'C', 'C']);
  assert.equal(sy.getState().status, 'saved');
  assert.equal(sy.getState().version, 2);
});

test('có mạng trở lại (retry) thì gửi ngay, không chờ hết thời gian', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend([netErr()]);
  const sy = createSyncer({ send, timers, init: { version: 1, synced: 'A' } });
  sy.update('B');
  await timers.tick(1500);
  assert.equal(sy.getState().status, 'offline');
  await sy.retry();
  assert.equal(calls.length, 2);
  assert.equal(sy.getState().status, 'saved');
  assert.deepEqual(timers.pending(), []);
});

test('lỗi 4xx (dữ liệu quá lớn) không tự thử lại; lỗi 5xx có thử lại', async () => {
  const timers = fakeTimers();
  const big = Object.assign(new Error('Kế hoạch quá lớn'), { status: 413 });
  const { send } = fakeSend([big]);
  const sy = createSyncer({ send, timers, init: { version: 1, synced: 'A' } });
  sy.update('B');
  await timers.tick(1500);
  assert.equal(sy.getState().status, 'error');
  assert.equal(sy.getState().error, 'Kế hoạch quá lớn');
  assert.deepEqual(timers.pending(), []);

  const t2 = fakeTimers();
  const sy2 = createSyncer({ send: fakeSend([Object.assign(new Error('x'), { status: 503 })]).send, timers: t2, init: { version: 1, synced: 'A' } });
  sy2.update('B');
  await t2.tick(1500);
  assert.equal(sy2.getState().status, 'error');
  assert.deepEqual(t2.pending(), [2000]);
});

test('xung đột 409: dừng lưu; giữ bản đang mở thì ghi đè bằng version của server', async () => {
  const timers = fakeTimers();
  const conflict = Object.assign(new Error('xung đột'), { status: 409, details: { version: 9, updatedAt: '2026-09-27T07:32:00Z' } });
  const { send, calls } = fakeSend([conflict]);
  const sy = createSyncer({ send, timers, init: { version: 3, synced: 'A' } });
  sy.update('B');
  await timers.tick(1500);
  assert.equal(sy.getState().status, 'conflict');
  assert.equal(sy.getState().conflict.version, 9);
  sy.update('C');
  await timers.tick(10000);
  assert.equal(calls.length, 1, 'không tự gửi khi đang xung đột');
  assert.equal(await sy.keepLocal(), true);
  assert.deepEqual(calls.at(-1).payload, 'C');
  assert.deepEqual(calls.at(-1).baseVersion, 9);
  assert.equal(sy.getState().version, 10);
  assert.equal(sy.getState().status, 'saved');
});

test('xung đột: dùng bản trên server thì không gửi lại', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend();
  const sy = createSyncer({ send, timers, init: { version: 3, synced: 'A', status: 'conflict', conflict: { version: 4, updatedAt: null } } });
  sy.update('B');
  sy.acceptRemote({ version: 4, updatedAt: 't', synced: 'S' });
  sy.update('S');
  await timers.tick(5000);
  assert.equal(calls.length, 0);
  assert.equal(sy.getState().status, 'saved');
  assert.equal(sy.getState().version, 4);
});

test('flush (ẩn trang / đăng xuất) gửi ngay kèm keepalive', async () => {
  const timers = fakeTimers();
  const { send, calls } = fakeSend();
  const sy = createSyncer({ send, timers, init: { version: 0, synced: 'A' } });
  sy.update('B');
  assert.equal(sy.isDirty(), true);
  assert.equal(await sy.flush({ keepalive: true }), true);
  assert.equal(calls[0].opts.keepalive, true);
  assert.equal(sy.isDirty(), false);
  assert.deepEqual(timers.pending(), []);
});

// ---------- Mở app ----------

const s0 = createInitialState();
const edited = (name) => reducer(s0, { type: 'SET_INFO', patch: { className: name } });
const server = (state, version) => ({ data: syncPayload(state), version, updatedAt: `u${version}` });

test('mở app: có dữ liệu trên server → dùng bản server, không cần lưu', () => {
  const b = planBoot({ server: server(edited('4B'), 3), cache: null, legacy: null });
  assert.equal(b.kind, 'ready');
  assert.equal(b.state.info.className, '4B');
  assert.equal(b.sync.version, 3);
  assert.equal(b.sync.synced, payloadKey(b.state));
});

test('mở app: tài khoản mới, máy trống → bản mặc định, chưa gửi gì', () => {
  const b = planBoot({ server: { data: null, version: 0, updatedAt: null }, cache: null, legacy: null });
  assert.equal(b.kind, 'ready');
  assert.equal(b.sync.synced, payloadKey(b.state));
});

test('mở app: mất mạng → dùng bản đệm, báo offline; không có bản đệm → lỗi', () => {
  const cache = { data: { ...edited('4C'), tab: 'ppct' }, version: 2, dirty: true, savedAt: null };
  const b = planBoot({ server: null, cache, legacy: null });
  assert.equal(b.kind, 'ready');
  assert.equal(b.state.info.className, '4C');
  assert.equal(b.state.tab, 'ppct');
  assert.equal(b.sync.status, 'offline');
  assert.equal(b.sync.synced, null, 'còn thay đổi chưa lưu');
  assert.equal(planBoot({ server: null, cache: null, legacy: null }).kind, 'error');
});

test('mở app: bản đệm chưa lưu, cùng version với server → đẩy lên; khác version → xung đột', () => {
  const cache = { data: edited('MAY'), version: 3, dirty: true, savedAt: null };
  const same = planBoot({ server: server(edited('SERVER'), 3), cache, legacy: null });
  assert.equal(same.state.info.className, 'MAY');
  assert.notEqual(same.sync.synced, payloadKey(same.state));
  assert.equal(same.sync.version, 3);

  const newer = planBoot({ server: server(edited('SERVER'), 5), cache, legacy: null });
  assert.equal(newer.state.info.className, 'MAY', 'không tự ghi đè bản trên máy');
  assert.equal(newer.sync.status, 'conflict');
  assert.equal(newer.sync.conflict.version, 5);
});

test('mở app: bản đệm đã lưu nhưng server có bản mới hơn → dùng bản server', () => {
  const cache = { data: edited('CU'), version: 2, dirty: false, savedAt: null };
  const b = planBoot({ server: server(edited('MOI'), 4), cache, legacy: null });
  assert.equal(b.state.info.className, 'MOI');
});

test('dữ liệu cũ: server trống → hỏi đưa lên; chọn đưa lên thì lưu với baseVersion 0', () => {
  const b = planBoot({ server: { data: null, version: 0, updatedAt: null }, cache: null, legacy: edited('CU') });
  assert.equal(b.kind, 'ask-upload');
  const up = resolveLegacy(b, 'local');
  assert.equal(up.state.info.className, 'CU');
  assert.equal(up.sync.version, 0);
  assert.equal(up.sync.synced, null);
  const fresh = resolveLegacy(b, 'fresh');
  assert.equal(fresh.state.info.className, s0.info.className);
});

test('dữ liệu cũ: server có bản khác → hỏi giữ bản nào', () => {
  const b = planBoot({ server: server(edited('SERVER'), 7), cache: null, legacy: edited('MAY') });
  assert.equal(b.kind, 'ask-pick');
  const local = resolveLegacy(b, 'local');
  assert.equal(local.state.info.className, 'MAY');
  assert.equal(local.sync.version, 7);
  const remote = resolveLegacy(b, 'server');
  assert.equal(remote.state.info.className, 'SERVER');
  assert.equal(remote.sync.synced, payloadKey(remote.state));
});

test('dữ liệu cũ trùng server hoặc chưa soạn gì → không hỏi, bỏ key cũ', () => {
  const same = planBoot({ server: server(edited('X'), 2), cache: null, legacy: { ...edited('X'), tab: 'ppct' } });
  assert.equal(same.kind, 'ready');
  assert.equal(same.dropLegacy, true);
  const empty = planBoot({ server: { data: null, version: 0, updatedAt: null }, cache: null, legacy: createInitialState() });
  assert.equal(empty.kind, 'ready');
  assert.equal(empty.dropLegacy, true);
});

test('giờ lưu: trong ngày chỉ hiện giờ, khác ngày thêm ngày, khác năm thêm năm', async () => {
  const { formatSavedAt } = await import('../src/state/sync.js');
  const now = new Date(2026, 8, 27, 16, 0);
  assert.equal(formatSavedAt(new Date(2026, 8, 27, 14, 32), now), '14:32');
  assert.equal(formatSavedAt(new Date(2026, 8, 25, 9, 5), now), '09:05 ngày 25/09');
  assert.equal(formatSavedAt(new Date(2025, 11, 31, 23, 59), now), '23:59 ngày 31/12/2025');
  assert.equal(formatSavedAt(null, now), '');
});
