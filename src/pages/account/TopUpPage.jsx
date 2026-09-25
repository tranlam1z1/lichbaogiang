import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { formatVnd, pointsForAmount, validateTopUpAmount } from '../../../shared/validation.js';
import AccountLayout, { TOPUP_STATUS, formatDateTime } from './AccountLayout.jsx';

const QUICK_MULTIPLES = [1, 2, 5, 10, 20];
/** Có yêu cầu chờ duyệt thì tự kiểm tra lại trạng thái: nhanh khi có webhook ngân hàng, chậm hơn khi admin duyệt tay. */
const POLL_MS = { auto: 5_000, manual: 30_000 };

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(text));
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      window.prompt('Sao chép nội dung dưới đây:', String(text));
    }
  };
  return (
    <button type="button" className="btn btn-small" onClick={copy}>
      {done ? 'Đã chép ✓' : 'Chép'}
    </button>
  );
}

/** Thông tin chuyển khoản + mã QR VietQR cho một yêu cầu đang chờ duyệt. */
function TransferCard({ topUp, auto }) {
  const t = topUp.transfer;
  if (!t) return null;
  return (
    <div className="transfer">
      <img className="transfer-qr" src={t.qrUrl} alt={`Mã QR chuyển khoản ${formatVnd(t.amountVnd)}, nội dung ${t.content}`} width="260" height="300" />
      <dl className="transfer-info">
        <dt>Ngân hàng</dt>
        <dd>{t.bankName}</dd>
        <dt>Số tài khoản</dt>
        <dd><strong>{t.accountNo}</strong> <CopyButton text={t.accountNo} /></dd>
        <dt>Chủ tài khoản</dt>
        <dd>{t.accountName}</dd>
        <dt>Số tiền</dt>
        <dd><strong>{formatVnd(t.amountVnd)}</strong> <CopyButton text={t.amountVnd} /></dd>
        <dt>Nội dung chuyển khoản</dt>
        <dd><strong className="transfer-code">{t.content}</strong> <CopyButton text={t.content} /></dd>
        <dt>Điểm nhận được</dt>
        <dd>{topUp.points.toLocaleString('vi-VN')} điểm</dd>
      </dl>
      <p className="hint transfer-note">
        Quét mã QR bằng app ngân hàng, hoặc chuyển khoản thủ công và ghi <strong>đúng nội dung {t.content}</strong>, đúng số tiền.{' '}
        {auto
          ? 'Điểm được cộng tự động trong khoảng 1 phút sau khi tiền về, trang này tự cập nhật — bạn không cần làm gì thêm.'
          : 'Điểm được cộng sau khi quản trị viên xác nhận đã nhận tiền (trạng thái sẽ chuyển thành “Đã cộng điểm”).'}
        {auto && ' Nếu sau 15 phút vẫn chưa được cộng (VD: ghi sai nội dung), quản trị viên sẽ kiểm tra và cộng tay — đừng hủy yêu cầu.'}
      </p>
    </div>
  );
}

