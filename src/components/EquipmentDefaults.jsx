import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { defaultEquipment, iterateTimetable, subjectEquipment } from '../lib/schedule.js';
import { SKIP_LOOKUP_SUBJECTS } from '../lib/text.js';
import EditableText from './EditableText.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';

const NONE = {};

/** Đồ dùng dạy học mặc định theo từng môn của một khối (có thể để trống). */
export default function EquipmentDefaults({ grade, index }) {
  const { state, dispatch, grade: classGrade } = useApp();
  const [confirm, setConfirm] = useState(false);
  const own = state.equipmentDefaults[grade] || NONE;
  const perLesson = state.ppctEquipment[grade] || NONE;
  const editedCount = Object.keys(own).length;
  const blankAll = !!state.equipmentBlank?.grades.includes(Number(grade));

  // Môn trong PPCT, môn đã đặt đồ dùng, và (khối đang dạy) môn trong thời khóa biểu.
  const subjects = useMemo(() => {
    const list = [...index.subjects, ...Object.keys(own)];
    if (String(grade) === String(classGrade)) list.push(...iterateTimetable(state.timetable).map((s) => s.subject));
    return [...new Set(list)].filter((s) => s && !SKIP_LOOKUP_SUBJECTS.has(s));
  }, [index, own, grade, classGrade, state.timetable]);

  const lessonCount = useMemo(() => {
    const m = new Map();
    for (const key of Object.keys(perLesson)) {
      const subject = key.split('|')[1];
      m.set(subject, (m.get(subject) || 0) + 1);
    }
    return m;
  }, [perLesson]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Đồ dùng dạy học theo môn · Lớp {grade}</h2>
        <span className="head-actions">
          <label className="check check-small">
            <input
              type="checkbox"
              checked={blankAll}
              onChange={(e) => dispatch({ type: 'SET_EQUIPMENT_BLANK', scope: 'grade', id: grade, on: e.target.checked })}
            />
            <span>Để trống đồ dùng mọi tuần</span>
          </label>
          {editedCount > 0 && (
            <>
              <span className="pill pill-edit">{editedCount} môn đã đặt</span>
              <button type="button" className="link-btn" onClick={() => setConfirm(true)}>Trả về mặc định có sẵn</button>
            </>
          )}
        </span>
      </div>
      {blankAll && (
        <p className="banner banner-note">
          Cột Đồ dùng dạy học đang để trống ở mọi tuần của lớp {grade}, cả trên thẻ Báo giảng lẫn khi tải file.
          Đồ dùng đã đặt bên dưới vẫn được giữ; bỏ dấu "Để trống đồ dùng mọi tuần" là hiện lại.
        </p>
      )}
      <div className="table-scroll">
        <table className={`data-table equip-table${blankAll ? ' is-off' : ''}`}>
          <thead>
            <tr><th>Môn</th><th>Đồ dùng dạy học</th><th className="num">Bài đặt riêng</th></tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const edited = own[s] != null;
              const builtIn = defaultEquipment(s);
              const value = subjectEquipment(s, own);
              return (
                <tr key={s}>
                  <td className="nowrap">{s}</td>
                  <td className={`cell-equip${edited ? ' is-edited' : ''}`}>
                    <EditableText
                      value={value}
                      placeholder="(để trống)"
                      ariaLabel={`Đồ dùng dạy học môn ${s}`}
                      onCommit={(v) => dispatch({ type: 'SET_SUBJECT_EQUIPMENT', grade, subject: s, value: v })}
                      onClear={value ? () => dispatch({ type: 'SET_SUBJECT_EQUIPMENT', grade, subject: s, value: '' }) : undefined}
                    />
                    {edited && (
                      <button
                        type="button"
                        className="revert"
                        title={`Mặc định có sẵn: ${builtIn || '(trống)'}`}
                        onClick={() => dispatch({ type: 'SET_SUBJECT_EQUIPMENT', grade, subject: s, value: null })}
                      >
                        ↺ Mặc định
                      </button>
                    )}
                  </td>
                  <td className="num">{lessonCount.get(s) || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Đồ dùng theo môn được ghi vào mọi tiết của môn đó; bấm ✕ (hoặc xóa hết chữ) để để trống. Muốn ghi riêng cho một bài, sửa ở cột
        Đồ dùng dạy học trong bảng Phân phối chương trình bên dưới. Ô đồ dùng đã sửa tay ở thẻ Báo giảng vẫn giữ nguyên.
      </p>

      <ConfirmDialog
        open={confirm}
        title={`Trả đồ dùng theo môn lớp ${grade} về mặc định?`}
        message={`${editedCount} môn đã đặt sẽ trở về mặc định có sẵn (Toán: Vở thực hành, môn khác: Tranh, ảnh, PP). Đồ dùng đặt riêng cho từng bài vẫn giữ.`}
        confirmLabel="Trả về mặc định"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => { dispatch({ type: 'RESET_SUBJECT_EQUIPMENT_ALL', grade }); setConfirm(false); }}
      />
    </section>
  );
}
