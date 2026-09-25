# Kế hoạch giảng dạy — ứng dụng web thay thế file Excel

Ứng dụng React (tiếng Việt) giúp giáo viên tiểu học lập **Kế hoạch giảng dạy** từ thời khóa biểu và phân phối chương trình (PPCT), thay cho file Excel `LBG_NH_26-27 (Gấm 4A).xls`.

## Chạy ứng dụng

Ứng dụng gồm **frontend** (React + Vite, thư mục gốc) và **backend** (Node.js + Express + Prisma, thư mục `server/`). Phải đăng nhập mới dùng được trang lập kế hoạch, nên khi phát triển cần chạy cả hai.

Cần **Node.js 22.9 trở lên**.

### Cài đặt lần đầu

```bash
# 1. Frontend
npm install

# 2. Backend
cd server
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Mở `server/.env` và điền **`JWT_SECRET`** (tối thiểu 32 ký tự ngẫu nhiên). Có thể tạo nhanh bằng lệnh:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sau đó tạo database SQLite (`server/prisma/dev.db`) bằng lệnh:

```bash
npx prisma migrate dev      # vẫn trong thư mục server/
```

Tạo **tài khoản quản trị đầu tiên**: điền `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PHONE` trong `server/.env` rồi chạy:

```bash
npm run db:seed             # vẫn trong thư mục server/
```

- Nếu `ADMIN_USERNAME` là tài khoản **đã có** (ví dụ tài khoản vừa tự đăng ký), script chỉ nâng quyền lên ADMIN và giữ nguyên mật khẩu, nên chỉ cần điền mỗi `ADMIN_USERNAME`.
- Muốn đổi luôn mật khẩu thì đặt thêm `ADMIN_RESET_PASSWORD=true` và `ADMIN_PASSWORD`.
- Chạy lại nhiều lần vẫn an toàn. Tạo xong nên xóa `ADMIN_PASSWORD` khỏi `.env`.

> npm 11 chặn script cài đặt của thư viện ngoài. Các gói cần script (Prisma, bcrypt) đã được duyệt sẵn trong `server/package.json` (mục `allowScripts`). Nếu nâng cấp phiên bản các gói này, chạy `npm approve-scripts <tên gói>`.

### Chạy khi phát triển (mở 2 cửa sổ terminal)

```bash
npm run dev:api   # backend: http://localhost:4000/api (tự khởi động lại khi sửa code)
npm run dev       # frontend: http://localhost:5173
```

Vite chuyển mọi request `/api` sang `localhost:4000`. Nhờ vậy frontend và API cùng origin, cookie đăng nhập (httpOnly) hoạt động mà không cần cấu hình CORS.

### Các lệnh khác

```bash
npm run build     # đóng gói frontend vào dist/
npm test          # kiểm thử logic, xuất Word/Excel, validate form
npm run test:api  # kiểm thử API (dùng database riêng server/prisma/test.db, không đụng dev.db)
cd server && npx prisma studio   # xem/sửa database bằng giao diện web
```

### Triển khai

Hướng dẫn từng bước cho người không chuyên (Render + Neon, tên miền, cập nhật, sao lưu): [docs/DEPLOY.md](docs/DEPLOY.md).

- **Một cổng duy nhất (khuyên dùng):** `npm run build`, rồi trong `server/.env` đặt `SERVE_CLIENT=true`, `NODE_ENV=production` và chạy `npm start` trong `server/`. Backend phục vụ luôn thư mục `dist/`.
- **Render + Neon (PostgreSQL):** file `render.yaml` ở gốc repo cấu hình sẵn. Tạo database trên Neon, lấy chuỗi kết nối loại *direct* (host không có `-pooler`). Trên Render chọn **New → Blueprint** → repo này, điền `DATABASE_URL` và các biến còn lại. Mỗi lần build sẽ tự chạy migration và `db:seed`.
- **PostgreSQL:** dev/test vẫn dùng SQLite (`prisma/schema.prisma`). Bản PostgreSQL nằm ở `server/prisma/postgres/`: `schema.prisma` sinh tự động bằng `npm run db:pg:schema`, migrations riêng trong `postgres/migrations/`. `npm run db:pg:deploy` = sinh schema + `prisma generate` + `prisma migrate deploy` cho PostgreSQL.
  - Khi sửa `schema.prisma`: ngoài `npm run db:migrate` cho SQLite, chạy `npm run db:pg:schema` rồi `npx prisma migrate dev --create-only --schema prisma/postgres/schema.prisma --name <tên>` với `DATABASE_URL` trỏ tới một database PostgreSQL thử (ví dụ một branch Neon), để tạo migration PostgreSQL tương ứng. Sau đó chạy lại `npx prisma generate` để client local quay về SQLite.
- **Frontend và API khác domain:** đặt `CLIENT_ORIGIN=https://domain-frontend`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true` (bắt buộc HTTPS). Build frontend với `VITE_API_URL=https://domain-api/api`.
- **Sau proxy (Nginx, Render, Railway…):** đặt `TRUST_PROXY=1` để rate limit nhận đúng IP người dùng.
- Bộ đếm chống dò mật khẩu nằm trong bộ nhớ tiến trình. Nếu chạy nhiều instance backend, cần chuyển sang store dùng chung (Redis).
- **GitHub Pages** chỉ phục vụ web tĩnh nên không chạy được backend. Workflow `.github/workflows/deploy.yml` vẫn giữ nguyên (build với `VITE_BASE=/lichbaogiang/`), nhưng bản trên Pages sẽ không đăng nhập được.

