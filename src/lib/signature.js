// Ảnh chữ ký: đọc data URL để chèn vào file xuất, và thu nhỏ ảnh tải lên (canvas, chỉ chạy trên trình duyệt).

export const SIGNATURE_MAX_BYTES = 300 * 1024; // file gốc giáo viên tải lên
export const SIGNATURE_MAX_WIDTH = 400; // px, sau khi thu nhỏ
export const SIGNATURE_ROLES = [
  { key: 'teacher', label: 'Giáo viên' },
  { key: 'leader', label: 'Tổ trưởng chuyên môn' },
];

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Kích thước ảnh PNG/JPEG đọc từ phần đầu file; null nếu không nhận ra. */
export function imageSize(bytes, type) {
  if (type === 'png') {
    if (bytes.length < 24) return null;
    const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
    return { width: u32(16), height: u32(20) };
  }
  // JPEG: tìm marker SOF0..SOF15 (trừ DHT C4, JPG C8, DAC CC).
  let o = 2;
  while (o + 9 < bytes.length) {
    if (bytes[o] !== 0xff) return null;
    const marker = bytes[o + 1];
    const len = (bytes[o + 2] << 8) | bytes[o + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: (bytes[o + 7] << 8) | bytes[o + 8], height: (bytes[o + 5] << 8) | bytes[o + 6] };
    }
    o += 2 + len;
  }
  return null;
}

/**
 * Ảnh chữ ký sẽ chèn vào file xuất, hoặc null (để trống chỗ ký tay).
 * Chỉ trả ảnh khi giáo viên bật "Chèn chữ ký" và đã tải ảnh hợp lệ.
 */
export function signatureImage(sig) {
  if (sig?.enabled !== true || typeof sig.image !== 'string') return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(sig.image);
  if (!m) return null;
  const type = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  try {
    const data = base64ToBytes(m[2]);
    const dim = imageSize(data, type);
    if (!dim?.width || !dim?.height) return null;
    return { type, data, dataUrl: sig.image, ...dim };
  } catch {
    return null;
  }
}

/** Co ảnh vào khung maxW × maxH, giữ đúng tỉ lệ. */
export function fitBox(img, maxW, maxH) {
  const k = Math.min(maxW / img.width, maxH / img.height);
  return { width: Math.round(img.width * k), height: Math.round(img.height * k) };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh.')); };
    img.src = url;
  });
}

/**
 * Chuẩn bị ảnh chữ ký tải lên: kiểm tra định dạng/dung lượng, làm nền trắng trong suốt,
 * cắt sát nét chữ ký, thu nhỏ còn tối đa 400px chiều rộng. Trả về data URL PNG.
 */
export async function prepareSignature(file) {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Chỉ nhận ảnh PNG hoặc JPG.');
  if (file.size > SIGNATURE_MAX_BYTES) throw new Error('Ảnh quá lớn, tối đa 300 KB.');
  const img = await loadImage(file);
  const src = document.createElement('canvas');
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, src.width, src.height);
  const d = px.data;

  // Nền trắng/sáng → trong suốt (mờ dần ở vùng gần trắng để nét không bị răng cưa), đồng thời tìm khung chứa nét.
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const light = Math.min(d[i], d[i + 1], d[i + 2]);
    if (light >= 235) d[i + 3] = 0;
    else if (light >= 190) d[i + 3] = Math.round((d[i + 3] * (235 - light)) / 45);
    if (d[i + 3] > 24) {
      const p = i / 4;
      const x = p % src.width;
      const y = (p - x) / src.width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('Ảnh không có nét chữ ký (toàn nền trắng).');
  ctx.putImageData(px, 0, 0);

  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  const w = Math.min(src.width, x1 + pad + 1) - x0;
  const h = Math.min(src.height, y1 + pad + 1) - y0;
  const k = Math.min(1, SIGNATURE_MAX_WIDTH / w);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(w * k));
  out.height = Math.max(1, Math.round(h * k));
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
