import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatVnd } from '../../../shared/validation.js';
import { exportCost } from '../../../shared/pricing.js';
import { formatDateTime } from '../account/AccountLayout.jsx';
import AdminLayout from './AdminLayout.jsx';

const ORDER = ['freeExportsForNewUser', 'pointsForNewUser', 'pointsPerExport', 'pointsPerExtraWeek', 'topupUnitVnd', 'pointsPerUnit'];

/** Sửa số lượt miễn phí, điểm mỗi lần xuất, tỷ lệ quy đổi — lưu trong database. */
export default function AdminSettings() {
  const { refreshSettings } = useAuth();
  const [defs, setDefs] = useState(null);
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState({});
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = (d) => {
    setDefs(d.defs);
    const v = Object.fromEntries(ORDER.map((k) => [k, String(d.values[k])]));
    setValues(v);
    setSaved(v);
    setLastUpdatedAt(d.lastUpdatedAt);
  };

  useEffect(() => {
    api.get('/admin/settings').then(apply).catch((e) => setMessage({ tone: 'error', text: e.message }));
  }, []);

  const dirty = ORDER.some((k) => values[k] !== saved[k]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      apply(await api.put('/admin/settings', { values: Object.fromEntries(ORDER.map((k) => [k, Number(values[k])])) }));
      setMessage({ tone: 'ok', text: 'Đã lưu cài đặt. Thay đổi có hiệu lực ngay cho mọi người dùng.' });
      refreshSettings().catch(() => {});
    } catch (err) {
      setErrors(err.errors || {});
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const n = (k) => Number(values[k]) || 0;
  const cost = (weeks) => exportCost(weeks, { pointsPerExport: n('pointsPerExport'), pointsPerExtraWeek: n('pointsPerExtraWeek') });

  return (
    <AdminLayout title="Cài đặt">
      <section className="card">
        <h2>Lượt xuất file và điểm</h2>
        {!defs ? (
          <p className="card-text">{message?.text || 'Đang tải…'}</p>
        ) : (
          <form className="settings-form" onSubmit={save} noValidate>
            {ORDER.map((k) => (
              <label key={k} className="field">
                <span>{defs[k].label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={defs[k].min}
                  max={defs[k].max}
                  step="1"
                  value={values[k] ?? ''}
                  aria-invalid={errors[k] ? 'true' : undefined}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
                {errors[k] ? (
                  <small className="field-error">{errors[k]}</small>
                ) : (
                  <small className="field-hint">Mặc định: {defs[k].default.toLocaleString('vi-VN')}</small>
                )}
              </label>
            ))}

            <div className="settings-preview" aria-live="polite">
              <strong>Người dùng sẽ thấy:</strong>
              <ul>
                <li>
                  Tài khoản mới được <strong>{n('freeExportsForNewUser')}</strong> lượt xuất miễn phí
                  {n('pointsForNewUser') > 0 && <> và <strong>{n('pointsForNewUser')}</strong> điểm</>} (tài khoản đã có không bị ảnh hưởng).
                </li>
                <li>
                  Lượt miễn phí chỉ dùng khi tải 1 tuần. Điểm trừ theo số tuần: 1 tuần <strong>{cost(1)}</strong> điểm,
                  18 tuần (một học kì) <strong>{cost(18)}</strong> điểm, 35 tuần (cả năm) <strong>{cost(35)}</strong> điểm.
                </li>
                <li>
                  Nạp <strong>{formatVnd(n('topupUnitVnd'))}</strong> = <strong>{n('pointsPerUnit')}</strong> điểm; nạp tối thiểu{' '}
                  {formatVnd(n('topupUnitVnd'))}, là bội số của {formatVnd(n('topupUnitVnd'))}.
                  {n('pointsPerExport') > 0 && n('pointsPerUnit') > 0 && (
                    <> Tải 1 tuần tương đương khoảng {formatVnd(Math.round((n('topupUnitVnd') * cost(1)) / n('pointsPerUnit')))}, cả năm khoảng {formatVnd(Math.round((n('topupUnitVnd') * cost(35)) / n('pointsPerUnit')))}.</>
                  )}
                </li>
                <li>Yêu cầu nạp đã tạo trước đó giữ nguyên số điểm đã chốt lúc tạo.</li>
              </ul>
            </div>

            {message && <p className={`export-msg is-${message.tone}`} role="status">{message.text}</p>}
            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
                {busy ? 'Đang lưu…' : 'Lưu cài đặt'}
              </button>
              <button type="button" className="btn" disabled={busy || !dirty} onClick={() => { setValues(saved); setErrors({}); }}>
                Hoàn tác
              </button>
            </div>
            {lastUpdatedAt && <p className="hint">Lần sửa gần nhất: {formatDateTime(lastUpdatedAt)}</p>}
          </form>
        )}
      </section>
    </AdminLayout>
  );
}