Dữ liệu kế hoạch (TKB, lịch tuần, chỗ sửa tên bài…) vẫn **tự động lưu trong trình duyệt** (localStorage), không lưu lên server. Nên dùng nút *Tải file sao lưu* ở mục **Thông tin lớp** để giữ bản dự phòng hoặc chuyển sang máy khác.

## Tài khoản

- **Đăng ký** (`/dang-ky`) gồm các trường:
  - Tên đăng nhập: 4–20 ký tự, chữ không dấu, số, `_`; không phân biệt hoa/thường
  - Mật khẩu: ≥ 8 ký tự, có chữ và số, kèm ô nhập lại
  - Email
  - Số điện thoại di động Việt Nam: 10 số, đầu 03/05/07/08/09; chấp nhận nhập dạng `+84…` hoặc có dấu cách
  
  Tên đăng nhập, email và SĐT không được trùng với tài khoản khác. Luật kiểm tra nằm ở `shared/validation.js`, dùng chung cho frontend và backend.
- **Đăng nhập** (`/dang-nhap`) bằng tên đăng nhập và mật khẩu. Phiên đăng nhập là JWT trong cookie httpOnly, hết hạn sau `SESSION_DAYS` ngày.
- **Chống dò mật khẩu:** sai quá `LOGIN_MAX_FAILS_PER_ACCOUNT` lần với một tài khoản, hoặc `LOGIN_MAX_FAILS_PER_IP` lần từ một IP, trong `LOGIN_WINDOW_MINUTES` phút thì bị chặn tạm thời.
- **Tài khoản bị khóa:** không đăng nhập được và thấy lý do khóa. Nếu đang đăng nhập thì bị đăng xuất ở lần gọi API tiếp theo.
- Header hiển thị tên người dùng, số lượt xuất file miễn phí còn lại và số điểm.

### API

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký và đăng nhập luôn |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Đăng xuất |
| GET | `/api/auth/me` | Người dùng hiện tại (`user: null` nếu chưa đăng nhập) |
| GET | `/api/settings/public` | Giá xuất file, tỷ lệ nạp, nạp điểm đã bật chưa |
| POST | `/api/exports/authorize` | `{ fileType: 'DOCX'\|'XLSX', confirmCost, description }` → trừ lượt/điểm, trả `exportId` |
| POST | `/api/exports/:id/complete` | Báo đã tạo file thành công |
| POST | `/api/exports/:id/refund` | Tạo file lỗi → hoàn lại lượt/điểm (chỉ một lần, trong 15 phút) |
| GET | `/api/exports` | Lịch sử xuất file của mình (`?page=`) |
| POST | `/api/topups` | `{ amountVnd }` → tạo yêu cầu nạp, trả mã chuyển khoản và link QR |
| GET | `/api/topups` | Lịch sử nạp của mình (`?page=&status=PENDING`) |
| POST | `/api/topups/:id/cancel` | Hủy yêu cầu đang chờ duyệt |

