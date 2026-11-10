import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import ppctData from '../../data/ppct.json';
import { api } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout from './AdminLayout.jsx';

const GRADES = ['1', '2', '3', '4', '5'];
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Thay PPCT từng khối bằng file Excel; khối chưa thay dùng bản gốc đóng gói trong ứng dụng. */
export default function AdminPpct() {
  const [custom, setCustom] = useState(null); // { "3": { rowCount, updatedAt, updatedBy } }
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null); // khối đang xử lý
  const [confirm, setConfirm] = useState(null); // { kind: 'upload' | 'reset', grade, rows?, fileName? }
  const fileRef = useRef(null);
  const uploadGrade = useRef(null);

  const load = useCallback(() => {
    api
      .get('/admin/ppct')
      .then((d) => setCustom(Object.fromEntries(d.items.map((p) => [String(p.grade), p]))))
      .catch((e) => setMessage({ tone: 'error', text: e.message }));
  }, []);
  useEffect(load, [load]);

  const run = async (grade, fn, okText) => {
    setBusy(grade);
    setMessage(null);
    try {
      await fn();
      if (okText) setMessage({ tone: 'ok', text: okText });
    } catch (e) {
      setMessage({ tone: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const download = (grade) =>
    run(grade, async () => {
      const rows = custom[grade] ? (await api.get(`/admin/ppct/${grade}`)).rows : ppctData[grade];
      const { ppctToWorkbook } = await import('../../lib/ppctExcel.js');
      const buf = await ppctToWorkbook(rows, grade).xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: XLSX_TYPE }), `ppct-lop-${grade}${custom[grade] ? '' : '-ban-goc'}.xlsx`);
    });

  const pickFile = (grade) => {
    uploadGrade.current = grade;
    fileRef.current.value = '';
    fileRef.current.click();
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    const grade = uploadGrade.current;
    if (!file) return;
    run(grade, async () => {
      const { rowsFromXlsx } = await import('../../lib/ppctExcel.js');
      let rows;
      try {
        rows = await rowsFromXlsx(await file.arrayBuffer());
      } catch {
        throw new Error('Không đọc được file. Hãy chọn file Excel .xlsx (tải mẫu bằng nút "Tải Excel").');
      }
      if (!rows.length) throw new Error('File không có dòng PPCT nào.');
      setConfirm({ kind: 'upload', grade, rows, fileName: file.name });
    });
  };

  const doConfirm = () => {
    const { kind, grade, rows } = confirm;
    setConfirm(null);
    if (kind === 'upload') {
      run(
        grade,
        () =>
          api.put(`/admin/ppct/${grade}`, { rows }).then(load, (err) => {
            // Server đếm dòng dữ liệu, không tính dòng tiêu đề và dòng trống.
            if (/^Dòng \d+/.test(err.message)) err.message += ' (đếm từ dòng dữ liệu đầu tiên, không tính tiêu đề)';
            throw err;
          }),
        `Đã thay PPCT lớp ${grade} (${rows.length.toLocaleString('vi-VN')} dòng). Người dùng nhận bản mới khi mở lại trang.`,
      );
    } else {
      run(grade, () => api.delete(`/admin/ppct/${grade}`).then(load), `Lớp ${grade} đã trở về PPCT gốc.`);
    }
  };

  return (
    <AdminLayout title="Phân phối chương trình">
      <section className="card">
        <h2>PPCT theo khối</h2>
        <p className="card-text">
          Tải Excel của khối về, sửa rồi tải lên để thay toàn bộ PPCT khối đó cho mọi người dùng. File gồm 5 cột: Môn, Tuần, Tiết thứ trong
          tuần, Số tiết PPCT, Tên bài; dòng đầu là tiêu đề. Tên bài giáo viên đã tự sửa vẫn giữ theo tuần + môn + tiết.
        </p>
        {message && <p className={`export-msg is-${message.tone}`} role="status">{message.text}</p>}
        {!custom ? (
          !message && <p className="card-text">Đang tải…</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table admin-table">
              <thead>
                <tr>
                  <th>Khối</th>
                  <th>Đang dùng</th>
                  <th>Số dòng</th>
                  <th>Cập nhật</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {GRADES.map((g) => {
                  const c = custom[g];
                  return (
                    <tr key={g}>
                      <td>Lớp {g}</td>
                      <td>{c ? <span className="pill pill-edit">Bản admin tải lên</span> : <span className="pill pill-muted">Bản gốc</span>}</td>
                      <td>{(c ? c.rowCount : ppctData[g]?.length || 0).toLocaleString('vi-VN')}</td>
                      <td>{c ? `${formatDateTime(c.updatedAt)}${c.updatedBy ? ` · ${c.updatedBy.username}` : ''}` : '—'}</td>
                      <td>
                        <div className="button-row">
                          <button type="button" className="btn btn-small" disabled={busy != null} onClick={() => download(g)}>Tải Excel</button>
                          <button type="button" className="btn btn-small btn-primary" disabled={busy != null} onClick={() => pickFile(g)}>
                            {busy === g ? 'Đang xử lý…' : 'Tải lên'}
                          </button>
                          {c && (
                            <button type="button" className="btn btn-small" disabled={busy != null} onClick={() => setConfirm({ kind: 'reset', grade: g })}>
                              Về bản gốc
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={onFile} />
      </section>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'upload' ? `Thay PPCT lớp ${confirm.grade}?` : `Đưa lớp ${confirm?.grade} về PPCT gốc?`}
        message={
          confirm?.kind === 'upload'
            ? `Thay toàn bộ PPCT lớp ${confirm.grade} bằng ${confirm.rows.length.toLocaleString('vi-VN')} dòng từ file "${confirm.fileName}". Bản đang dùng sẽ bị thay thế — tải Excel về trước nếu cần giữ.`
            : 'Bản admin đã tải lên sẽ bị xóa, mọi người dùng quay về PPCT gốc của ứng dụng.'
        }
        confirmLabel={confirm?.kind === 'upload' ? 'Thay PPCT' : 'Về bản gốc'}
        danger
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </AdminLayout>
  );
}
