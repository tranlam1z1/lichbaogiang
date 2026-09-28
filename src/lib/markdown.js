// Đọc Markdown (tập con đủ cho docs/HUONG_DAN_SU_DUNG.md) thành cây khối để React hiển thị.
// Hỗ trợ: tiêu đề, đoạn văn, danh sách (lồng nhau), trích dẫn >, bảng, đường kẻ ---, khối ```code```.
// Trong dòng: **đậm**, *nghiêng*, `code`, [chữ](link).

/** Tạo id cho tiêu đề giống GitHub, để link #muc-luc trong file .md vẫn chạy: "3. Bước 1 — Điền" → "3-bước-1--điền". */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const isBlank = (l) => !l.trim();
const indentOf = (l) => l.match(/^\s*/)[0].length;

/** Chữ trong dòng → mảng { type: 'text'|'strong'|'em'|'code'|'link', ... }. */
export function parseInline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'strong', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: 'em', children: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ type: 'code', text: m[3] });
    else out.push({ type: 'link', href: m[5], children: parseInline(m[4]) });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => parseInline(c.trim()));

function startsBlock(line) {
  return /^#{1,6}\s/.test(line) || /^-{3,}\s*$/.test(line) || /^>/.test(line) || /^\|/.test(line)
    || /^```/.test(line) || LIST_RE.test(line);
}

function parseList(lines, i) {
  const ordered = /\d/.test(lines[i].match(LIST_RE)[2]);
  const start = ordered ? parseInt(lines[i].match(LIST_RE)[2], 10) : 1;
  const items = [];
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || m[1].length > 0 || /\d/.test(m[2]) !== ordered) break;
    const width = m[1].length + m[2].length + 1;
    const body = [m[3]];
    i += 1;
    // Dòng thuộc mục này: thụt vào, hoặc dòng trống mà sau đó vẫn còn dòng thụt vào.
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        let j = i;
        while (j < lines.length && isBlank(lines[j])) j += 1;
        if (j < lines.length && indentOf(lines[j]) >= 2) {
          body.push('');
          i += 1;
          continue;
        }
        break;
      }
      if (indentOf(l) < 2) break;
      body.push(l.replace(new RegExp(`^ {0,${Math.max(width, 2)}}`), ''));
      i += 1;
    }
    items.push(parseBlocks(body));
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j += 1;
    const next = lines[j]?.match(LIST_RE);
    if (!next || next[1].length > 0 || /\d/.test(next[2]) !== ordered) break;
    i = j;
  }
  return [{ type: 'list', ordered, start, items }, i];
}

/** Mảng dòng → mảng khối. */
function parseBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
    } else if (/^```/.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      blocks.push({ type: 'code', text: code.join('\n') });
      i += 1;
    } else if (/^#{1,6}\s/.test(line)) {
      const [, hashes, text] = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
      blocks.push({ type: 'heading', level: hashes.length, id: slugify(text), children: parseInline(text) });
      i += 1;
    } else if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
    } else if (/^>/.test(line)) {
      const inner = [];
      while (i < lines.length && /^>/.test(lines[i])) inner.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', children: parseBlocks(inner) });
    } else if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const body = rows.slice(1).filter((r) => !/^\|?[\s:|-]+\|?$/.test(r.trim()));
      blocks.push({ type: 'table', head: splitRow(rows[0]), rows: body.map(splitRow) });
    } else if (LIST_RE.test(line) && indentOf(line) === 0) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
    } else {
      const text = [line.trim()];
      i += 1;
      while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) text.push(lines[i++].trim());
      blocks.push({ type: 'paragraph', children: parseInline(text.join(' ')) });
    }
  }
  return blocks;
}

/** Chuỗi Markdown → mảng khối. */
export function parseMarkdown(source) {
  return parseBlocks(String(source).replace(/\r\n?/g, '\n').split('\n'));
}
