import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../api/client.js';
import { runChargedExport } from '../lib/exportCharge.js';
import { buildWeekLessons, flattenWeek } from '../lib/schedule.js';
import { foldVietnamese } from '../lib/text.js';
import { guessLabel, resolveWeekPlans } from '../lib/lessonPlans.js';
import { deletePlan, getChoices, listPlans, requestPersist, savePlans, setChoice, updatePlan } from '../lib/lessonPlanStore.js';
import { quoteLessonPlanExport } from '../../shared/pricing.js';
import WeekStrip from './WeekStrip.jsx';
import FormDialog from './FormDialog.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import LessonPlanUploadDialog, { fileError, planCheck, planLabel } from './LessonPlanUploadDialog.jsx';

const MODES = [
  { id: 'week', label: 'Theo tuần' },
  { id: 'all', label: 'Tất cả file' },
];
const QUOTA = 'Trình duyệt hết chỗ lưu. Xóa bớt giáo án cũ rồi thử lại.';
const errText = (e) => (e?.name === 'QuotaExceededError' ? QUOTA : e?.message || 'Lỗi không rõ.');
const formatSize = (b) =>
  b >= 1048576
    ? `${(b / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Tab "Kho giáo án": file .docx của giáo viên lưu trong trình duyệt, khớp với TKB và xuất một file Word cho cả tuần. */
export default function LessonPlansPage() {
  const { state, grade: gradeValue, index, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration } = useApp();
  const { user, settings, updateBalances, refreshSettings } = useAuth();
  const navigate = useNavigate();
  const grade = Number(gradeValue);
  const [mode, setMode] = useState('week');
  const [plans, setPlans] = useState(null);
  const [choices, setChoices] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null); // { id, items, error? }
  const [removing, setRemoving] = useState(null);
  const [exporting, setExporting] = useState(null); // { error? }
  const [filter, setFilter] = useState({ subject: '', q: '' });
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const prefillRef = useRef(null);
  const replaceTarget = useRef(null);
  const openerRef = useRef(null);

  const week = useMemo(
    () => state.calendar.find((w) => w.id === state.selectedWeekId) || null,
    [state.calendar, state.selectedWeekId],
  );
  const weekNum = week?.num;
  const weekOverrides = week ? state.lessonOverrides[week.num] : undefined;
  const rows = useMemo(
    () =>
      week
        ? flattenWeek(buildWeekLessons({
          week, timetable: state.timetable, index, grade: gradeValue, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration,
          lessonOverrides: weekOverrides || {}, notTaught: state.notTaught,
        }))
        : [],
    [week, state.timetable, index, gradeValue, ppctOverrides, equipmentDefaults, ppctEquipment, ppctIntegration, weekOverrides, state.notTaught],
  );

  const reload = useCallback(
    () =>
      listPlans(grade)
        .then(setPlans)
        .catch((e) => {
          setPlans([]);
          setMsg({ tone: 'error', text: `Không mở được kho giáo án trên trình duyệt này: ${errText(e)}` });
        }),
    [grade],
  );
  useEffect(() => {
    setPlans(null);
    reload();
  }, [reload]);

  useEffect(() => {
    setChoices({});
    if (weekNum == null) return undefined;
    let live = true;
    getChoices(grade, weekNum).then((c) => live && setChoices(c || {})).catch(() => {});
    return () => {
      live = false;
    };
  }, [grade, weekNum]);

  const resolved = useMemo(
    () => (week && plans ? resolveWeekPlans({ rows, weekNum: week.num, plans, choices }) : null),
    [week, plans, rows, choices],
  );
  const quote = user && settings ? quoteLessonPlanExport(user, settings) : null;

  // Đóng hộp thoại thì trả focus về nút đã mở nó.
  const remember = () => {
    openerRef.current = document.activeElement;
  };
  const restoreFocus = useCallback(() => openerRef.current?.focus?.(), []);

  // ---- Tải lên, sửa nhãn, thay file, xóa ----
  const pickUpload = (prefill) => {
    remember();
    prefillRef.current = prefill || null;
    fileRef.current?.click();
  };
  const onFiles = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const prefill = prefillRef.current;
    setUpload({
      id: Date.now(),
      items: files.map((file, i) => {
        const g = prefill || guessLabel(file.name, index.subjects);
        return { key: `${i}-${file.name}`, file, fileName: file.name, size: file.size, subject: g.subject || '', kind: g.kind || '', num: g.num ?? '' };
      }),
    });
  };
  const openEdit = (p) => {
    remember();
    setUpload({ id: Date.now(), items: [{ key: p.id, planId: p.id, fileName: p.fileName, subject: p.subject, kind: p.kind, num: p.num }] });
  };
  const closeUpload = useCallback(() => {
    setUpload(null);
    restoreFocus();
  }, [restoreFocus]);

  const saveUpload = async (items) => {
    setBusy(true);
    try {
      if (items[0].planId) {
        const { planId, subject, kind, num, fileName } = items[0];
        await updatePlan(planId, { subject, kind, num });
        setMsg({ tone: 'ok', text: `Đã sửa nhãn «${fileName}».` });
      } else {
        // Xin trình duyệt không tự xóa kho khi thiếu chỗ; gọi lại nhiều lần cũng không sao.
        requestPersist().catch(() => {});
        await savePlans(items.map(({ file, fileName, size, subject, kind, num }) => ({
          grade, subject, kind, num, fileName, size, blob: file, addedAt: Date.now(),
        })));
        setMsg({ tone: 'ok', text: `Đã lưu ${items.length} giáo án.` });
      }
      closeUpload();
      await reload();
    } catch (e) {
      setUpload((u) => u && { ...u, error: errText(e) });
    } finally {
      setBusy(false);
    }
  };

  const pickReplace = (p) => {
    remember();
    replaceTarget.current = p;
    replaceRef.current?.click();
  };
  const onReplace = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const p = replaceTarget.current;
    if (!file || !p) return;
    const bad = fileError(file.name, file.size);
    if (bad) {
      setMsg({ tone: 'error', text: bad });
      return;
    }
    try {
      await updatePlan(p.id, { fileName: file.name, size: file.size, blob: file, addedAt: Date.now() });
      setMsg({ tone: 'ok', text: `Đã thay «${p.fileName}» bằng «${file.name}».` });
      await reload();
    } catch (err) {
      setMsg({ tone: 'error', text: errText(err) });
    }
  };

  const cancelRemove = useCallback(() => {
    setRemoving(null);
    restoreFocus();
  }, [restoreFocus]);
  const confirmRemove = async () => {
    const p = removing;
    cancelRemove();
    try {
      await deletePlan(p.id);
      setMsg({ tone: 'ok', text: `Đã xóa «${p.fileName}».` });
      await reload();
    } catch (e) {
      setMsg({ tone: 'error', text: errText(e) });
    }
  };

  const choose = (subject, value) => {
    setChoices((c) => ({ ...c, [subject]: value }));
    setChoice(grade, weekNum, subject, value).catch((e) => setMsg({ tone: 'error', text: errText(e) }));
  };

  // ---- Xuất Word cả tuần ----
  const closeExport = useCallback(() => {
    setExporting(null);
    restoreFocus();
  }, [restoreFocus]);
  const runExport = async () => {
    if (!quote.enough) {
      navigate('/nap-diem');
      return;
    }
    const { files } = resolved;
    const n = week.num;
    setBusy(true);
    setMsg(null);
    try {
      // Nạp thư viện TRƯỚC khi trừ điểm, để lỗi ở bước này không tốn điểm.
      const [{ buildLessonPlanDocx, lessonPlanFileName }, { saveAs }] = await Promise.all([
        import('../lib/lessonPlanDocx.js'),
        import('file-saver'),
      ]);
      const auth = await runChargedExport({
        fileType: 'LESSON_PLAN',
        weeks: 1,
        confirmCost: quote.cost,
        description: `Giáo án tuần ${n}`,
        generate: async () => saveAs(await buildLessonPlanDocx(files.map((p) => p.blob)), lessonPlanFileName(n, state.info.className)),
        onUser: updateBalances,
      });
      closeExport();
      setMsg({
        tone: 'ok',
        text: `Đã tải giáo án tuần ${n} (${files.length} file). Đã trừ ${auth.export.pointsCharged} điểm, còn ${auth.user.points.toLocaleString('vi-VN')} điểm.`,
      });
    } catch (e) {
      if (e instanceof ApiError && ['CONFIRM_REQUIRED', 'INSUFFICIENT_POINTS'].includes(e.code)) {
        // Giá vừa đổi hoặc điểm vừa dùng ở tab khác → cập nhật số liệu rồi hỏi lại.
        const d = e.details || {};
        if (d.points !== undefined) updateBalances({ points: d.points, freeExportsLeft: d.freeExportsLeft });
        refreshSettings().catch(() => {});
        setExporting({ error: `${e.message} Hãy xem lại số điểm bên trên.` });
      } else {
        if (!(e instanceof ApiError)) console.error(e);
        closeExport();
        const refund =
          e.refunded === true
            ? ' Điểm của lần này đã được hoàn lại.'
            : e.refunded === false
              ? ' Chưa hoàn lại được điểm, vui lòng liên hệ quản trị viên.'
              : '';
        setMsg({ tone: 'error', text: e instanceof ApiError ? e.message : `Không tạo được file: ${e.message}.${refund}` });
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Danh sách file ----
  const sorted = plans || []; // listPlans đã xếp theo môn → loại → số
  const planSubjects = [...new Set(sorted.map((p) => p.subject))];
  const q = foldVietnamese(filter.q);
  const shown = sorted.filter((p) => (!filter.subject || p.subject === filter.subject) && (!q || foldVietnamese(p.fileName).includes(q)));
  const totalSize = sorted.reduce((s, p) => s + (p.size || 0), 0);

  // ---- Theo tuần ----
  const weekPlanOf = (s) => plans?.find((p) => p.kind === 'week' && p.subject === s && p.num === weekNum);
  const choiceSubjects = resolved
    ? [...new Set([...resolved.conflicts, ...Object.keys(choices).filter((s) => weekPlanOf(s) && rows.some((r) => r.subject === s))])]
    : [];
  const blockReason = !resolved
    ? null
    : resolved.conflicts.length
      ? `Chọn nguồn giáo án cho môn ${resolved.conflicts.join(', ')} trước khi tải.`
      : !resolved.files.length
        ? `Tuần ${weekNum} chưa có giáo án nào.`
        : null;
  const missing = resolved ? resolved.counted - resolved.covered : 0;

  const statusCell = ({ row, status, plan }) => {
    switch (status) {
      case 'file':
        return <span className="pill pill-ok">✓ {plan.fileName}{plan.kind === 'week' ? ' (cả tuần)' : ''}</span>;
      case 'inWeekFile':
        return <span className="pill pill-ok">✓ trong file cả tuần</span>;
      case 'needChoice':
        return <span className="pill pill-edit">Cần chọn</span>;
      case 'missing':
        return (
          <>
            <span className="pill pill-warn">✕ Chưa có</span>{' '}
            <button
              type="button"
              className="btn btn-small"
              aria-label={`Tải giáo án lên cho ${row.subject}${row.ppct !== '' ? `, tiết PPCT ${row.ppct}` : ''}`}
              onClick={() => pickUpload({ subject: row.subject, kind: 'lesson', num: row.ppct })}
            >
              Tải lên
            </button>
          </>
        );
      default:
        return row.subject ? <span className="hint">Không tính</span> : null;
    }
  };

  return (
    <>
      <p className="banner banner-note">
        File giáo án chỉ lưu trên trình duyệt này của máy này. Không tự sang máy khác, và sẽ mất nếu xóa dữ liệu duyệt web. Hãy giữ bản gốc.
      </p>
      {msg && (msg.tone === 'error'
        ? <p className="banner banner-alert" role="alert">{msg.text}</p>
        : <p className="export-msg is-ok" role="status">{msg.text}</p>)}

      <div className="options-row">
        <div className="seg" role="tablist" aria-label="Cách xem kho giáo án">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={`seg-btn${mode === m.id ? ' is-active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => pickUpload()}>Tải giáo án lên (.docx)</button>
        <input ref={fileRef} type="file" accept=".docx" multiple hidden onChange={onFiles} />
        <input ref={replaceRef} type="file" accept=".docx" hidden onChange={onReplace} />
      </div>

      {plans === null ? (
        <p className="empty">Đang mở kho giáo án…</p>
      ) : mode === 'week' ? (
        <>
          <WeekStrip />
          {!week ? (
            <p className="empty">Chưa có tuần học nào. Hãy thêm tuần ở mục Lịch tuần.</p>
          ) : (
            <section className="card" aria-label={`Giáo án tuần ${week.num}`}>
              <div className="card-head">
                <div>
                  <h2>Giáo án tuần {week.num}</h2>
                  <p className="card-text">
                    {resolved.covered}/{resolved.counted} tiết có giáo án · {missing} tiết thiếu
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!!blockReason || busy || !quote}
                  aria-describedby={blockReason ? 'plan-export-reason' : undefined}
                  onClick={() => {
                    remember();
                    setExporting({});
                  }}
                >
                  {busy && exporting ? 'Đang tạo…' : `Tải giáo án tuần ${week.num} (Word)${quote ? ` · ${quote.cost} điểm` : ''}`}
                </button>
              </div>
              {blockReason && <p className="hint" id="plan-export-reason">{blockReason}</p>}

              {choiceSubjects.map((s, i) => (
                <div key={s} className="banner banner-note plan-choice" role="group" aria-labelledby={`plan-choice-${i}`}>
                  <p id={`plan-choice-${i}`}>
                    Môn {s} tuần {week.num} có cả file cả tuần và file theo tiết.{choices[s] ? '' : ' Hãy chọn một nguồn:'}
                  </p>
                  <div className="seg">
                    <button
                      type="button"
                      className={`seg-btn${choices[s] === 'week' ? ' is-active' : ''}`}
                      aria-pressed={choices[s] === 'week'}
                      onClick={() => choose(s, 'week')}
                    >
                      Dùng file cả tuần «{weekPlanOf(s).fileName}»
                    </button>
                    <button
                      type="button"
                      className={`seg-btn${choices[s] === 'lesson' ? ' is-active' : ''}`}
                      aria-pressed={choices[s] === 'lesson'}
                      onClick={() => choose(s, 'lesson')}
                    >
                      Dùng file theo tiết
                    </button>
                  </div>
                </div>
              ))}

              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Thứ</th>
                      <th scope="col">Tiết</th>
                      <th scope="col">Môn</th>
                      <th scope="col">PPCT</th>
                      <th scope="col">Tên bài</th>
                      <th scope="col">Giáo án</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolved.items.map((it) => (
                      <tr key={it.row.key}>
                        {it.row.dayRowSpan > 0 && <th scope="rowgroup" rowSpan={it.row.dayRowSpan}>{it.row.dayLabel}</th>}
                        <td className="nowrap">{it.row.sessionLabel} {it.row.period}</td>
                        <td>{it.row.subject}</td>
                        <td className="num">{it.row.ppct}</td>
                        <td>{it.row.notTaught ? '' : it.row.title}</td>
                        <td className="plan-status">{statusCell(it)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="card" aria-label="Tất cả file giáo án">
          <div className="filters">
            <label className="field">
              Môn
              <select value={filter.subject} onChange={(e) => setFilter((f) => ({ ...f, subject: e.target.value }))}>
                <option value="">Tất cả môn</option>
                {planSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field field-grow">
              Tìm theo tên file
              <input type="search" value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
            </label>
          </div>
          <p className="result-count">
            {sorted.length} file · {formatSize(totalSize)}
            {shown.length !== sorted.length && ` · đang hiện ${shown.length} file`}
          </p>
          {!shown.length ? (
            <p className="empty">{sorted.length ? 'Không có file nào khớp.' : 'Kho chưa có giáo án nào. Bấm "Tải giáo án lên" để thêm.'}</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Tên file</th>
                    <th scope="col">Môn</th>
                    <th scope="col">Gắn với</th>
                    <th scope="col">Bài PPCT</th>
                    <th scope="col">Dung lượng</th>
                    <th scope="col"><span className="visually-hidden">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td>{p.fileName}</td>
                      <td>{p.subject}</td>
                      <td className="nowrap">{planLabel(p)}</td>
                      <td>{planCheck(index, p, ppctOverrides).text}</td>
                      <td className="num">{formatSize(p.size || 0)}</td>
                      <td className="row-actions">
                        <button type="button" className="btn btn-small" aria-label={`Sửa nhãn ${p.fileName}`} onClick={() => openEdit(p)}>Sửa nhãn</button>{' '}
                        <button type="button" className="btn btn-small" aria-label={`Thay file ${p.fileName}`} onClick={() => pickReplace(p)}>Thay file</button>{' '}
                        <button
                          type="button"
                          className="btn btn-small btn-danger-outline"
                          aria-label={`Xóa ${p.fileName}`}
                          onClick={() => {
                            remember();
                            setRemoving(p);
                          }}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {upload && (
        <LessonPlanUploadDialog
          key={upload.id}
          initial={upload.items}
          plans={plans || []}
          grade={grade}
          busy={busy}
          error={upload.error}
          onSave={saveUpload}
          onCancel={closeUpload}
        />
      )}

      <ConfirmDialog
        open={!!removing}
        title={`Xóa «${removing?.fileName}»?`}
        message="File bị xóa khỏi kho trên trình duyệt này. Bản gốc trên máy của bạn không bị ảnh hưởng."
        confirmLabel="Xóa"
        danger
        onCancel={cancelRemove}
        onConfirm={confirmRemove}
      />

      {exporting && resolved && quote && (
        <FormDialog
          open
          title={`Tải giáo án tuần ${week.num}`}
          submitLabel={quote.enough ? 'Tải file Word' : 'Nạp điểm'}
          busy={busy}
          error={exporting.error}
          onSubmit={runExport}
          onCancel={closeExport}
        >
          <p>Gộp {resolved.files.length} file giáo án thành một file Word, xếp theo thời khóa biểu tuần {week.num}.</p>
          {missing > 0 && <p className="cell-warn">Còn {missing} tiết chưa có giáo án, sẽ bỏ qua.</p>}
          <div className={`export-total${quote.enough ? '' : ' is-short'}`}>
            <p>
              <strong>{quote.cost} điểm</strong> · Bạn có {user.points.toLocaleString('vi-VN')} →{' '}
              {quote.enough ? `còn ${quote.pointsAfter.toLocaleString('vi-VN')}` : 'không đủ điểm'}
            </p>
            <p className="export-note">Giáo án không dùng lượt miễn phí.</p>
            <p className="export-note">Mở bằng Microsoft Word trên máy tính (WPS, Google Docs có thể hiển thị sai).</p>
          </div>
        </FormDialog>
      )}
    </>
  );
}
