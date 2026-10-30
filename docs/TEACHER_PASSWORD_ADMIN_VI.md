# Quản trị đặt mật khẩu mới cho giáo viên

Trong **Quản lý giáo viên**, bấm biểu tượng chìa khóa ở đúng giáo viên. Nhập **Mật khẩu mới** và **Nhập lại mật khẩu mới**, rồi chọn **Đặt mật khẩu mới**. Mật khẩu có độ dài 8–128 ký tự. Chỉ khi máy chủ xác nhận thành công, giao diện mới báo đã thay mật khẩu. Lựa chọn **Gửi email khôi phục** vẫn hoạt động độc lập.

## Máy chủ và quyền truy cập

GitHub Pages chỉ chạy giao diện. Việc đổi mật khẩu tài khoản khác phải dùng Firebase Admin SDK ở máy chủ; không ghi mật khẩu vào hồ sơ Firestore, mã nguồn, trình duyệt hoặc nhật ký.

API `POST /api/admin/teachers/password` được gắn vào cả `server.ts` và máy chủ riêng `server/wallApiServer.ts`. Máy chủ xác minh Firebase ID token và kiểm tra thu hồi token; chỉ chấp nhận tài khoản đã xác minh có custom claim `admin: true`, `role: admin`, email thuộc `TEACHER_ADMIN_EMAILS`, hoặc bản ghi `admins/{uid}`. Email mặc định trùng với quản trị đã được cấu hình trong `firestore.rules`. Vai trò gửi từ trình duyệt không được sử dụng.

Hồ sơ `teachers/{uid}` và Firebase Authentication phải cùng UID, cùng email. Endpoint không đổi email, không tạo lại tài khoản, không mở khóa giáo viên, không thay mật khẩu tài khoản quản trị hoặc chính người đang thao tác. Mật khẩu chỉ được truyền qua HTTPS tới máy chủ đã cấu hình khi triển khai. Không có mật khẩu mặc định chung.

## Triển khai

### Vercel cho API, GitHub Pages cho giao diện

Repository có entry point `api/admin/teachers/password.ts` và `vercel.json`. Vercel gọi trực tiếp Express handler, không chạy `server.ts`, không mở cổng bằng `listen()` và không cần chạy máy chủ phát triển Vite. API dùng chung phần xác minh quyền và cập nhật mật khẩu với máy chủ Node hiện có.

Tại **dự án Vercel của chính repository này**, ưu tiên Workload Identity Federation. Script `scripts/configure-teacher-password-federation.cjs` mặc định in kế hoạch; chạy với `--apply` sau khi đăng nhập Firebase CLI để cấu hình. Có thể chỉ đường dẫn thư viện CLI bằng `--firebase-tools-lib /path/to/firebase-tools/lib`. Script xác nhận đúng dự án, giữ các IAM binding khác và chỉ cấp `firebaseauth.users.get`, `firebaseauth.users.update`, `datastore.entities.get` cho tài khoản `teacher-password-api`. Không kích hoạt billing, không triển khai Cloud Functions/Cloud Run và không tạo private key.

Provider chỉ tin issuer `https://oidc.vercel.com/thietbihocso`, audience `https://vercel.com/thietbihocso`, đúng team ID và project ID của `hesinhthai4-0`, môi trường `production`. Trong Vercel bật OIDC với issuer mode `team`. Lưu hai định danh không bí mật mà script trả về vào **TEACHER_ADMIN_WIF_PROVIDER** và **TEACHER_ADMIN_SERVICE_ACCOUNT**, chỉ ở Production. API lấy Vercel JWT trong request hiện tại rồi đổi lấy Google access token ngắn hạn. Preview/Development không được dùng danh tính này. Các point read Firestore dùng OAuth trên REST và chỉ lấy trường id/email.

Vẫn hỗ trợ secret server **FIREBASE_SERVICE_ACCOUNT_JSON** cho nền tảng khác hoặc cấu hình cũ. Tài khoản dịch vụ phải thuộc đúng dự án trong `firebase-applet-config.json` và chỉ có ba quyền nói trên. Không dùng khóa Owner/Editor, không đặt giá trị vào `VITE_*`, mã nguồn hay hội thoại. Nếu nền tảng cung cấp ADC hợp lệ thì có thể dùng `GOOGLE_APPLICATION_CREDENTIALS` thay thế. Giao diện không đọc được credential này.

Node được cố định ở **24.x** để Vercel không tự chọn Node 26 và làm hỏng bước cài thư viện native. API Production cần nhận request từ GitHub Pages mà không yêu cầu cookie đăng nhập Vercel; mỗi POST được xác thực bằng Firebase ID token. Standard Protection vẫn có thể bảo vệ URL deployment và Preview khi domain Production chính được mở.