export default function TopUpPage() {
  const { settings, refresh } = useAuth();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const pendingRef = useRef(null);

  const loadPending = useCallback(async () => {
    try {
      const data = await api.get('/topups?status=PENDING&pageSize=10');
      // Yêu cầu vừa rời khỏi danh sách chờ → kiểm tra xem có phải vừa được cộng điểm không.
      const prev = pendingRef.current;
      const gone = prev ? prev.filter((p) => !data.items.some((i) => i.id === p.id)).map((p) => p.id) : [];
      pendingRef.current = data.items;
      setPending(data.items);
      setLoadError(null);
      if (gone.length) {
        const recent = await api.get('/topups?pageSize=20');
        const approved = recent.items.filter((t) => gone.includes(t.id) && t.status === 'APPROVED');
        if (approved.length) {
          const pts = approved.reduce((s, t) => s + t.points, 0);
          setNotice(`Đã nhận tiền, cộng ${pts.toLocaleString('vi-VN')} điểm vào tài khoản (mã ${approved.map((t) => t.code).join(', ')}). Cảm ơn bạn!`);
          refresh().catch(() => {});
        }
      }
      return data.items;
    } catch (e) {
      setLoadError(e.message);
      return [];
    }
  }, [refresh]);

  useEffect(() => {
    loadPending().then((items) => setOpenId((id) => id ?? items[0]?.id ?? null));
    refresh().catch(() => {});
  }, [loadPending, refresh]);

  const auto = Boolean(settings?.topupAuto);
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!hasPending) return undefined;
    const t = setInterval(() => document.visibilityState === 'visible' && loadPending(), auto ? POLL_MS.auto : POLL_MS.manual);
    return () => clearInterval(t);
  }, [hasPending, auto, loadPending]);

  if (!settings) return <AccountLayout title="Nạp điểm"><div className="empty">Đang tải…</div></AccountLayout>;
  const { topupUnitVnd: unit, pointsPerUnit, pointsPerExport, topupEnabled } = settings;
  const amountError = amount === '' ? null : validateTopUpAmount(amount, unit);

  const submit = async (e) => {
    e.preventDefault();
    const err = validateTopUpAmount(amount, unit);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      const { topUp } = await api.post('/topups', { amountVnd: Number(amount) });
      setAmount('');
      await loadPending();
      setOpenId(topUp.id);
    } catch (e2) {
      setError(e2.errors?.amountVnd || e2.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm('Hủy yêu cầu nạp này? Nếu bạn đã chuyển khoản, đừng hủy — điểm sẽ được cộng khi tiền về.')) return;
    try {
      await api.post(`/topups/${id}/cancel`);
    } catch (e) {
      window.alert(e.message);
    }
    loadPending();
  };

  return (
    <AccountLayout title="Nạp điểm">
      {notice && <div className="banner banner-note" role="status">{notice}</div>}
      <section className="card">
        <h2>Tạo yêu cầu nạp</h2>
        <p className="card-text">
          Tỷ lệ quy đổi: <strong>{formatVnd(unit)} = {pointsPerUnit} điểm</strong>. Mỗi lần xuất file Word/Excel (sau khi hết lượt
          miễn phí) trừ <strong>{pointsPerExport} điểm</strong>. Nạp tối thiểu {formatVnd(unit)}, số tiền là bội số của {formatVnd(unit)}.
        </p>
        {!topupEnabled && (
          <div className="banner banner-alert" role="alert">
            Chức năng nạp điểm tạm thời chưa sẵn sàng. Vui lòng liên hệ quản trị viên.
          </div>
        )}
        <form className="topup-form" onSubmit={submit} noValidate>
          <div className="button-row" role="group" aria-label="Chọn nhanh số tiền">
            {QUICK_MULTIPLES.map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-small${Number(amount) === m * unit ? ' btn-primary' : ''}`}
                onClick={() => {
                  setAmount(String(m * unit));
                  setError(null);
                }}
              >
                {formatVnd(m * unit)}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Số tiền (đồng)</span>
            <input
              type="number"
              inputMode="numeric"
              min={unit}
              step={unit}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              aria-invalid={error || amountError ? 'true' : undefined}
              placeholder={`VD: ${5 * unit}`}
            />
            {(error || amountError) ? (
              <small className="field-error">{error || amountError}</small>
            ) : (
              amount !== '' && (
                <small className="field-hint">
                  Bạn sẽ nhận <strong>{pointsForAmount(amount, unit, pointsPerUnit).toLocaleString('vi-VN')} điểm</strong>.
                </small>
              )
            )}
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !topupEnabled}>
            {busy ? 'Đang tạo…' : 'Tạo yêu cầu nạp'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Yêu cầu đang chờ duyệt</h2>
          <button type="button" className="btn btn-small" onClick={() => { loadPending(); refresh().catch(() => {}); }}>
            Làm mới
          </button>
        </div>
        {loadError && <div className="banner banner-alert" role="alert">{loadError}</div>}
        {!pending.length && !loadError && <p className="card-text">Không có yêu cầu nào đang chờ duyệt.</p>}
        <ul className="topup-list">
          {pending.map((t) => (
            <li key={t.id} className="topup-item">
              <div className="topup-row">
                <span className="transfer-code">{t.code}</span>
                <span>{formatVnd(t.amountVnd)} → {t.points.toLocaleString('vi-VN')} điểm</span>
                <span className={`pill ${TOPUP_STATUS[t.status].className}`}>{TOPUP_STATUS[t.status].label}</span>
                <span className="topup-date">{formatDateTime(t.createdAt)}</span>
                <span className="head-actions">
                  <button type="button" className="btn btn-small" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    {openId === t.id ? 'Ẩn QR' : 'Xem QR'}
                  </button>
                  <button type="button" className="btn btn-small btn-danger-outline" onClick={() => cancel(t.id)}>
                    Hủy
                  </button>
                </span>
              </div>
              {openId === t.id && <TransferCard topUp={t} auto={auto} />}
            </li>
          ))}
        </ul>
      </section>
    </AccountLayout>
  );
}
