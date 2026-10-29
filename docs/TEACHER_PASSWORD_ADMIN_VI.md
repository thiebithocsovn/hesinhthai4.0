# Quản trị đặt mật khẩu mới cho giáo viên

Trong **Quản lý giáo viên**, bấm biểu tượng chìa khóa ở đúng giáo viên. Nhập **Mật khẩu mới** và **Nhập lại mật khẩu mới**, rồi chọn **Đặt mật khẩu mới**. Mật khẩu có độ dài 8–128 ký tự. Chỉ khi máy chủ xác nhận thành công, giao diện mới báo đã thay mật khẩu. Lựa chọn **Gửi email khôi phục** vẫn hoạt động độc lập.

## Máy chủ và quyền truy cập

GitHub Pages chỉ chạy giao diện. Việc đổi mật khẩu tài khoản khác phải dùng Firebase Admin SDK ở máy chủ; không ghi mật khẩu vào hồ sơ Firestore, mã nguồn, trình duyệt hoặc nhật ký.

API `POST /api/admin/teachers/password` được gắn vào cả `server.ts` và máy chủ riêng `server/wallApiServer.ts`. Máy chủ xác minh Firebase ID token và kiểm tra thu hồi token; chỉ chấp nhận tài khoản đã xác minh có custom claim `admin: true`, `role: admin`, email thuộc `TEACHER_ADMIN_EMAILS`, hoặc bản ghi `admins/{uid}`. Email mặc định trùng với quản trị đã được cấu hình trong `firestore.rules`. Vai trò gửi từ trình duyệt không được sử dụng.

Hồ sơ `teachers/{uid}` và Firebase Authentication phải cùng UID, cùng email. Endpoint không đổi email, không tạo lại tài khoản, không mở khóa giáo viên, không thay mật khẩu tài khoản quản trị hoặc chính người đang thao tác. Mật khẩu chỉ được truyền qua HTTPS tới máy chủ đã cấu hình khi triển khai. Không có mật khẩu mặc định chung.

## Triển khai

Workflow GitHub có job `teacher-password-api`. Job dùng secret **FIREBASE_SERVICE_ACCOUNT_JSON** để cập nhật dịch vụ Cloud Run **learning-wall-ai** hiện có trong dự án Firebase. Không tạo dịch vụ mới và không kích hoạt thanh toán. Tài khoản triển khai cần quyền triển khai Cloud Run/Cloud Build và cấu hình IAM cho dịch vụ hiện có; nó không được đưa vào mã frontend. Tài khoản runtime được cấp role riêng chỉ gồm `firebaseauth.users.get`, `firebaseauth.users.update`, `datastore.entities.get`. Các khóa và cấu hình AI hiện có được giữ lại.

Sau khi triển khai và kiểm tra yêu cầu không đăng nhập bị chặn, URL máy chủ được chuyển vào bước build giao diện. Khi tự triển khai máy chủ khác, đặt Actions variable **VITE_TEACHER_ADMIN_API_URL** bằng origin HTTPS của máy chủ và cấu hình **TEACHER_ADMIN_EMAILS** tại máy chủ. Frontend cũng hỗ trợ máy chủ đã khai báo bằng `VITE_API_BASE_URL` hoặc `VITE_WALL_OPENAI_API_URL`; không sử dụng địa chỉ lưu tùy ý trong localStorage.

Nếu chưa có secret hoặc chưa đủ quyền triển khai, workflow ghi rõ lý do ở Job Summary. Giao diện vẫn được xuất bản và vẫn gửi được email khôi phục; **không được coi việc đặt mật khẩu trực tiếp đã hoạt động** trước khi backend được triển khai thành công. Sau khi bổ sung cấu hình, chạy lại workflow. Không gửi khóa tài khoản dịch vụ qua hội thoại; cấu hình trực tiếp trong GitHub Actions Secrets.

## Kiểm tra

- `npm run lint`: kiểm tra TypeScript.
- `npm run test:teacher-password`: thử luồng client → API với các phụ thuộc kiểm thử, quyền quản trị, tài khoản được bảo vệ, kiểm tra dữ liệu, giới hạn tần suất và lỗi không lộ mật khẩu.
- `npm run test:teacher-password-ui`: thử hộp thoại trên máy tính/điện thoại, xác nhận mật khẩu, báo lỗi, xóa dữ liệu sau thành công, bàn phím và lựa chọn email. Không sử dụng tài khoản giáo viên thật.
- `npm run build:static` và `npm run build:wall-api`: đóng gói riêng frontend và máy chủ.

Kiểm thử tự động không thay mật khẩu giáo viên đang dùng. Muốn xác minh thật sau triển khai, dùng tài khoản giáo viên kiểm thử riêng: đặt mật khẩu mới, đăng nhập bằng mật khẩu mới và xác nhận mật khẩu cũ không còn dùng được.
