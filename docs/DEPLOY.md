# Hướng dẫn đưa web lên Internet (Render + Neon)

Tài liệu này hướng dẫn từng bước, không cần biết lập trình. Làm lần lượt từ trên xuống.

**Mô hình:**

```
Người dùng ──HTTPS──▶  Render (1 dịch vụ: giao diện + API)  ──▶  Neon (database PostgreSQL)
                        https://lichbaogiang.onrender.com
```

- **Render** chạy cả giao diện (frontend) lẫn máy chủ (backend) ở **cùng một địa chỉ** → đăng nhập bằng cookie hoạt động tốt trên mọi trình duyệt, kể cả iPhone.
- **Neon** giữ dữ liệu: tài khoản, điểm, lịch sử xuất file, yêu cầu nạp tiền.
- Chi phí: **0đ** với gói miễn phí.

> **Kế hoạch giảng dạy của giáo viên (TKB, lịch tuần…) KHÔNG nằm trên server** — nó lưu trong trình duyệt của từng người. Server chỉ giữ tài khoản và điểm.

---

## Mục lục

1. [Chuẩn bị](#1-chuẩn-bị)
2. [Tạo database trên Neon](#2-tạo-database-trên-neon)
3. [Tạo web trên Render](#3-tạo-web-trên-render)
4. [Kiểm tra web đã chạy](#4-kiểm-tra-web-đã-chạy)
5. [Gắn tên miền riêng (tùy chọn)](#5-gắn-tên-miền-riêng-tùy-chọn)
6. [Cập nhật khi sửa code](#6-cập-nhật-khi-sửa-code)
7. [Sao lưu và khôi phục database](#7-sao-lưu-và-khôi-phục-database)
8. [Lưu ý về gói miễn phí](#8-lưu-ý-về-gói-miễn-phí)
9. [Xử lý sự cố thường gặp](#9-xử-lý-sự-cố-thường-gặp)
10. [Phụ lục: bảng biến môi trường](#10-phụ-lục-bảng-biến-môi-trường)

---

## 1. Chuẩn bị

Cần có:

- [ ] Tài khoản **GitHub**, và code mới nhất đã được đẩy (push) lên nhánh `main`.
      Trong VS Code: mở tab **Source Control** (biểu tượng nhánh cây bên trái) → gõ mô tả → bấm **Commit** → bấm **Sync Changes**.
- [ ] Một **email** để đăng ký Neon và Render (có thể đăng nhập thẳng bằng GitHub).
- [ ] Chuẩn bị sẵn thông tin **tài khoản quản trị** đầu tiên:
  - Tên đăng nhập: 4–20 ký tự, chữ không dấu, số hoặc `_`. VD: `quantri`
  - Mật khẩu: ít nhất 8 ký tự, có cả chữ và số.
  - Email và số điện thoại (10 số, bắt đầu 03/05/07/08/09) — **không được trùng** với tài khoản khác.
- [ ] Thông tin **tài khoản ngân hàng nhận tiền nạp điểm** (nếu dùng tính năng nạp điểm):
  - Mã ngân hàng: xem tại <https://api.vietqr.io/v2/banks> (cột `bin` hoặc `shortName`), VD `970436` hoặc `vietcombank`.
  - Số tài khoản, tên chủ tài khoản **VIẾT HOA KHÔNG DẤU** như trên app ngân hàng.

---

## 2. Tạo database trên Neon

1. Vào <https://neon.tech> → **Sign up** → chọn **Continue with GitHub**.
2. Tạo project mới (**New Project**):
   - **Project name:** `lichbaogiang`
   - **Postgres version:** để mặc định (17).
   - **Region:** chọn **AWS Asia Pacific (Singapore)** — gần Việt Nam và cùng khu vực với Render.
   - Bấm **Create project**.
3. Ở màn hình **Connection Details** (hoặc nút **Connect** trên Dashboard):
   - **Tắt** công tắc **Connection pooling** (để lấy chuỗi *direct* — host **không** có chữ `-pooler`).
   - Bấm **Copy** chuỗi kết nối. Nó có dạng:

     ```
     postgresql://neondb_owner:MAT_KHAU@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
     ```

   - Kiểm tra cuối chuỗi có `?sslmode=require`. Nếu chưa có thì tự thêm vào.
4. Dán chuỗi này tạm vào Notepad — dùng ở bước 3.

> 🔒 Chuỗi này chứa **mật khẩu database**. Không gửi cho ai, không dán vào code, không đưa lên GitHub.

---

## 3. Tạo web trên Render

Repo đã có sẵn file `render.yaml` mô tả cách build/chạy, nên Render tự cấu hình gần hết.

1. Vào <https://render.com> → **Get Started** → **Sign in with GitHub**. Cho phép Render đọc repo `lichbaogiang`.
2. Trên Dashboard bấm **New +** → **Blueprint**.
3. Chọn repo **lichbaogiang** → **Connect**.
4. Render đọc `render.yaml` và hiện danh sách biến cần điền. Điền như sau:

   | Biến | Điền gì | Bí mật? |
   |---|---|---|
   | `DATABASE_URL` | Chuỗi Neon đã copy ở bước 2 | 🔒 |
   | `ADMIN_USERNAME` | Tên đăng nhập admin, VD `quantri` | |
   | `ADMIN_PASSWORD` | Mật khẩu admin | 🔒 |
   | `ADMIN_EMAIL` | Email admin | |
   | `ADMIN_PHONE` | SĐT admin, VD `0912345678` | |
   | `BANK_ID` | Mã ngân hàng, VD `970436` | |
   | `BANK_NAME` | Tên hiển thị, VD `Vietcombank` | |
   | `BANK_ACCOUNT_NO` | Số tài khoản nhận tiền | |
   | `BANK_ACCOUNT_NAME` | Tên chủ TK viết hoa không dấu | |

   Các biến khác (`JWT_SECRET`, `NODE_ENV`, `SERVE_CLIENT`…) Render **tự điền** — không cần đụng. `JWT_SECRET` được Render tự sinh ngẫu nhiên.

5. Bấm **Apply** (hoặc **Deploy Blueprint**).
6. Render bắt đầu build (khoảng 3–6 phút). Mỗi lần build nó tự động:
   - cài thư viện, build giao diện,
   - tạo/cập nhật bảng trong database Neon (`db:pg:deploy`),
   - tạo cài đặt mặc định và tài khoản admin (`db:seed`).
7. Theo dõi ở tab **Logs**. Khi thấy dòng `API đang chạy tại ...` và trạng thái **Live** màu xanh là xong.
8. Địa chỉ web nằm ở đầu trang dịch vụ, dạng `https://lichbaogiang.onrender.com` (có thể có thêm đuôi ngẫu nhiên nếu tên đã bị người khác dùng).

**Sau khi đăng nhập admin thành công lần đầu** (bước 4): vào **Environment** trên Render → **xóa biến `ADMIN_PASSWORD`** → **Save**. Tài khoản admin vẫn giữ nguyên mật khẩu, chỉ là mật khẩu không còn nằm trên Render nữa.

> Muốn **đổi** biến sau này: Render → chọn dịch vụ `lichbaogiang` → **Environment** → sửa → **Save Changes**. Render tự khởi động lại.

---

## 4. Kiểm tra web đã chạy

Thay `https://lichbaogiang.onrender.com` bằng địa chỉ thật của bạn:

1. Mở `https://lichbaogiang.onrender.com/api/health` → phải thấy:

   ```json
   {"ok":true}
   ```

2. Mở `https://lichbaogiang.onrender.com` → thấy giao diện ứng dụng.
3. Vào **Đăng nhập** bằng tài khoản admin đã khai báo → vào được trang `/admin`.
4. Mở **cửa sổ ẩn danh**, **đăng ký** một tài khoản thử → kiểm tra có lượt xuất miễn phí, thử xuất 1 file Word.
5. (Nếu dùng nạp điểm) vào trang **Nạp điểm** → mã QR hiện đúng tên ngân hàng, số tài khoản.
6. Thử trên **điện thoại** (cả Safari trên iPhone) — đăng nhập, tải lại trang vẫn còn đăng nhập.

> Lần đầu mở sau một lúc lâu không ai dùng, web có thể **chờ 30–60 giây** mới hiện — đó là gói miễn phí "thức dậy", không phải lỗi (xem [mục 8](#8-lưu-ý-về-gói-miễn-phí)).

**Theo dõi tự động (khuyên dùng, miễn phí):** đăng ký <https://uptimerobot.com>, thêm monitor kiểu **HTTP(s)** trỏ tới `.../api/health`, chu kỳ 5 phút → web sập sẽ có email báo.

---

## 5. Gắn tên miền riêng (tùy chọn)

Ví dụ muốn dùng `khbd.vn` và `www.khbd.vn`.

1. **Mua tên miền** tại một nhà cung cấp: Mắt Bão, PA Việt Nam, Tenten, iNET (tên miền `.vn`), hoặc Cloudflare, Namecheap (`.com`). Giá khoảng 300k/năm với `.com`, `.vn` đắt hơn.
2. Trên Render: dịch vụ `lichbaogiang` → **Settings** → **Custom Domains** → **Add Custom Domain** → nhập `www.khbd.vn` → **Save**. Làm tiếp với `khbd.vn`.
3. Render hiện các **bản ghi DNS** cần thêm. Vào trang quản lý tên miền (nơi đã mua) → mục **Quản lý DNS / DNS Records**, thêm **đúng như Render hiển thị**, thường là:

   | Loại | Tên (Host) | Giá trị |
   |---|---|---|
   | `CNAME` | `www` | `lichbaogiang.onrender.com` |
   | `A` | `@` | địa chỉ IP Render hiển thị (VD `216.24.57.1`) |

4. Quay lại Render bấm **Verify**. DNS có thể mất từ vài phút đến vài giờ để có hiệu lực.
5. Render **tự cấp HTTPS** (ổ khóa xanh) — không phải làm gì thêm.
6. **Không cần sửa code hay biến môi trường** — vì giao diện và API vẫn chung một địa chỉ.

---

## 6. Cập nhật khi sửa code

Render đã bật **tự động deploy**: mỗi lần code mới được đẩy lên nhánh `main` trên GitHub, Render tự build và chạy bản mới.

1. Sửa code trên máy, chạy thử (`npm run dev:api` và `npm run dev`).
2. Chạy kiểm thử: `npm test` và `npm run test:api` — tất cả phải **pass**.
3. Commit và push lên `main` (VS Code: Source Control → Commit → Sync Changes).
4. Vào Render → tab **Events** để theo dõi. Khoảng 3–6 phút sau bản mới chạy.
5. Kiểm tra lại như [mục 4](#4-kiểm-tra-web-đã-chạy).

**Nếu bản mới bị lỗi:**
- Nếu build lỗi, Render **giữ nguyên bản cũ đang chạy** — người dùng không bị ảnh hưởng. Xem tab **Logs** để biết lỗi.
- Nếu bản mới chạy nhưng có lỗi: Render → **Events** → chọn lần deploy tốt trước đó → **Rollback**.

**Khi sửa cấu trúc database** (`server/prisma/schema.prisma`): cần tạo thêm migration cho PostgreSQL — làm theo mục *Triển khai → PostgreSQL* trong `README.md`, hoặc nhờ người hỗ trợ kỹ thuật. Sao lưu database **trước** khi deploy thay đổi này.

---

## 7. Sao lưu và khôi phục database

Dữ liệu có **tiền** (điểm, nạp tiền) nên cần sao lưu định kỳ. Có 2 cách, nên dùng cả hai.

### Cách 1 — Tạo "ảnh chụp" ngay trên Neon (dễ nhất)

Neon cho phép tạo **branch** = một bản sao tức thời của toàn bộ dữ liệu.

1. Neon → project `lichbaogiang` → **Branches** → **New Branch**.
2. Đặt tên theo ngày, VD `backup-2026-10-01`, nguồn là `main`, chọn **Current point in time** → **Create**.
3. Xóa bớt branch cũ khi gần chạm giới hạn của gói miễn phí.

Neon cũng có mục **Restore** để quay database về một thời điểm gần đây (gói miễn phí chỉ giữ lịch sử ngắn — xem con số cụ thể trên trang Neon).

> Cách 1 vẫn nằm trên Neon — nếu mất tài khoản Neon thì mất cả bản sao. Vì vậy nên làm thêm cách 2.

### Cách 2 — Tải file sao lưu về máy (mỗi tuần một lần)

**Cài đặt một lần:** tải bộ cài PostgreSQL 17 cho Windows tại <https://www.postgresql.org/download/windows/> → khi cài chỉ tích **Command Line Tools** (bỏ các mục khác).

**Sao lưu** — mở PowerShell, chạy (thay chuỗi kết nối bằng chuỗi Neon thật):

```powershell
$env:DB = "postgresql://neondb_owner:MAT_KHAU@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" --format=custom --no-owner --file "khbd-$(Get-Date -Format yyyy-MM-dd).dump" $env:DB
```

Sẽ ra file `khbd-2026-10-01.dump`. Cất vào nơi an toàn (Google Drive, OneDrive, USB). 🔒 File này chứa toàn bộ dữ liệu người dùng — **không** để trong thư mục code, **không** đưa lên GitHub.

**Khôi phục** (chỉ khi thật sự cần — thao tác này **ghi đè** dữ liệu hiện tại):

1. Nên khôi phục vào một **branch mới** trên Neon trước để kiểm tra, rồi mới quyết định dùng.
2. Lệnh:

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --clean --if-exists --no-owner --dbname $env:DB "khbd-2026-10-01.dump"
   ```

3. Nếu khôi phục vào branch mới: copy chuỗi kết nối của branch đó → dán vào `DATABASE_URL` trên Render → **Save**.

---

## 8. Lưu ý về gói miễn phí

| Dịch vụ | Giới hạn | Dữ liệu có bị xóa? |
|---|---|---|
| **Render Free** | **"Ngủ" sau 15 phút** không có người truy cập; người vào đầu tiên chờ 30–60 giây. RAM 512 MB. | Không có dữ liệu trên Render nên không mất gì. |
| **Neon Free** | Tạm nghỉ khi rảnh, tự dậy trong ~1 giây. Dung lượng 0,5 GB (đủ cho hàng nghìn tài khoản). Có giới hạn giờ chạy mỗi tháng. | **Không** bị xóa. |

- **Không dùng database PostgreSQL miễn phí của Render** — nó bị xóa sau 30 ngày.
- Khi có nhiều người dùng thật, nên nâng Render lên **Starter (~7 USD/tháng)**: Render → dịch vụ → **Settings** → **Instance Type** → Starter. Hết "ngủ", không phải sửa code.
- Bản trên **GitHub Pages** (workflow `.github/workflows/deploy.yml`) chỉ có giao diện, **không đăng nhập được**. Hãy gửi cho người dùng địa chỉ Render (hoặc tên miền riêng), không gửi địa chỉ `github.io`.

---

## 9. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Build lỗi `Thiếu DATABASE_URL` hoặc `Can't reach database server` | Chưa điền / điền sai `DATABASE_URL`. Kiểm tra đã copy đủ chuỗi, có `?sslmode=require`, host **không** có `-pooler`. |
| Build lỗi `Chưa tạo được admin ...` | Một trong các biến `ADMIN_*` sai định dạng, hoặc email/SĐT đã được tài khoản khác dùng. Đọc dòng lỗi trong **Logs**, sửa trong **Environment**. |
| Quên mật khẩu admin | Render → Environment: đặt `ADMIN_PASSWORD` = mật khẩu mới, `ADMIN_RESET_PASSWORD` = `true` → Save → **Manual Deploy**. Đăng nhập xong thì xóa `ADMIN_PASSWORD` và đặt lại `ADMIN_RESET_PASSWORD` = `false`. |
| Trang tải rất lâu lần đầu | Gói free đang "thức dậy" — chờ 1 phút. |
| Đăng nhập xong bị văng ra | Đang mở bản GitHub Pages hoặc địa chỉ khác Render. Dùng đúng địa chỉ Render / tên miền riêng. |
| Mã QR nạp tiền không hiện | Thiếu `BANK_ID`, `BANK_ACCOUNT_NO` hoặc `BANK_ACCOUNT_NAME`. |
| Báo "Đăng nhập sai quá nhiều lần" | Cơ chế chống dò mật khẩu — chờ 15 phút, hoặc admin mở khóa. |

---

## 10. Phụ lục: bảng biến môi trường

**Backend** — điền trên Render → Environment (mẫu đầy đủ: `server/.env.example`):

| Biến | Giá trị trên Render | Ghi chú |
|---|---|---|
| `DATABASE_URL` 🔒 | chuỗi Neon | bắt buộc |
| `JWT_SECRET` 🔒 | Render tự sinh | bắt buộc, ≥ 32 ký tự. Đổi giá trị = mọi người bị đăng xuất |
| `NODE_ENV` | `production` | có sẵn |
| `SERVE_CLIENT` | `true` | có sẵn — backend phục vụ luôn giao diện |
| `TRUST_PROXY` | `1` | có sẵn |
| `COOKIE_SAMESITE` | `lax` | có sẵn |
| `CLIENT_ORIGIN` | để trống | chỉ cần nếu giao diện ở domain khác API. Để trống = chặn mọi trang web khác gọi API |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PHONE` | thông tin admin | dùng khi build (`db:seed`) |
| `ADMIN_PASSWORD` 🔒 | mật khẩu admin | xóa sau khi tạo admin xong |
| `ADMIN_RESET_PASSWORD` | `false` | `true` chỉ khi cần đặt lại mật khẩu admin |
| `BANK_ID`, `BANK_NAME`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME` | TK nhận tiền | cho mã QR nạp điểm |
| `SESSION_DAYS`, `LOGIN_MAX_FAILS_*`, `LOGIN_WINDOW_MINUTES`, `REGISTER_MAX_PER_HOUR`, `VIETQR_TEMPLATE` | không cần điền | đã có giá trị mặc định hợp lý |

**Frontend** — trên Render **không cần điền gì** (mẫu: `.env.example` ở thư mục gốc). `VITE_API_URL` để trống vì giao diện và API chung địa chỉ.

> 🔒 = bí mật. Chỉ điền trên trang quản trị Render / Neon. Không bao giờ ghi vào code, không commit file `.env`, không gửi qua Zalo/email.
