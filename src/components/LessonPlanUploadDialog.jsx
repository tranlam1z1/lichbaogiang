import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { labelKey, MAX_PLAN_FILE_BYTES, validateFileName } from '../lib/lessonPlans.js';
import { ppctName } from '../lib/ppct.js';
import { SKIP_LOOKUP_SUBJECTS } from '../lib/text.js';
import FormDialog from './FormDialog.jsx';

const KIND_LABEL = { lesson: 'Tiết PPCT', week: 'Cả tuần' };

/** "Tiết PPCT 16" / "Cả tuần 4". */
export const planLabel = (p) => `${KIND_LABEL[p.kind]} ${p.num}`;

/** Lỗi của file chọn từ máy (đuôi, dung lượng), null nếu dùng được. */
export function fileError(name, size) {
  return validateFileName(name) || (size > MAX_PLAN_FILE_BYTES ? `«${name}» lớn hơn 20 MB.` : null);
}

/** Đối chiếu nhãn với PPCT để giáo viên kiểm tra: tên bài (theo tiết) hoặc số tiết trong tuần (cả tuần). */
export function planCheck(index, { subject, kind, num }, ppctOverrides) {
  if (!subject || !kind || !num) return { text: '' };
  if (kind === 'week') {
    const n = index.perWeek.get(subject)?.get(num) || 0;
    return n ? { text: `PPCT tuần ${num}: ${n} tiết` } : { text: `PPCT tuần ${num} không có tiết môn này`, warn: true };
  }
  for (const e of index.map.values()) {
    if (e.subject === subject && Number(e.num) === num) return { text: `Tuần ${e.week}: ${ppctName(e, ppctOverrides) || '(chưa có tên bài)'}` };
  }
  return { text: `PPCT không có tiết ${num} của môn này`, warn: true };
}

const toNum = (v) => {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Gắn nhãn cho các file vừa chọn (hoặc sửa nhãn một file trong kho, khi item có planId).
 * initial: [{ key, file?, planId?, fileName, size?, subject, kind, num }]
 */
export default function LessonPlanUploadDialog({ initial, plans, grade, busy, error, onSave, onCancel }) {
  const { index, ppctOverrides } = useApp();
  const [items, setItems] = useState(initial);
  const editing = !!initial[0]?.planId;
  const subjects = index.subjects.filter((s) => !SKIP_LOOKUP_SUBJECTS.has(s));
  const keyOf = (it) => labelKey({ grade, subject: it.subject, kind: it.kind, num: toNum(it.num) });
  const set = (i, patch) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const rows = items.map((it, i) => {
    const existing = plans.find((p) => p.id !== it.planId && labelKey(p) === keyOf(it));
    let err = it.file ? fileError(it.fileName, it.size) : null;
    if (!err && (!it.subject || !it.kind || !toNum(it.num))) err = 'Chọn đủ môn, loại và số.';
    const dup = !err && items.find((o, j) => j !== i && keyOf(o) === keyOf(it));
    if (dup) err = `Trùng nhãn với «${dup.fileName}» trong đợt này.`;
    if (!err && editing && existing) err = 'Đã có giáo án khác với nhãn này.';
    return { it, err, existing: !err && !editing ? existing : null };
  });
  const errCount = rows.filter((r) => r.err).length;

  return (
    <FormDialog
      open
      title={editing ? 'Sửa nhãn giáo án' : `Gắn nhãn ${items.length} file giáo án`}
      submitLabel={editing ? 'Lưu nhãn' : `Lưu ${items.length} giáo án`}
      busy={busy}
      error={error}
      submitDisabled={!items.length || errCount > 0}
      onSubmit={() => onSave(items.map((it) => ({ ...it, num: toNum(it.num) })))}
      onCancel={onCancel}
    >
      {items.length > 1 && (
        <label className="field field-inline">
          Đặt môn cho tất cả
          <select
            value=""
            onChange={(e) => e.target.value && setItems((list) => list.map((it) => ({ ...it, subject: e.target.value })))}
          >
            <option value="">Chọn môn…</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      <div className="table-scroll">
        <table className="data-table plan-label-table">
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Môn</th>
              <th scope="col">Gắn với</th>
              <th scope="col">Số</th>
              <th scope="col">Kiểm tra</th>
              {!editing && <th scope="col"><span className="visually-hidden">Bỏ</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, err, existing }, i) => {
              const check = planCheck(index, { subject: it.subject, kind: it.kind, num: toNum(it.num) }, ppctOverrides);
              const options = it.subject && !subjects.includes(it.subject) ? [it.subject, ...subjects] : subjects;
              return (
                <tr key={it.key}>
                  <td>
                    {it.fileName}
                    {err && <span className="cell-warn">{err}</span>}
                    {existing && <span className="hint">Đã có «{existing.fileName}», file mới sẽ thay file cũ.</span>}
                  </td>
                  <td>
                    <select aria-label={`Môn của ${it.fileName}`} value={it.subject} onChange={(e) => set(i, { subject: e.target.value })}>
                      <option value="">Chọn môn…</option>
                      {options.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Gắn ${it.fileName} với`} value={it.kind} onChange={(e) => set(i, { kind: e.target.value })}>
                      <option value="">Chọn…</option>
                      <option value="lesson">Tiết PPCT</option>
                      <option value="week">Cả tuần</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      aria-label={`${it.kind === 'week' ? 'Số tuần' : 'Số tiết PPCT'} của ${it.fileName}`}
                      value={it.num}
                      onChange={(e) => set(i, { num: e.target.value })}
                    />
                  </td>
                  <td className={check.warn ? 'cell-warn' : 'hint'}>{check.text}</td>
                  {!editing && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-small btn-quiet"
                        aria-label={`Bỏ ${it.fileName} khỏi đợt tải`}
                        onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint" role="status">
        {errCount > 0 ? `${errCount} dòng cần sửa trước khi lưu.` : 'Xem cột Kiểm tra để chắc nhãn đúng bài.'}
      </p>
    </FormDialog>
  );
}