Triển khai commit đã kiểm tra lên Production. Kiểm tra `OPTIONS /api/admin/teachers/password` từ origin `https://thiebithocsovn.github.io` trả 204; `POST` cùng origin nhưng không có token phải trả 401. Chỉ sau khi kiểm tra API thật, đặt Actions variable **VITE_TEACHER_ADMIN_API_URL** bằng origin Production đã xác minh và build lại GitHub Pages. Không đoán alias Vercel và không trỏ vào URL Preview được bảo vệ đăng nhập.

Nếu thiếu quyền truy cập Vercel (403), thiếu secret hoặc chưa có URL API được kiểm tra thì phần triển khai vẫn chưa hoàn tất. Việc commit code, kiểm thử tự động hoặc GitHub Pages hiển thị hộp thoại không xác nhận mật khẩu giáo viên đã đổi được. API trả 503 rõ ràng khi Vercel chưa có cấu hình Firebase, thay vì báo sai rằng phiên quản trị hết hạn.

Giới hạn 20 yêu cầu/10 phút hiện áp dụng theo từng tiến trình máy chủ. Với nhiều instance serverless, giới hạn này không thay thế giới hạn tập trung trên nền tảng; mọi yêu cầu vẫn phải qua xác minh quản trị và bảo vệ tài khoản đích.

### Cloud Run hiện có (tùy chọn)

Workflow GitHub có job `teacher-password-api`, chỉ chạy khi Actions variable **TEACHER_PASSWORD_API_HOST** là `cloud-run`. Job dùng secret **FIREBASE_SERVICE_ACCOUNT_JSON** để cập nhật dịch vụ Cloud Run **learning-wall-ai** hiện có trong dự án Firebase. Không tạo dịch vụ mới và không kích hoạt thanh toán. Tài khoản triển khai cần quyền triển khai Cloud Run/Cloud Build và cấu hình IAM cho dịch vụ hiện có; nó không được đưa vào mã frontend. Tài khoản runtime được cấp role riêng chỉ gồm `firebaseauth.users.get`, `firebaseauth.users.update`, `datastore.entities.get`. Các khóa và cấu hình AI hiện có được giữ lại.

Sau khi triển khai và kiểm tra yêu cầu không đăng nhập bị chặn, URL máy chủ được chuyển vào bước build giao diện. Khi tự triển khai máy chủ khác, đặt Actions variable **VITE_TEACHER_ADMIN_API_URL** bằng origin HTTPS của máy chủ và cấu hình **TEACHER_ADMIN_EMAILS** tại máy chủ. Frontend cũng hỗ trợ máy chủ đã khai báo bằng `VITE_API_BASE_URL` hoặc `VITE_WALL_OPENAI_API_URL`; không sử dụng địa chỉ lưu tùy ý trong localStorage.

Nếu chưa có secret hoặc chưa đủ quyền triển khai, workflow ghi rõ lý do ở Job Summary. Giao diện vẫn được xuất bản và vẫn gửi được email khôi phục; **không được coi việc đặt mật khẩu trực tiếp đã hoạt động** trước khi backend được triển khai thành công. Sau khi bổ sung cấu hình, chạy lại workflow. Không gửi khóa tài khoản dịch vụ qua hội thoại; cấu hình trực tiếp trong GitHub Actions Secrets.

## Kiểm tra

- `npm run lint`: kiểm tra TypeScript.
- `npm run test:teacher-password`: thử luồng client → API, entry point Vercel, request đã được nền tảng phân tích JSON, cấu hình Firebase sai dự án/thiếu khóa, quyền quản trị, tài khoản được bảo vệ, giới hạn tần suất và lỗi không lộ mật khẩu. Khóa RSA kiểm thử được tạo trong bộ nhớ và không truy cập Firebase thật.
- `npm run test:teacher-password-ui`: thử hộp thoại trên máy tính/điện thoại, xác nhận mật khẩu, báo lỗi, xóa dữ liệu sau thành công, bàn phím và lựa chọn email. Không sử dụng tài khoản giáo viên thật.
- `npm run build:static` và `npm run build:wall-api`: đóng gói riêng frontend và máy chủ.

Kiểm thử tự động không thay mật khẩu giáo viên đang dùng. Muốn xác minh thật sau triển khai, dùng tài khoản giáo viên kiểm thử riêng: đặt mật khẩu mới, đăng nhập bằng mật khẩu mới và xác nhận mật khẩu cũ không còn dùng được.
