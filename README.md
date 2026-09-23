# Kế hoạch giảng dạy — ứng dụng web thay thế file Excel

Ứng dụng React (tiếng Việt) giúp giáo viên tiểu học lập **Kế hoạch giảng dạy** từ thời khóa biểu và phân phối chương trình (PPCT), thay cho file Excel `LBG_NH_26-27 (Gấm 4A).xls`.

## Chạy ứng dụng

Cần Node.js 18.19 trở lên.

```bash
npm install      # cài thư viện (lần đầu)
npm run dev      # chạy thử, mở địa chỉ hiện ra (thường là http://localhost:5173)
npm run build    # đóng gói vào thư mục dist/ (mở được trên mọi máy chủ web tĩnh)
npm run preview  # xem thử bản đã đóng gói
npm test         # chạy kiểm thử phần logic và xuất Word
```

Dữ liệu người dùng nhập được **tự động lưu trong trình duyệt** (localStorage). Nên dùng nút *Tải file sao lưu* ở mục **Thông tin lớp** để giữ bản dự phòng hoặc chuyển sang máy khác.

## Các mục

| Mục | Chức năng |
|---|---|
| Báo giảng | Chọn tuần (mặc định tuần hiện tại, tuần nghỉ hiện riêng, không chọn được), bảng báo giảng gộp ô Thứ/Buổi, sửa trực tiếp Tên bài và Đồ dùng (chỉ cho tuần đó, có vạch đỏ đánh dấu và nút *↺ Theo PPCT*), xuất Word/Excel theo phạm vi. |
| Thời khóa biểu | Lưới nhập môn có gợi ý từ PPCT, chọn số tiết sáng/chiều, học thứ 7; bảng đối chiếu số tiết mỗi môn với PPCT. |
| Lịch tuần | Sửa từng dòng (số tuần, ghi chú, học kì, từ ngày, đến ngày), thêm/xóa dòng, công cụ tạo lại cả năm. |
| Phân phối chương trình | Lọc theo khối, môn, tuần, tìm tên bài (không cần gõ dấu). Sửa tên bài thì mọi tuần đổi theo; có nút trả về bản gốc. |
| Thông tin lớp | Cơ quan chủ quản, trường, GVCN, năm học, khối, tên lớp; sao lưu / khôi phục .json; đặt lại như file gốc (có xác nhận). |

## Cách tra tên bài (giống công thức Excel)

1. Duyệt thời khóa biểu theo thứ tự thứ 2 → thứ 6 (hoặc thứ 7), sáng rồi chiều.
2. Đếm số lần mỗi môn xuất hiện → "tiết thứ" của môn trong tuần.
3. Khóa tra cứu = tuần + môn + tiết thứ → số tiết PPCT và tên bài.
4. Không tìm thấy thì hiện cảnh báo nhỏ thay vì `#N/A`, ví dụ *"PPCT tuần 3 chỉ có 1 tiết môn này"* hoặc *"Môn này không có trong PPCT lớp 4"*.

Môn "CHÀO CỜ" không tra PPCT (giống file Excel). Ô thời khóa biểu chỉ chứa dấu cách được coi là ô trống.

## Cấu trúc mã nguồn

```
src/
  data/            ppct.json (5 khối), calendar.json (lịch tuần), defaults.json (TKB, thông tin lớp)
  lib/             Logic thuần, KHÔNG phụ thuộc React
    text.js          chuẩn hóa tên môn, bỏ dấu để tìm kiếm
    calendar.js      ngày tháng, tuần hiện tại, tạo lại cả năm, kiểm tra lịch
    ppct.js          chỉ mục PPCT, tra tên bài, số tiết/tuần
    schedule.js      dựng kế hoạch giảng dạy 1 tuần, gộp ô, đối chiếu TKB
    range.js         phạm vi xuất (tuần đang xem, HK I, HK II, cả năm, từ… đến…)
    exportDocx.js    tạo file Word (thư viện docx)
    exportXlsx.js    tạo file Excel (thư viện exceljs)
    download.js      tải file (file-saver) — được nạp khi cần để trang mở nhanh
  state/
    reducer.js       reducer thuần + khởi tạo/khôi phục trạng thái
    AppContext.jsx   useReducer + Context, tự lưu localStorage
  components/      WeekStrip, LessonSheet, ExportPanel, TimetableEditor, WeekCalendar, PpctTable, ClassInfo…
scripts/extract_excel.py   trích dữ liệu từ file Excel sang src/data/*.json
tests/                     kiểm thử bằng node:test
```

### Cập nhật dữ liệu từ file Excel mới

