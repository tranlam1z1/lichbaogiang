"""Nhập PPCT khối 6–9 từ file markdown (các khối ```tsv dưới tiêu đề "## ... lớp N") vào src/data/ppct.json.

Cách dùng:  python scripts/import_ppct_md.py docs/ppct/ppct_thcs_kntt_phan1.md [file2.md ...]
Chạy lại với phần 2: chỉ thay các cặp (khối, môn) có trong file, giữ nguyên phần còn lại.
Cột TSV: Môn | Tuần | Tiết thứ | PPCT | Tên bài.
"""
import io, json, os, re, sys, unicodedata

here = os.path.dirname(os.path.abspath(__file__))
target = os.path.join(here, '..', 'src', 'data', 'ppct.json')
GRADES = {'6', '7', '8', '9'}


def norm(s):
    return ' '.join(unicodedata.normalize('NFC', s).replace('\u00a0', ' ').split())


def parse(path):
    """Trả về {khối: [dòng]} theo thứ tự trong file."""
    out, grade = {}, None
    with io.open(path, encoding='utf-8') as f:
        lines = f.read().splitlines()
    in_block = False
    for ln, line in enumerate(lines, 1):
        m = re.match(r'^##\s+.*\blớp\s+(\d)\s*$', line)
        if m and not in_block:
            grade = m.group(1)
            continue
        if line.strip() == '```tsv':
            in_block = True
            continue
        if in_block and line.strip() == '```':
            in_block = False
            continue
        if not in_block or line.startswith('Môn\t'):
            continue
        if grade not in GRADES:
            sys.exit(f'{path}:{ln}: khối TSV nằm ngoài mục "lớp 6–9".')
        cols = line.split('\t')
        if len(cols) != 5:
            sys.exit(f'{path}:{ln}: cần 5 cột, có {len(cols)}.')
        try:
            week, tiet, num = int(cols[1]), int(cols[2]), int(cols[3])
        except ValueError:
            sys.exit(f'{path}:{ln}: tuần/tiết/PPCT phải là số nguyên.')
        out.setdefault(grade, []).append([norm(cols[0]), week, tiet, num, norm(cols[4])])
    return out


def main(paths):
    with io.open(target, encoding='utf-8') as f:
        data = json.load(f)
    for path in paths:
        for grade, rows in parse(path).items():
            subjects = {r[0] for r in rows}
            kept = [r for r in data.get(grade, []) if r[0] not in subjects]
            data[grade] = kept + rows
            for s in sorted(subjects):
                print(f'lớp {grade} · {s}: {sum(1 for r in rows if r[0] == s)} dòng')
    data = {k: data[k] for k in sorted(data)}
    with io.open(target, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print({k: len(v) for k, v in data.items()})


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
