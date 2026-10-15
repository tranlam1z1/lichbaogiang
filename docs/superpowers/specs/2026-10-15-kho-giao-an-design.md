# Kho giáo án và xuất giáo án theo tuần — thiết kế

Ngày: 2026-10-15

## Mục đích

Giáo viên đã có lịch báo giảng theo tuần (TKB + PPCT). Giờ họ muốn có **giáo án** (file Word nội dung từng bài) được xếp theo đúng thứ tự TKB của một tuần, rồi xuất **một file Word duy nhất** chứa toàn bộ giáo án tuần đó, để in hoặc nộp mà không phải ghép tay từng file.

## Mục tiêu

1. **Kho giáo án riêng của mỗi giáo viên.** Giáo viên tự tải file của mình lên.
2. **Tự khớp với TKB.** Mỗi file được gắn nhãn một lần. Sau đó app tự đặt file vào đúng tiết ở mọi tuần có bài đó.
3. **Xem độ phủ của một tuần.** Tiết nào đã có giáo án, tiết nào còn thiếu.
4. **Xuất một file Word cho cả tuần.** Giáo án xếp theo TKB. Có tính điểm.

## Không làm

- Không lưu file trên server. Không đồng bộ kho giữa các máy.
- Không nhận file `.doc` (Word 2003).
- Không soạn hoặc sửa nội dung giáo án trong app.
- Không có kho giáo án dùng chung do admin cung cấp.
- Không xuất nhiều tuần trong một lần.
- Không đảm bảo file xuất ra hiển thị đúng khi mở bằng WPS, Google Docs hay Word Online.

## Điều không được để xảy ra

- Giáo viên mất kho mà không hề được báo trước rằng kho chỉ nằm trong trình duyệt.
- Bị trừ điểm nhưng không nhận được file. Nếu tạo file lỗi thì phải hoàn điểm.
- File xuất ra làm hỏng định dạng giáo án gốc (hình, bảng, đánh số).
- Nhầm giá với nút tải lịch báo giảng hiện có.

## Ràng buộc

Đây là các quyết định của người dùng:

- **Nguồn file:** giáo viên tự tải lên, chỉ nhận `.docx`. Nếu chọn `.doc`, báo: "Mở file trong Word → Lưu thành → Word Document (.docx), rồi tải lại."
- **Nơi lưu:** chỉ trong trình duyệt của máy đang dùng (IndexedDB).
- **Một file chứa** một tiết của một môn, hoặc tất cả các tiết trong một tuần của một môn.
- **Cách gắn nhãn khi tải lên:** chọn môn, rồi chọn một trong hai: "Tiết PPCT số N" hoặc "Cả tuần số N". App tự đặt vào tuần và tiết tương ứng, dùng lại được sang năm sau.
- **Thứ tự trong file xuất:** theo TKB, Thứ Hai tiết 1, tiết 2… rồi Thứ Ba. File "cả tuần" đặt ở tiết đầu tiên của môn đó trong tuần, và chỉ xuất một lần.
- **Trùng nhãn trong một tuần:** cùng một môn trong một tuần vừa có file "cả tuần" vừa có file theo tiết. Người dùng phải **chọn một trong hai** nguồn cho môn đó trong tuần đó.
- **Phần mềm mở file:** Microsoft Word. Vì vậy gộp file bằng **altChunk**: Word tự ghép khi mở và giữ nguyên định dạng gốc.
- **Phí:**
  - Chỉ trừ điểm, **không dùng lượt miễn phí**.
  - Mỗi lần xuất đúng 1 tuần.
  - Thêm cài đặt admin mới "Điểm mỗi lần tải giáo án (1 tuần)", mặc định **10**.
  - Dùng luồng trừ điểm và hoàn điểm hiện có (`runChargedExport`).

## Giao diện

Phác thảo bởi agent ui-ux-designer.

### Vị trí

Thêm tab mới **"Kho giáo án"** (`id: 'plans'`) vào `TABS` trong [src/App.jsx](../../../src/App.jsx), ngay sau "Báo giảng". Tách riêng để không lẫn với nút tải báo giảng, vốn có giá khác và được dùng lượt miễn phí.

Tab có một `.seg` với hai chế độ:

**1. Theo tuần** (mặc định)

