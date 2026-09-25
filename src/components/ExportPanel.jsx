import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../api/client.js';
import { runChargedExport } from '../lib/exportCharge.js';
import { RANGE_OPTIONS, buildExportWeeks, rangeLabel, weeksInRange } from '../lib/range.js';
import { formatVnd } from '../../shared/validation.js';
import ConfirmDialog from './ConfirmDialog.jsx';

const KIND = {
  docx: { fileType: 'DOCX', label: 'Word' },
  xlsx: { fileType: 'XLSX', label: 'Excel' },
};

/** Chọn phạm vi và tải file Word / Excel (mỗi lần tải dùng 1 lượt miễn phí hoặc trừ điểm). */
export default function ExportPanel({ currentWeek }) {
  const { state, grade, index, ppctOverrides } = useApp();
  const { user, settings, updateBalances } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState({ type: 'current', from: 1, to: 35 });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  // { type: 'confirm', kind, cost, points } | { type: 'insufficient', cost, points }
  const [dialog, setDialog] = useState(null);

  const weeks = useMemo(
    () => weeksInRange(state.calendar, range, currentWeek?.id),
    [state.calendar, range, currentWeek?.id],
  );
  const cost = settings?.pointsPerExport ?? 0;

  /** Bấm nút tải: quyết định dùng lượt miễn phí, hỏi xác nhận trừ điểm, hay báo thiếu điểm. */
  const request = (kind) => {
    if (!weeks.length) {
      setMessage({ tone: 'error', text: 'Phạm vi đã chọn không có tuần học nào.' });
      return;
    }
    if (user.freeExportsLeft > 0 || cost === 0) {
      run(kind, 0);
    } else if (user.points < cost) {
      setDialog({ type: 'insufficient', cost, points: user.points });
    } else {
      setDialog({ type: 'confirm', kind, cost, points: user.points });
    }
  };

  const run = async (kind, confirmCost) => {
    setDialog(null);
    setBusy(kind);
    setMessage(null);
    const { fileType, label } = KIND[kind];
    try {
      // Dựng dữ liệu và nạp thư viện TRƯỚC khi trừ lượt, để lỗi ở bước này không tốn lượt nào.
      const data = buildExportWeeks({
        weeks,
        timetable: state.timetable,
        index,
        grade,
        ppctOverrides,
        lessonOverrides: state.lessonOverrides,
      });
      const { downloadDocx, downloadXlsx } = await import('../lib/download.js');
      const rangeText = rangeLabel(range, weeks);
      const base = `Ke-hoach-giang-day_${(state.info.className || 'lop').replace(/\s+/g, '')}_${rangeText}`;

      const auth = await runChargedExport({
        fileType,
        confirmCost,
        description: `${rangeText} (${weeks.length} tuần)`,
        generate: () =>
          kind === 'docx'
            ? downloadDocx(data, state.info, `${base}.docx`)
            : downloadXlsx(data, state.info, `${base}.xlsx`),
        onUser: updateBalances,
      });
      const charge =
        auth.export.chargeType === 'FREE'
          ? `Đã dùng 1 lượt miễn phí, còn ${auth.user.freeExportsLeft} lượt.`
          : `Đã trừ ${auth.export.pointsCharged} điểm, còn ${auth.user.points} điểm.`;
      setMessage({ tone: 'ok', text: `Đã tải ${weeks.length} tuần (${label}). ${charge}` });
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details || {};
        if (d.points !== undefined) updateBalances({ points: d.points, freeExportsLeft: d.freeExportsLeft });
        if (e.code === 'CONFIRM_REQUIRED') {
          // Hết lượt miễn phí (VD: vừa dùng ở tab khác) hoặc giá vừa đổi → hỏi lại với số liệu mới.
          setDialog(d.points < d.cost ? { type: 'insufficient', ...d } : { type: 'confirm', kind, ...d });
        } else if (e.code === 'INSUFFICIENT_POINTS') {
          setDialog({ type: 'insufficient', ...d });
        } else {
          setMessage({ tone: 'error', text: e.message });
        }
      } else {
        console.error(e);
        const refund =
          e.refunded === true
            ? ' Lượt/điểm của lần này đã được hoàn lại.'
            : e.refunded === false
              ? ' Chưa hoàn lại được lượt/điểm, vui lòng liên hệ quản trị viên.'
              : '';
        setMessage({ tone: 'error', text: `Không tạo được file: ${e.message}.${refund}` });
      }
    } finally {
      setBusy(null);
    }
  };

  const priceNote =
    user.freeExportsLeft > 0
      ? `Còn ${user.freeExportsLeft} lượt miễn phí`
      : cost > 0
        ? `Mỗi lần tải: ${cost} điểm · Bạn có ${user.points.toLocaleString('vi-VN')} điểm`
        : null;

  return (
    <section className="export-panel" aria-label="Xuất file">
      <label className="field field-inline">
        <span>Phạm vi</span>
        <select value={range.type} onChange={(e) => setRange({ ...range, type: e.target.value })}>
          {RANGE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
      {range.type === 'custom' && (
        <span className="range-custom">
          <label className="field field-inline">
            <span>Từ tuần</span>
            <input type="number" min="1" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          </label>
          <label className="field field-inline">
            <span>đến</span>
            <input type="number" min="1" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </span>
      )}
      <span className="export-count">{weeks.length} tuần</span>
      <div className="export-actions">
        <button type="button" className="btn btn-primary" onClick={() => request('docx')} disabled={!!busy}>
          {busy === 'docx' ? 'Đang tạo…' : 'Tải Word'}
        </button>
        <button type="button" className="btn" onClick={() => request('xlsx')} disabled={!!busy}>
          {busy === 'xlsx' ? 'Đang tạo…' : 'Tải Excel'}
        </button>
      </div>
      {priceNote && <p className="export-price">{priceNote}</p>}
      {message && <p className={`export-msg is-${message.tone}`} role="status">{message.text}</p>}

      <ConfirmDialog
        open={dialog?.type === 'confirm'}
        title="Xác nhận trừ điểm"
        message={`Lần xuất này sẽ trừ ${dialog?.cost} điểm, bạn còn ${dialog?.points?.toLocaleString('vi-VN')} điểm. Tiếp tục?`}
        confirmLabel={`Trừ ${dialog?.cost} điểm và tải`}
        onConfirm={() => run(dialog.kind, dialog.cost)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.type === 'insufficient'}
        title="Không đủ điểm"
        message={
          `Bạn đã hết lượt xuất miễn phí. Mỗi lần xuất file cần ${dialog?.cost} điểm, bạn hiện có ${dialog?.points} điểm.` +
          (settings ? ` Nạp ${formatVnd(settings.topupUnitVnd)} được ${settings.pointsPerUnit} điểm.` : '')
        }
        confirmLabel="Nạp điểm"
        onConfirm={() => navigate('/nap-diem')}
        onCancel={() => setDialog(null)}
      />
    </section>
  );
}
