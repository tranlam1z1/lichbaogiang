import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { formatSavedAt } from '../state/sync.js';
import { PLAN_NAME_MAX, planLabel } from '../../shared/plan.js';

const UNNAMED = 'Hồ sơ chưa đặt tên';
/** Từ số hồ sơ này trở lên thì hiện ô tìm. */
const SEARCH_FROM = 8;

const fold = (s) => s.toLocaleLowerCase('vi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Nút "Hồ sơ" trên đầu trang: mỗi giáo viên / mỗi lớp một hồ sơ, bấm để mở lại hồ sơ đã soạn. */
export default function PlanSwitcher() {
  const { state, plan } = useApp();
  const [open, setOpen] = useState(false);
  // Lớp và trường đã có ngay bên cạnh trên đầu trang nên nút chỉ cần tên hồ sơ hoặc tên giáo viên.
  const title = plan.name || state.info.teacher?.trim() || planLabel(state.info) || UNNAMED;
  return (
    <>
      <button type="button" className="plan-btn" title="Đổi sang hồ sơ khác hoặc tạo hồ sơ mới" onClick={() => setOpen(true)}>
        <span className="plan-btn-label">Hồ sơ</span>
        <span className="plan-btn-name">{title}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && <PlanDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PlanDialog({ onClose }) {
  const { state, plan } = useApp();
  const [rows, setRows] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Thao tác đang làm dở trên một dòng: { id, mode: 'rename' | 'delete', value }.
  const [editing, setEditing] = useState(null);
  // Form tạo hồ sơ mới: { name, copy } hoặc null khi đang đóng.
  const [draft, setDraft] = useState(null);
  const closeRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setRows(await plan.list());
    } catch (e) {
      setError(e.message);
      setRows((r) => r ?? []);
    }
  }, [plan.list]);

  useEffect(() => {
    load();
    closeRef.current?.focus();
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  /** Chạy một thao tác; lỗi hiện ngay trong hộp thoại. Trả true nếu xong. */
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rename = () =>
    run(async () => {
      await plan.rename(editing.id, editing.value);
      setEditing(null);
      await load();
    });
  const remove = () =>
    run(async () => {
      await plan.remove(editing.id);
      setEditing(null);
      await load();
    });

  // Hồ sơ đang mở lấy thông tin ngay trên trang (có thể vừa sửa, chưa kịp lưu); hồ sơ chưa có trên tài khoản vẫn hiện ở đầu.
  const current = { id: plan.id, name: plan.name, label: planLabel(state.info), updatedAt: null };
  const list = (rows || []).map((r) => (r.id === plan.id ? { ...r, ...current, updatedAt: r.updatedAt } : r));
  if (rows && !list.some((r) => r.id === plan.id)) list.unshift(current);
  const q = fold(query.trim());
  const shown = q ? list.filter((r) => fold(`${r.name} ${r.label}`).includes(q)) : list;

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal plan-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="plan-dialog-title">Hồ sơ</h3>
        <p>
          Mỗi hồ sơ là một bộ kế hoạch riêng: thông tin lớp, thời khóa biểu, lịch tuần, báo giảng. Soạn cho nhiều giáo viên
          hoặc nhiều lớp thì tạo mỗi người một hồ sơ — khi cần sửa chỉ việc mở lại, không phải nhập lại.
        </p>

        {list.length >= SEARCH_FROM && (
          <input
            className="plan-search"
            type="search"
            value={query}
            placeholder="Tìm theo tên giáo viên, lớp, trường…"
            aria-label="Tìm hồ sơ"
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {!rows ? (
          <div className="empty" role="status">Đang tải danh sách hồ sơ…</div>
        ) : (
          <ul className="plan-list">
            {shown.map((r) => {
              const isOpen = r.id === plan.id;
              const edit = editing?.id === r.id ? editing : null;
              const saved = formatSavedAt(r.updatedAt);
              const sub = [r.name && r.label, saved && `Sửa lần cuối ${saved}`].filter(Boolean).join(' · ');
              return (
                <li key={r.id ?? 'new'} className={`plan-row${isOpen ? ' is-open' : ''}`}>
                  {edit?.mode === 'rename' ? (
                    <form className="plan-row-form" onSubmit={(e) => { e.preventDefault(); if (!busy) rename(); }}>
                      <input
                        autoFocus
                        value={edit.value}
                        maxLength={PLAN_NAME_MAX}
                        placeholder={r.label || 'Tên hồ sơ'}
                        aria-label="Tên hồ sơ"
                        onChange={(e) => setEditing({ ...edit, value: e.target.value })}
                      />
                      <button type="submit" className="btn btn-small btn-primary" disabled={busy}>Lưu</button>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => setEditing(null)}>Hủy</button>
                    </form>
                  ) : (
                    <>
                      <div className="plan-row-main">
                        <span className="plan-row-title">{r.name || r.label || UNNAMED}</span>
                        {sub && <span className="plan-row-sub">{sub}</span>}
                      </div>
                      {edit?.mode === 'delete' ? (
                        <div className="plan-row-actions">
                          <span className="plan-row-ask">Xóa hẳn hồ sơ này?</span>
                          <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={remove}>Xóa</button>
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => setEditing(null)}>Hủy</button>
                        </div>
                      ) : (
                        <div className="plan-row-actions">
                          {isOpen ? (
                            <span className="pill pill-ok">Đang mở</span>
                          ) : (
                            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => run(() => plan.open(r.id))}>
                              Mở
                            </button>
                          )}
                          {r.id != null && (
                            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setEditing({ id: r.id, mode: 'rename', value: r.name })}>
                              Đổi tên
                            </button>
                          )}
                          {!isOpen && (
                            <button type="button" className="btn btn-small btn-quiet" disabled={busy} onClick={() => setEditing({ id: r.id, mode: 'delete' })}>
                              Xóa
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
            {!shown.length && <li className="plan-row plan-row-empty">Không có hồ sơ nào khớp “{query.trim()}”.</li>}
          </ul>
        )}

        {draft && (
          <form
            className="plan-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) run(() => plan.create(draft));
            }}
          >
            <label className="field">
              <span>Tên hồ sơ mới (có thể để trống)</span>
              <input
                autoFocus
                value={draft.name}
                maxLength={PLAN_NAME_MAX}
                placeholder="VD: Cô Lan – 3A"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.copy} onChange={(e) => setDraft({ ...draft, copy: e.target.checked })} />
              <span>Sao chép từ hồ sơ đang mở (giữ trường, lịch tuần, thời khóa biểu… rồi sửa chỗ khác nhau)</span>
            </label>
            <p className="hint">Để trống tên thì hồ sơ hiện theo tên giáo viên, lớp và trường ở thẻ Thông tin lớp.</p>
          </form>
        )}

        {error && <div className="banner banner-alert" role="alert">{error}</div>}

        <div className="modal-actions">
          {draft ? (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => setDraft(null)}>Hủy</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => plan.create(draft))}>
                {busy ? 'Đang tạo…' : 'Tạo và mở'}
              </button>
            </>
          ) : (
            <>
              <button ref={closeRef} type="button" className="btn" disabled={busy} onClick={onClose}>Đóng</button>
              <button type="button" className="btn btn-primary" disabled={busy || !rows} onClick={() => { setError(null); setDraft({ name: '', copy: false }); }}>
                ＋ Hồ sơ mới
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
