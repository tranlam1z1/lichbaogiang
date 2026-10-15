// Lưu kho giáo án trong IndexedDB của trình duyệt (API gốc, không thư viện).
import { labelKey } from './lessonPlans.js';

const DB_NAME = 'lich-bao-giang-giao-an';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const plans = r.result.createObjectStore('plans', { keyPath: 'id' });
        plans.createIndex('grade', 'grade');
        plans.createIndex('label', 'label', { unique: true });
        r.result.createObjectStore('choices', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        dbPromise = null;
        reject(r.error);
      };
    });
  }
  return dbPromise;
}

const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Chạy fn(store) trong một transaction; lỗi (kể cả QuotaExceededError) được ném nguyên vẹn. */
async function inTx(storeName, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const finished = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = () => reject(tx.error);
  });
  try {
    const out = await fn(tx.objectStore(storeName));
    await finished;
    return out;
  } catch (e) {
    finished.catch(() => {});
    try {
      tx.abort();
    } catch {
      // transaction đã kết thúc
    }
    throw e;
  }
}

const KIND_ORDER = { lesson: 0, week: 1 };

/** Giáo án của một khối, xếp theo môn → loại → số. */
export async function listPlans(grade) {
  const list = await inTx('plans', 'readonly', (s) => req(s.index('grade').getAll(grade)));
  return list.sort(
    (a, b) =>
      a.subject.localeCompare(b.subject, 'vi') || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.num - b.num,
  );
}

/** Lưu nhiều giáo án; file cùng nhãn với file đã có sẽ thay file cũ. */
export function savePlans(records) {
  return inTx('plans', 'readwrite', async (s) => {
    const saved = [];
    for (const rec of records) {
      const plan = {
        ...rec,
        id: rec.id || crypto.randomUUID(),
        label: labelKey(rec),
        addedAt: rec.addedAt || Date.now(),
      };
      const old = await req(s.index('label').get(plan.label));
      if (old && old.id !== plan.id) await req(s.delete(old.id));
      await req(s.put(plan));
      saved.push(plan);
    }
    return saved;
  });
}

/** Sửa nhãn (subject/kind/num) hoặc thay file (blob/fileName/size) của một giáo án. */
export function updatePlan(id, patch) {
  return inTx('plans', 'readwrite', async (s) => {
    const old = await req(s.get(id));
    if (!old) throw new Error('Không tìm thấy giáo án.');
    const plan = { ...old, ...patch, id };
    plan.label = labelKey(plan);
    const other = await req(s.index('label').get(plan.label));
    if (other && other.id !== id) throw new Error('Đã có giáo án khác với nhãn này.');
    await req(s.put(plan));
    return plan;
  });
}

export function deletePlan(id) {
  return inTx('plans', 'readwrite', (s) => req(s.delete(id)));
}

const choicePrefix = (grade, weekNum) => `${grade}|${weekNum}|`;

/** Lựa chọn nguồn (file cả tuần / theo tiết) của một tuần: {[môn]: 'week'|'lesson'}. */
export async function getChoices(grade, weekNum) {
  const prefix = choicePrefix(grade, weekNum);
  const list = await inTx('choices', 'readonly', (s) =>
    req(s.getAll(IDBKeyRange.bound(prefix, prefix + '￿'))),
  );
  return Object.fromEntries(list.map((c) => [c.key.slice(prefix.length), c.value]));
}

/** value null → xóa lựa chọn. */
export function setChoice(grade, weekNum, subject, value) {
  const key = choicePrefix(grade, weekNum) + subject;
  return inTx('choices', 'readwrite', (s) => req(value == null ? s.delete(key) : s.put({ key, value })));
}

/** Xin trình duyệt giữ dữ liệu lâu dài; trả false nếu không hỗ trợ. */
export async function requestPersist() {
  try {
    return (await globalThis.navigator?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** {usage, quota} hoặc null nếu không hỗ trợ. */
export async function storageEstimate() {
  try {
    return (await globalThis.navigator?.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}
