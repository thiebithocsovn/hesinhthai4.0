# Thời khóa biểu thương mại: trường dùng chung và phê duyệt

**Trạng thái:** Đã bổ sung mã nguồn API, giao diện và kiểm thử. Vận hành thật cần cấu hình máy chủ trước khi bật. Không thay đổi chức năng thời khóa biểu cá nhân, lịch sử JSON, Firestore Rules hoặc luồng công bố cá nhân cũ.

## Chức năng được bổ sung

1. Không gian riêng cho từng trường; chủ trường có thể mời tài khoản đã xác minh email bằng mã một lần, hết hạn 7 ngày.
2. Phân quyền năm vai trò: owner, admin, scheduler, reviewer, viewer. API kiểm tra quyền độc lập với giao diện. Chủ trường có thể đổi hoặc thu hồi vai trò thành viên.
3. Dữ liệu chung tải lên/xuống theo xác nhận; số revision chống ghi đè đồng thời; local-first được giữ nguyên.
4. Bản gửi duyệt cố định, được kiểm toán độc lập trước khi gửi. Người gửi không thể tự duyệt. Phiếu được chấp thuận/từ chối với nhật ký máy chủ.
5. Chỉ quản trị công bố bản đã được phê duyệt; liên kết chứa snapshot rút gọn, có thể thu hồi và tra lịch sử.
6. Cổng proxy bộ giải CP-SAT xác thực, chỉ sẵn dùng khi cấu hình dịch vụ Python HTTPS riêng và khóa server-only. Nghiệm được kiểm toán lại; không bao giờ tự ghi/lưu/công bố.
7. Gói pilot giới hạn 10 thành viên, 3 trường/tài khoản chủ, 1000 phân công, 400 giáo viên, 200 lớp và 8000 tiết mỗi lịch. Đây là hạn mức kỹ thuật, không phải dịch vụ đã thanh toán.
8. Nhật ký tập trung cho những thao tác chính.

## Cấu hình Vercel để bật pilot

- Backend dùng route /api/timetable/schools và Firebase Admin; GitHub Pages chỉ chạy frontend.
- TIMETABLE_SAAS_ENABLED=true: bật API sau khi kiểm thử; mặc định false. Health GET /api/timetable/schools?action=health cho biết available và solverConfigured.
- TIMETABLE_SAAS_CREATORS: danh sách email chủ trường được duyệt, cách nhau dấu phẩy. Nếu trống, không thể tự tạo trường, ngay cả khi API bật.
- Cần định danh máy chủ có đủ quyền nhỏ nhất đọc/ghi Firestore trong đúng database và xác minh Firebase ID token (Workload Identity Federation hoặc credential server-only).
- ALLOWED_ORIGINS phải gồm domain GitHub Pages và Vercel được sử dụng.
- TIMETABLE_SOLVER_URL: địa chỉ HTTPS bộ giải Python chạy riêng.
- TIMETABLE_SOLVER_API_KEY: khóa solver chỉ đặt trên backend. Tuyệt đối không đưa vào VITE_ variables hoặc GitHub Pages.
- VITE_TEACHER_ADMIN_API_URL: origin server Vercel công khai, không mang bí mật.
- Tuyệt đối không mở Firestore rules của timetable_saas_schools hay timetable_saas_users cho trình duyệt. Firestore Admin API chịu trách nhiệm xác thực, phân quyền và log.

## Kiểm thử chấp nhận trước khi mở pilot thật

Dùng ba email đã xác minh: owner, scheduler, reviewer. Kiểm tra tạo trường bằng owner allowlist, mời đúng email, dùng mã một lần, role theo nhiệm vụ, dữ liệu trường A không thể được xem từ thành viên trường B, revision cũ trả 409, người gửi không tự duyệt, phải có reviewer khác duyệt, quản trị mới công bố, thu hồi link trả 404, sửa dữ liệu chung không thay đổi bản đã công bố.

Chạy kiểm thử repository: npm run test:timetable-advanced, npm run lint, npm run build:static, npm run test:timetable-ui; kiểm thử service Python với pytest.

## Chưa được gọi là hoàn thành thương mại

- Chưa tích hợp cổng thanh toán, hóa đơn, hợp đồng, gia hạn dịch vụ thật; không nhập thẻ hoặc thực hiện thanh toán trên giao diện pilot.
- Chưa có worker queue/Redis, trạng thái job dài hạn, xử lý tải lớn hoặc rate limiting tập trung theo user.
- Chưa có backup/restore point-in-time được kiểm chứng, quan sát lỗi/SIEM, SLA hoặc pentest độc lập.
- AI Agent đang dựa trên quy tắc và người dùng xác nhận, không phải agent tự lập trình hệ thống.
- Backend cần cấu hình hạ tầng và kiểm thử đa tài khoản thực tế mới có thể tuyên bố vận hành an toàn.

Không nâng trạng thái lên production multi-tenant nếu chưa hoàn thành checklist nói trên.