- Dùng lại `WeekStrip`, nên tuần đang chọn đồng bộ với tab Báo giảng.
- Danh sách dòng lấy từ `flattenWeek(buildWeekLessons(...))`, giống hệt bảng báo giảng.
- Mỗi dòng hiện: thứ, tiết, môn, số PPCT, tên bài và trạng thái giáo án. Trạng thái là một trong:
  - `✓ tên file`
  - `✓ trong file cả tuần`
  - `✕ Chưa có [Tải lên]`. Nút Tải lên gắn sẵn môn và số PPCT.
  - `Cần chọn`: trùng nhãn, xem mục bên dưới.
- Các tiết sau **không tính** vào độ phủ: ô trống, môn giáo viên không dạy (`notTaught`), môn thuộc `SKIP_LOOKUP_SUBJECTS`.
- Đầu tuần hiện: "18/25 tiết có giáo án · 7 tiết thiếu", kèm nút **"Tải giáo án tuần N (Word) · X điểm"**.

**2. Tất cả file**

- Lọc theo môn, tìm theo tên file.
- Mỗi file hiện: tên, môn, "Tiết PPCT N" hoặc "Cả tuần N", tên bài PPCT.
- Thao tác: Sửa nhãn, Thay file, Xóa (`ConfirmDialog` kiểu danger).
- Dòng tổng: số file và dung lượng.

### Trùng nhãn: chọn một trong hai

Tình huống: trong tuần N, môn M vừa có file "cả tuần N" vừa có ít nhất một file theo tiết khớp với tiết của M trong tuần đó.

- Các dòng của M hiện trạng thái **"Cần chọn"**, kèm một lựa chọn: "Dùng file cả tuần «x.docx»" hoặc "Dùng file theo tiết".
- Lựa chọn lưu theo `(khối, tuần, môn)` trong IndexedDB.
- Chọn **file cả tuần**: bỏ qua các file theo tiết của M trong tuần đó.
- Chọn **file theo tiết**: bỏ qua file cả tuần. Các tiết của M chưa có file riêng sẽ thành "Chưa có".
- Khi còn môn "Cần chọn", **nút xuất bị khóa** và có ghi chú chỉ ra môn nào cần chọn.

### Tải lên và gắn nhãn

- Dùng input file ẩn kích hoạt qua nút (`accept=".docx" multiple`), giống `TimetableImport.jsx`.
- Tải một hay nhiều file đều mở **`FormDialog` gắn nhãn**:
  - Mỗi file một dòng: Môn, Gắn với (Tiết PPCT / Cả tuần), Số, và cột Kiểm tra.
  - Cột Kiểm tra hiện tên bài PPCT, hoặc số tiết của môn trong tuần đó.
  - Có ô "Đặt môn cho tất cả" để gán nhanh.
- **Đoán sẵn từ tên file:**
  - Bỏ dấu tên file, rồi khớp tên môn có trong PPCT của khối.
  - "tiet 16" hoặc "t16" → Tiết PPCT 16.
  - "tuan 4" hoặc "tuan4" → Cả tuần 4.
  - Đoán không ra thì để trống. Dòng thiếu thông tin là lỗi, nút Lưu bị khóa cho tới khi sửa.
- **Khối lớp** lấy từ hồ sơ đang mở. Kho lọc theo khối.
- **Trùng nhãn với file đã có trong kho** (cùng khối, môn, loại, số): báo ngay trên dòng "Đã có «cu.docx», file mới sẽ thay file cũ".
- **Trùng nhãn giữa hai file trong cùng đợt tải:** là lỗi, phải sửa mới lưu được.
- **Giới hạn:** mỗi file tối đa 20 MB.
- **Hết chỗ lưu** (`QuotaExceededError`): hiện `banner-alert` "Trình duyệt hết chỗ lưu. Xóa bớt giáo án cũ rồi thử lại."
- Khi lưu lần đầu, gọi `navigator.storage.persist()`.

### Cảnh báo lưu trữ

`banner-note` luôn hiện và không tắt được:

> "File giáo án chỉ lưu trên trình duyệt này của máy này. Không tự sang máy khác, và sẽ mất nếu xóa dữ liệu duyệt web. Hãy giữ bản gốc."

### Hộp xác nhận khi xuất

Dùng `FormDialog` nhỏ, không dùng `ExportDialog`. Hộp hiện:

- Số file sẽ gộp.
- Cảnh báo số tiết còn thiếu, nếu có.
- Giá và số dư: "10 điểm · Bạn có 120 → còn 110".
- Ghi chú: "Giáo án không dùng lượt miễn phí" và "Mở bằng Microsoft Word trên máy tính".

Không đủ điểm thì nút đổi thành "Nạp điểm". Tuần chưa có file nào thì nút xuất bị khóa.

