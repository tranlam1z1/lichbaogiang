// Gộp nhiều file giáo án .docx thành một file bằng altChunk: Word tự nhập từng file khi mở,
// nên giữ nguyên hình, bảng, đánh số của giáo án gốc mà không phải tự trộn XML.
import JSZip from 'jszip';
import { slugify } from './markdown.js';
import { foldVietnamese } from './text.js';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
// Kiểu part altChunk cho cả gói .docx: giống Open XML SDK (AlternativeFormatImportPartType.WordprocessingML) và docx4j.
const CHUNK_TYPE = `${DOCX_TYPE}.main+xml`;
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** parts: mảng Blob | ArrayBuffer | Uint8Array, mỗi phần là một file .docx hoàn chỉnh. Trả về Blob .docx. */
export async function buildLessonPlanDocx(parts) {
  if (!parts?.length) throw new Error('Chưa có giáo án nào để xuất.');
  const zip = new JSZip();
  const ids = parts.map((_, i) => `chunk${i + 1}`);

  for (const [i, p] of parts.entries()) {
    // Blob đọc sẵn thành ArrayBuffer: JSZip đọc Blob bằng FileReader, Node không có.
    zip.file(`word/${ids[i]}.docx`, typeof Blob !== 'undefined' && p instanceof Blob ? await p.arrayBuffer() : p);
  }

  zip.file('[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + `<Default Extension="docx" ContentType="${CHUNK_TYPE}"/>`
    + `<Override PartName="/word/document.xml" ContentType="${CHUNK_TYPE}"/>`
    + '</Types>');

  zip.file('_rels/.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/>`
    + '</Relationships>');

  zip.file('word/_rels/document.xml.rels', `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + ids.map((id) => `<Relationship Id="${id}" Type="${NS_R}/aFChunk" Target="${id}.docx" TargetMode="Internal"/>`).join('')
    + '</Relationships>');

  zip.file('word/document.xml', `${XML_HEAD}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>`
    + ids.map((id) => `<w:altChunk r:id="${id}"/>`).join(PAGE_BREAK)
    // A4 dọc, lề 2 cm (1134 twip); file gốc vẫn giữ section riêng của nó.
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>'
    + '</w:sectPr></w:body></w:document>');

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new Blob([bytes], { type: DOCX_TYPE });
}

/** "Giao-an-tuan-5-lop-1a.docx" — bỏ dấu cho tên file an toàn trên mọi máy. */
export function lessonPlanFileName(weekNum, className) {
  return `Giao-an-tuan-${weekNum}-${slugify(foldVietnamese(className))}.docx`;
}