```bash
soffice --headless --convert-to xlsx "LBG.xls"   # file .xls cũ cần đổi sang .xlsx
pip install openpyxl
python scripts/extract_excel.py LBG.xlsx
```

Script đổi cột tuần/tiết sang số, bỏ khoảng trắng thừa, và khi trùng khóa (tuần + môn + tiết thứ) thì giữ dòng có tên bài.

## Xuất file

- **Word (.docx):** A4 đứng, Times New Roman, mỗi tuần một trang (mỗi tuần là một section). Đầu trang có cơ quan chủ quản, tên trường, năm học, học kì, "KẾ HOẠCH GIẢNG DẠY", tuần, lớp, từ ngày … đến ngày …; bảng có gộp ô Thứ/Buổi; cuối trang chỗ ký *Giáo viên chủ nhiệm* và họ tên. Cỡ chữ bảng tự chọn (12 → 7pt) theo số dòng và độ dài tên bài để vừa một trang.
- **Excel (.xlsx):** mỗi tuần một sheet "Tuần N", có viền, gộp ô, tự xuống dòng, in vừa 1 trang A4 đứng, lặp dòng tiêu đề.

## Kết quả kiểm tra trước khi giao

**1. So sánh tuần 1 với sheet LỊCH BÁO GIẢNG** (`tests/logic.test.js`): 35/35 dòng khớp môn; số tiết PPCT và tên bài khớp ở mọi dòng Excel có kết quả. Các chỗ khác biệt đều có chủ đích:

| Dòng Excel | Excel | Ứng dụng |
|---|---|---|
| 21 – Mĩ thuật (thứ 4) | `#N/A` | Cảnh báo "PPCT tuần 1 chỉ có 1 tiết môn này" |
| 24, 25 – chiều thứ 4 | `#N/A` (ô TKB chỉ có dấu cách) | Để trống |
| 32 – HĐTN (thứ 5) | Trống (ô đã mất công thức) | "Giữ gìn trường em xanh, sạch, đẹp" theo PPCT |
| 36 – Tiếng Anh (thứ 6) | `#N/A` | Cảnh báo "PPCT tuần 1 chỉ có 4 tiết môn này" |

**2. Xuất Word cả năm:** 35 tuần học → file 35 trang (kiểm bằng LibreOffice chuyển sang PDF), đã thử với PPCT lớp 1, 4 và 5. Với TKB hiện tại cỡ chữ bảng khoảng 9–9,5pt. *Hạn chế:* tuần có rất nhiều tiết (khoảng 45 tiết trở lên) kèm nhiều đồ dùng dạy học dài có thể tràn sang trang thứ hai.

**3. Thời khóa biểu không khớp PPCT lớp 4** (cũng hiện trong mục *Thời khóa biểu*):

| Môn | Trong TKB | PPCT/tuần | Kết quả |
|---|---|---|---|
| MĨ THUẬT | 2 | 1 | Thừa 1 tiết |
| TIẾNG ANH | 5 | 4 | Thừa 1 tiết |
| SINH HOẠT | 0 | 1 | Chưa xếp |
| LUYỆN TOÁN | 0 | 3 | Chưa xếp |
| HDHSTH | 0 | 3 | Chưa xếp |
| TỰ HỌC | 0 | 2 | Chưa xếp |
| HĐGD NGLL | 0 | 1 | Chưa xếp |
| HĐGD TẬP THỂ | 0 | 1 | Chưa xếp |

**4. Dữ liệu PPCT:** lớp 1: 1356 dòng, lớp 2: 1260, lớp 3: 1365, lớp 4: 1435, lớp 5: 1435. Đã loại 35 dòng Tin học lớp 4 trùng khóa (bản trùng không có tên bài) và 1 dòng Luyện TV lớp 1 trùng.

**5. Lịch tuần:** 39 dòng gồm 35 tuần học, 2 tuần nghỉ Tết, 1 tuần không đánh số cuối HK I và 1 tuần cuối năm. Tuần 33 (10/5–12/5) và 34 (13/5–15/5) là tuần rút gọn như trong file gốc; ứng dụng hiện ghi chú và ghi ngày lần lượt từ ngày bắt đầu (giống Excel), để trống ngày ở các buổi vượt quá ngày kết thúc.

**Lưu ý:** phần xuất Excel (`exportXlsx.js`) được viết theo API exceljs 4.x nhưng chưa chạy thử được trong môi trường phát triển (không cài được exceljs). Hãy thử *Tải Excel* một lần sau khi `npm install`; nếu có lỗi, thông báo sẽ hiện ngay dưới nút.
