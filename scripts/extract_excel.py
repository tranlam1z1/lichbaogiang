"""Trích dữ liệu từ file Excel "Lịch báo giảng" sang JSON trong src/data.

Cách dùng:
    # File .xls cũ cần chuyển sang .xlsx trước (bằng LibreOffice hoặc Excel "Lưu thành"):
    soffice --headless --convert-to xlsx "LBG.xls"
    pip install openpyxl
    python scripts/extract_excel.py LBG.xlsx
"""
import json, sys, unicodedata, datetime, os
import openpyxl

src = sys.argv[1] if len(sys.argv) > 1 else 'lbg.xlsx'
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'src', 'data')
fixtures = os.path.join(here, '..', 'tests', 'fixtures')
os.makedirs(out, exist_ok=True)
os.makedirs(fixtures, exist_ok=True)
wb = openpyxl.load_workbook(src, data_only=True)


def clean(v):
    if v is None:
        return ''
    s = unicodedata.normalize('NFC', str(v)).replace('\u00a0', ' ')
    return ' '.join(s.split())


def to_int(v):
    s = clean(v)
    if s == '':
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


# ---------- PPCT: [môn, tuần, tiết thứ, số tiết PPCT, tên bài] ----------
ppct, report = {}, {}
for g in range(1, 6):
    ws = wb[f'PPCT L{g}']
    rows, index, dup, skipped = [], {}, 0, 0
    for r in ws.iter_rows(min_row=3, min_col=3, max_col=7, values_only=True):
        subj, week, tiet, num, name = r
        subj = clean(subj).upper()
        week, tiet, num, name = to_int(week), to_int(tiet), to_int(num), clean(name)
        if not subj or week is None or tiet is None:
            if any(clean(x) for x in r):
                skipped += 1
            continue
        key = (subj, week, tiet)
        if key in index:                      # trùng khóa: giữ dòng có tên bài
            dup += 1
            i = index[key]
            if not rows[i][4] and name:
                rows[i] = [subj, week, tiet, num, name]
            continue
        index[key] = len(rows)
        rows.append([subj, week, tiet, num, name])
    ppct[str(g)] = rows
    report[g] = dict(rows=len(rows), duplicates_removed=dup, skipped=skipped)

# ---------- Lịch tuần ----------
ws = wb['LỊCH TUẦN']
calendar, sem = [], 'I'
for r in range(3, ws.max_row + 1):
    b, c, d, f = (ws.cell(r, k).value for k in (2, 3, 4, 6))
    if clean(b) in ('I', 'II'):
        sem = clean(b)
    if not isinstance(d, datetime.datetime):
        continue
    num = to_int(c)
    calendar.append(dict(id=f'w{len(calendar) + 1}', num=num,
                         note='' if num is not None else clean(c),
                         semester=sem,
                         start=d.date().isoformat(), end=f.date().isoformat()))

# ---------- Thời khóa biểu (tiết 1–4 sáng, 5–7 chiều như sheet LỊCH BÁO GIẢNG) ----------
ws = wb['THỜI KHÓA BIỂU']
days = {}
for di, day in enumerate(range(2, 8)):
    base = 6 + di * 8
    slots = [clean(ws.cell(base + k, 4).value).upper() for k in range(8)]
    days[str(day)] = dict(morning=(slots[:4] + [''])[:5], afternoon=(slots[4:8] + [''])[:5])
catalog = [clean(ws.cell(r, 9).value).upper() for r in range(6, 30) if clean(ws.cell(r, 9).value)]

lbg = wb['LỊCH BÁO GIẢNG']
grade = to_int(lbg['I3'].value) or 4
year = int(calendar[0]['start'][:4])
info = dict(
    agency=clean(ws['B1'].value),
    school=clean(ws['B2'].value),
    teacher=clean(lbg['G41'].value).split(':')[-1].strip(),
    schoolYear=f'{year} - {year + 1}',
    grade=grade,
    className=f"{grade}{clean(lbg['J3'].value)}",
)
defaults = dict(info=info,
                timetable=dict(morningCount=4, afternoonCount=3, saturday=False, days=days),
                subjectCatalog=catalog)

# ---------- Lịch báo giảng tuần 1 trong Excel (dùng để kiểm thử) ----------
week1 = []
for r in range(5, 40):
    week1.append(dict(row=r, subject=clean(lbg.cell(r, 5).value).upper(),
                      ppct=lbg.cell(r, 6).value, title=clean(lbg.cell(r, 7).value)))


def dump(path, obj, compact=False):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False,
                  separators=(',', ':') if compact else None,
                  indent=None if compact else 1)


dump(os.path.join(out, 'ppct.json'), ppct, compact=True)
dump(os.path.join(out, 'calendar.json'), calendar)
dump(os.path.join(out, 'defaults.json'), defaults)
dump(os.path.join(fixtures, 'excel-week1.json'), week1)
print(json.dumps(report, ensure_ascii=False))
print(len(calendar), 'tuần; danh mục môn:', catalog)
