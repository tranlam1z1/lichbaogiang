import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../api/client.js';
import { runChargedExport } from '../lib/exportCharge.js';
import { buildExportWeeks, exportFileName, rangeLabel } from '../lib/range.js';
import { priceText } from '../../shared/pricing.js';
import ExportDialog from './ExportDialog.jsx';

const KIND = {
  docx: { fileType: 'DOCX', label: 'Word' },
  xlsx: { fileType: 'XLSX', label: 'Excel' },
};

/** Nút tải file Word / Excel. Bấm vào thì hỏi phạm vi tuần + khổ giấy + cột đồ dùng + phần ký tên, hiện số điểm theo số tuần rồi mới tải. */
export default function ExportPanel({ currentWeek }) {
  const { state, grade, index, ppctOverrides, equipmentDefaults, ppctEquipment } = useApp();
  const { user, settings, updateBalances, refreshSettings } = useAuth();
  const navigate = useNavigate();
  // Phạm vi lần trước — mở hộp thoại lần sau chọn sẵn.
  const [range, setRange] = useState({ type: 'current', from: 1, to: 35 });
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);
  // { kind, error? } khi hộp thoại đang mở
  const [dialog, setDialog] = useState(null);

  /** Người dùng đã chọn phạm vi + khổ giấy trong hộp thoại. */
  const submit = ({ range: chosen, weeks, orientation, equipment, signature, quote }) => {
    setRange(chosen);
    if (!quote.enough) {
      navigate('/nap-diem');
      return;
    }
    run(dialog.kind, { range: chosen, weeks, orientation, equipment, signature, confirmCost: quote.cost });
  };

  const run = async (kind, { range: chosen, weeks, orientation, equipment, signature, confirmCost }) => {
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
        equipmentDefaults,
        ppctEquipment,
        lessonOverrides: state.lessonOverrides,
        notTaught: state.notTaught,
      });
      const { downloadDocx, downloadXlsx } = await import('../lib/download.js');
      const rangeText = rangeLabel(chosen, weeks);
      const base = exportFileName(state.info.className, chosen, weeks);

      const auth = await runChargedExport({
        fileType,
        weeks: weeks.length,
        confirmCost,
        description: `${rangeText} (${weeks.length} tuần)`,
        generate: () =>
          kind === 'docx'
            ? downloadDocx(data, state.info, `${base}.docx`, { orientation, equipment, signature })
            : downloadXlsx(data, state.info, `${base}.xlsx`, { orientation, equipment, signature }),
        onUser: updateBalances,
      });
      setDialog(null);
      const charge =
        auth.export.chargeType === 'FREE'
          ? `Đã dùng 1 lượt miễn phí, còn ${auth.user.freeExportsLeft} lượt.`
          : `Đã trừ ${auth.export.pointsCharged} điểm, còn ${auth.user.points.toLocaleString('vi-VN')} điểm.`;
      setMessage({ tone: 'ok', text: `Đã tải ${weeks.length} tuần (${label}). ${charge}` });
    } catch (e) {
      if (e instanceof ApiError && ['CONFIRM_REQUIRED', 'INSUFFICIENT_POINTS'].includes(e.code)) {
        // Giá vừa đổi, hoặc lượt/điểm vừa dùng ở tab khác → cập nhật số liệu rồi hỏi lại trong hộp thoại.
        const d = e.details || {};
        if (d.points !== undefined) updateBalances({ points: d.points, freeExportsLeft: d.freeExportsLeft });
        refreshSettings().catch(() => {});
        setDialog({ kind, error: `${e.message} Hãy xem lại tổng điểm bên trên.` });
      } else if (e instanceof ApiError) {
        setDialog(null);
        setMessage({ tone: 'error', text: e.message });
      } else {
        console.error(e);
        setDialog(null);
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

  const balance = [
    user.freeExportsLeft > 0 && `Còn ${user.freeExportsLeft} lượt miễn phí (mỗi lượt tải 1 tuần)`,
    `Bạn có ${user.points.toLocaleString('vi-VN')} điểm`,
  ].filter(Boolean).join(' · ');

  return (
    <section className="export-panel" aria-label="Xuất file">
      <div className="export-actions">
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'docx' })} disabled={!!busy}>
          {busy === 'docx' ? 'Đang tạo…' : 'Tải Word'}
        </button>
        <button type="button" className="btn" onClick={() => setDialog({ kind: 'xlsx' })} disabled={!!busy}>
          {busy === 'xlsx' ? 'Đang tạo…' : 'Tải Excel'}
        </button>
      </div>
      {settings && <p className="export-price">Giá tải: {priceText(settings)} · {balance}</p>}
      {message && <p className={`export-msg is-${message.tone}`} role="status">{message.text}</p>}

      <ExportDialog
        open={!!dialog}
        kindLabel={dialog ? KIND[dialog.kind].label : ''}
        calendar={state.calendar}
        currentWeek={currentWeek}
        initialRange={range}
        user={user}
        settings={settings}
        busy={!!busy}
        error={dialog?.error}
        onSubmit={submit}
        onCancel={() => setDialog(null)}
      />
    </section>
  );
}