Mọi request ghi dữ liệu phải gửi `Content-Type: application/json` (chống CSRF). Lỗi trả về dạng `{ message, code, errors?, details? }`, trong đó `errors` là lỗi theo từng trường của form, còn `details` là dữ liệu kèm theo (ví dụ `{ cost, points }` khi không đủ điểm).

## Lượt xuất file và điểm

| Quy tắc | Mặc định | Tên cài đặt trong bảng `Setting` |
|---|---|---|
| Lượt xuất miễn phí cho tài khoản mới (Word hay Excel đều tính 1 lượt) | 5 | `freeExportsForNewUser` |
| Số điểm trừ mỗi lần xuất khi đã hết lượt miễn phí | 5 | `pointsPerExport` |
| Mệnh giá nạp (vừa là mức tối thiểu, vừa là bước nhảy) | 10.000đ | `topupUnitVnd` |
| Số điểm nhận được cho mỗi mệnh giá | 100 | `pointsPerUnit` |

Các giá trị trên được lưu trong database, lần chạy server đầu tiên sẽ ghi giá trị mặc định. Quản trị viên sửa các giá trị này ở trang **/admin/cai-dat**; thay đổi có hiệu lực ngay.

**Luồng xuất file:**

1. Bấm *Tải Word* / *Tải Excel*. Còn lượt miễn phí thì dùng luôn. Hết lượt thì hiện hộp xác nhận *"Lần xuất này sẽ trừ 5 điểm, bạn còn X điểm. Tiếp tục?"*. Không đủ điểm thì hiện hộp thoại hướng dẫn nạp điểm.
2. Frontend gọi `POST /api/exports/authorize`. Server trừ lượt/điểm trong một transaction bằng câu lệnh có điều kiện (`… WHERE points >= 5`), nên bấm nhiều lần hay mở nhiều tab cũng không trừ sai và số dư không bao giờ âm. `confirmCost` là số điểm người dùng đã đồng ý trả. Nếu thực tế phải trừ khác đi (ví dụ vừa dùng hết lượt miễn phí ở tab khác, hoặc admin vừa đổi giá), server trả lỗi 409 `CONFIRM_REQUIRED` để giao diện hỏi lại.
3. Tạo file trên trình duyệt. Thành công thì gọi `/complete`; lỗi thì gọi `/refund` để hoàn lại đúng phần đã trừ.

*Giới hạn đã biết:* file vẫn được tạo trên trình duyệt, nên người rành kỹ thuật có thể gọi thẳng hàm tạo file mà không qua bước trừ lượt. Muốn chặn tuyệt đối thì phải chuyển việc tạo file sang server.

**Nạp điểm (duyệt thủ công):**