### Trợ năng

- Mọi input trong bảng gắn nhãn có `aria-label` kèm tên file.
- Trạng thái luôn có chữ, không chỉ dựa vào màu.
- Kết quả và lỗi dùng `role="status"` hoặc `role="alert"`.
- Đóng dialog thì trả focus về nút đã mở nó.

### Tái sử dụng

- Thành phần: `WeekStrip`, `FormDialog`, `ConfirmDialog`.
- CSS: `.card`, `.data-table`, `.table-scroll`, `.pill-*`, `.banner-note`, `.banner-alert`, `.seg`, `.btn-*`, `.empty`.
- Không thêm token màu mới.

## Dữ liệu (IndexedDB, phía trình duyệt)

| Store | Khóa | Nội dung |
|---|---|---|
| Kho file | id | `{ grade, subject, kind: 'lesson'\|'week', num, fileName, size, blob, addedAt }`. Duy nhất theo `(grade, subject, kind, num)`. |
| Lựa chọn trùng | `(grade, week, subject)` | `'week'` hoặc `'lesson'` |

Cách khớp:

- **File theo tiết:** khớp với dòng có `row.subject === subject` và `row.ppct == num`.
- **File cả tuần:** khớp khi `week.num === num`.

Các giá trị này lấy từ `buildWeekLessons` trong [src/lib/schedule.js](../../../src/lib/schedule.js).

## Xuất file

- Tạo `.docx` trên trình duyệt bằng JSZip. Gói này đã có trong `node_modules` (phụ thuộc gián tiếp của exceljs); cần thêm vào `dependencies` của `package.json`, không phải tải gói mới.
- Mỗi giáo án là một part `altChunk` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml`), nhúng nguyên file `.docx` gốc.
- Giữa các giáo án có ngắt trang.
- **Quyết định của tôi:** không chèn tiêu đề giữa các giáo án, vì file giáo án đã có tiêu đề riêng.
- Tên file tải về: `Giao-an-tuan-N-<lớp>.docx`, dùng `slugify` và `downloadDocx` sẵn có nếu phù hợp.
- Tiết thiếu giáo án thì bỏ qua, không chèn trang trống.

## Server: tính điểm

- `FILE_TYPES` trong `server/src/services/points.js`: thêm `LESSON_PLAN: 'Giáo án Word'`. Cột `ExportLog.fileType` là String, nên **không cần migration**.
- `SETTING_DEFS`: thêm `pointsPerLessonPlanExport` (mặc định 10, min 0, nhãn "Điểm mỗi lần tải giáo án (1 tuần)"). `ensureDefaultSettings` tự tạo, và trang Admin Settings tự hiện vì đọc từ `SETTING_DEFS`. Cần kiểm tra lại điều này khi làm.
- Trong `authorizeExport`, khi `fileType === 'LESSON_PLAN'`:
  - bắt buộc `weeks === 1`;
  - giá = `pointsPerLessonPlanExport`;
  - **bỏ qua lượt miễn phí**.
- Giá hiển thị phía frontend phải khớp giá server. Nếu lệch, server trả 409 `CONFIRM_REQUIRED` như hiện tại.
- Sửa thông báo lỗi `fileType` cho đúng ba loại.
- Cần test server: tính đúng giá, không trừ lượt miễn phí dù còn lượt, từ chối `weeks > 1`.

## Test

Tự động:

- **Logic khớp file** (`tests/`): chọn nguồn khi trùng nhãn, thứ tự theo TKB, file cả tuần chỉ xuất một lần, bỏ qua tiết không tính.
- **Đoán nhãn từ tên file.**
- **Gộp altChunk:** file tạo ra là zip hợp lệ, có đủ các part, `[Content_Types].xml` và rels đúng.

Thủ công: mở file xuất bằng Microsoft Word, kiểm tra hình, bảng và đánh số còn nguyên.

## Để builder tự quyết

- Dùng `idb` thủ công hay viết wrapper nhỏ. Ưu tiên API IndexedDB gốc, không thêm thư viện.
- Cấu trúc component trong tab.
- Thay file: giữ nhãn cũ, chỉ đổi blob.
- Câu chữ của thông báo, miễn là giữ đúng ý ở trên.

## Phần tùy chọn, không làm ở bản đầu

Kéo thả file; pill độ phủ trong tab Báo giảng; lọc "chỉ tiết thiếu"; xóa nhiều file cùng lúc; tải lại file gốc từ kho về máy.