1. Điền thông tin ngân hàng nhận tiền vào `server/.env`: `BANK_ID` (mã BIN hoặc tên viết tắt theo [danh sách VietQR](https://api.vietqr.io/v2/banks)), `BANK_NAME`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME`. Thiếu các biến này thì nút nạp bị tắt.
2. Người dùng vào `/nap-diem` và chọn số tiền. Hệ thống sinh mã nội dung chuyển khoản riêng (`KHBD` + 6 ký tự, bỏ các ký tự dễ nhầm như 0/O, 1/I/L) và hiện mã QR VietQR có sẵn số tiền và nội dung. Yêu cầu ở trạng thái *Chờ duyệt*; mỗi người có tối đa 3 yêu cầu chờ cùng lúc.
3. Quản trị viên duyệt hoặc từ chối yêu cầu ở trang **/admin/nap-diem**. Cũng có thể dùng script trong thư mục `server/`:

   ```bash
   npm run topup -- list                                  # các yêu cầu đang chờ
   npm run topup -- approve KHBDXXXXXX                    # duyệt → cộng điểm
   npm run topup -- reject KHBDXXXXXX "Chưa nhận được tiền"
   ```

   Duyệt hai lần cũng chỉ cộng điểm một lần.
4. Người dùng xem lịch sử nạp điểm và lịch sử xuất file ở `/lich-su`.

**Sổ cái `PointTransaction`:** mọi thay đổi điểm *và* lượt miễn phí đều ghi một dòng gồm: loại (`SIGNUP_BONUS`, `EXPORT`, `EXPORT_REFUND`, `TOPUP`, `ADMIN_ADJUST`, `FREE_RESET`), số điểm ±, số dư điểm sau giao dịch, số lượt ±, số lượt sau giao dịch, người thực hiện, thời gian và ghi chú. Toàn bộ logic nằm ở `server/src/services/points.js`.

> Khi dùng SQLite, backend chỉ mở **1 kết nối** tới database (`server/src/db.js`) để các transaction xếp hàng lần lượt. SQLite không cho nhiều transaction ghi chạy song song; nếu mở nhiều kết nối, các request đồng thời sẽ bị timeout. PostgreSQL không bị giới hạn này.

## Trang quản trị (/admin)

Chỉ tài khoản có role **ADMIN** mới vào được. Người thường vào `/admin` sẽ thấy trang "Không có quyền truy cập". Mọi API `/api/admin/*` cũng trả lỗi 403 (hoặc 401 nếu chưa đăng nhập), vì server tự kiểm tra quyền chứ không tin frontend. Code trang quản trị được tải riêng (lazy load), nên người dùng thường không phải tải phần này.

| Trang | Chức năng |
|---|---|
| **Tổng quan** `/admin` | Tổng người dùng; người dùng mới hôm nay / tuần này (tính theo giờ Việt Nam, tuần bắt đầu từ thứ Hai); tổng lượt xuất file (Word/Excel, miễn phí/trả phí); tổng tiền đã nạp; số yêu cầu nạp đang chờ; tổng điểm đang lưu hành. |
| **Người dùng** `/admin/nguoi-dung` | Tìm theo tên đăng nhập, email hoặc SĐT (gõ `0912 345` hay `84912…` đều được); lọc theo quyền và trạng thái; sắp xếp; phân trang. Bấm vào một dòng để xem chi tiết. |
| **Chi tiết người dùng** | Thông tin tài khoản, giao dịch / nạp / xuất file gần đây và các thao tác: **cộng/trừ điểm** (bắt buộc lý do, không trừ quá số dư), **đặt lại lượt miễn phí**, **đặt lại mật khẩu** (tự nhập, hoặc để hệ thống tạo mật khẩu tạm hiện một lần), **cấp/bỏ quyền quản trị**, **khóa/mở khóa** (khóa bắt buộc lý do). |
| **Duyệt nạp điểm** `/admin/nap-diem` | Mặc định hiện các yêu cầu chờ duyệt, cũ nhất lên trước. Nút **Duyệt** (hỏi xác nhận đã nhận tiền, rồi cộng điểm) và **Từ chối** (bắt buộc lý do, người dùng sẽ thấy lý do này). Tìm theo mã `KHBD…` hoặc người dùng. Số yêu cầu đang chờ hiện trên tab. |
| **Giao dịch** `/admin/giao-dich` | Sổ cái toàn hệ thống: lọc theo người dùng, loại giao dịch, khoảng ngày; kèm tổng điểm và tổng lượt của kết quả lọc. |
| **Xuất file** `/admin/xuat-file` | Lịch sử xuất file toàn hệ thống: lọc theo người dùng, loại file, hình thức (miễn phí/điểm), trạng thái, khoảng ngày. |
| **Cài đặt** `/admin/cai-dat` | Sửa số lượt miễn phí cho tài khoản mới, số điểm mỗi lần xuất, mệnh giá nạp, số điểm mỗi mệnh giá. Có phần xem trước người dùng sẽ thấy gì. |

Bộ lọc của các trang danh sách nằm trên URL (ví dụ `/admin/giao-dich?userId=5&from=2026-09-01`), nên có thể lưu hoặc gửi link cho nhau.

**Các ràng buộc an toàn:**

- Admin không tự khóa được mình và không tự bỏ quyền quản trị của mình. Hệ thống luôn còn ít nhất 1 admin.
- Khóa tài khoản, hoặc đặt lại mật khẩu, sẽ đăng xuất người đó khỏi mọi thiết bị ngay lập tức.
- Cộng/trừ điểm và đặt lại lượt miễn phí đều ghi vào sổ cái kèm tên admin thực hiện.
- Chưa có nhật ký riêng cho các thao tác khóa, đổi quyền hay đặt lại mật khẩu. Hiện chỉ lưu trạng thái cuối cùng (ví dụ lý do khóa).

API quản trị (tất cả yêu cầu role ADMIN):

| Phương thức | Đường dẫn |
|---|---|
| GET | `/api/admin/stats` · `/api/admin/topups/pending-count` |
| GET | `/api/admin/users?q=&role=&status=&sort=&page=` · `/api/admin/users/:id` |
| POST | `/api/admin/users/:id/lock` `{ locked, reason }` · `/reset-password` `{ password? }` · `/role` `{ role }` · `/points` `{ delta, reason }` · `/free-exports` `{ value?, reason? }` |
| GET | `/api/admin/topups?status=&q=&userId=&from=&to=` |
| POST | `/api/admin/topups/:id/approve` · `/api/admin/topups/:id/reject` `{ reason }` |
| GET | `/api/admin/transactions?q=&userId=&type=&from=&to=` · `/api/admin/exports?q=&userId=&fileType=&chargeType=&status=&from=&to=` |
| GET / PUT | `/api/admin/settings` (PUT `{ values: { pointsPerExport: 5, … } }`) |

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
  components/      WeekStrip, LessonSheet, ExportPanel, TimetableEditor, WeekCalendar, PpctTable, ClassInfo, UserBar…
  api/client.js    gọi API: gửi cookie, parse lỗi tiếng Việt
  auth/            AuthContext (người dùng đang đăng nhập, login/logout/register)
  routes/guards.jsx  RequireAuth, GuestOnly
  pages/           LoginPage, RegisterPage
    account/         AccountLayout, TopUpPage (nạp điểm + QR), HistoryPage (lịch sử nạp / xuất)
    admin/           AdminLayout (khung + bộ lọc dùng chung), Dashboard, Users, UserDetail, TopUps, Transactions, Exports, Settings
  lib/exportCharge.js  authorize → tạo file → complete / refund
shared/validation.js       luật kiểm tra form và số tiền nạp, dùng chung frontend + backend
server/
  prisma/schema.prisma     User, Setting, PointTransaction, ExportLog, TopUpRequest; migrations/ lưu lịch sử thay đổi
  src/
    config.js              đọc và kiểm tra .env
    app.js, index.js       khởi tạo Express
    middleware/            auth (đọc phiên), rateLimit, errors (lỗi JSON, chống CSRF)
    routes/                auth, settings, exports, topups
    routes/admin/          index (tổng quan, nạp, giao dịch, xuất file, cài đặt), users, shared
    services/points.js     MỌI thay đổi điểm/lượt: transaction + ghi sổ cái
    services/settings.js   đọc cài đặt từ bảng Setting
    lib/                   session (JWT + cookie), users, errors, bank (VietQR), paging
  prisma/seed.js           cài đặt mặc định + tài khoản admin đầu tiên (npm run db:seed)
  scripts/topup.js         duyệt / từ chối nạp điểm từ dòng lệnh
  tests/                   kiểm thử API (node:test + fetch)
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

- **Word (.docx):** A4 đứng, Times New Roman, mỗi tuần một trang (mỗi tuần là một section). Đầu trang có "KẾ HOẠCH GIẢNG DẠY", tuần – lớp – tên giáo viên, từ ngày … đến ngày …; bảng có gộp ô Thứ/Buổi. Cỡ chữ bảng tự chọn (12 → 7pt) theo số dòng và độ dài tên bài để vừa một trang.
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
