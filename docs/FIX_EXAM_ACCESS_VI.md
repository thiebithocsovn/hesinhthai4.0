# Sửa lỗi không hiện lịch thi và không vào thi (05/10/2026)

## Nguyên nhân đã kiểm tra

Cổng thi tại `https://trungtuyen.github.io/4.0/` trả về `FirebaseError: Missing or insufficient permissions` khi đọc `public_exam_schedules`. Nhật ký GitHub Actions lần triển khai `37242823374` xác nhận `FIREBASE_SERVICE_ACCOUNT_JSON` chưa được cấu hình, nên bước xuất bản quyền Firestore đã bị bỏ qua. Bản quyền tương thích Firebase trong `firestore.learning-wall.rules` trước đây thiếu cả `public_exam_schedules` và `public_exam_access`.

## Bản sửa

- Lưu kỳ thi, đề mã hóa và lịch thi trong cùng một batch; nếu Firebase từ chối thì không lưu trạng thái mở riêng lẻ.
- Quyền đề mã hóa dùng `getAfter` để kiểm tra kỳ thi vừa được công bố trong batch.
- Khôi phục cả lịch thi và đề mã hóa khi giáo viên mở Quản lý kỳ thi, kể cả trường hợp đã có lịch nhưng thiếu đề.
- Cổng thi phân biệt lỗi quyền và lỗi kết nối; giáo viên có nút thử đồng bộ lại.
- Bộ quyền tương thích giữ các phần ngoài kỳ thi của bản nền Tường học tập; cập nhật các quyền kỳ thi, đề mã hóa, học sinh vào thi, phiên thi và kết quả. Đề và kết quả chỉ được giáo viên chủ sở hữu hoặc quản trị viên đọc. Lịch thi chỉ chứa thông tin, không chứa mã thi hoặc đáp án.

## Bước bắt buộc trên Firebase để trang thật hoạt động

GitHub Pages chỉ triển khai giao diện. Cần xuất bản quyền vào đúng cơ sở dữ liệu:

1. Mở Firebase Console, chọn dự án `gen-lang-client-0870957273`.
2. Vào **Firestore Database**, chọn cơ sở dữ liệu `ai-studio-51fdfd5e-caf8-4640-bdd8-404753ba685e`, vào **Rules / Quy tắc**.
3. Lưu bản quyền hiện tại để có thể khôi phục. Nếu bản đang dùng là bản nền Tường học tập của dự án này, thay bằng toàn bộ nội dung `firestore.learning-wall.rules` đã cập nhật, rồi chọn **Publish / Xuất bản**. Nếu đã dùng bộ quyền đầy đủ của hệ sinh thái, dùng `firestore.rules` đã cập nhật. Nếu bản hiện tại khác hai bản trong kho, cần ghép phần quyền kỳ thi vào bản đang dùng trước khi xuất bản.
4. Mở lại **Quản lý kỳ thi** bằng tài khoản giáo viên sở hữu kỳ thi; kỳ thi đang mở được tự đồng bộ. Nếu hiện cảnh báo, chọn **Thử đồng bộ lại kỳ thi**. Kỳ thi nháp cần chọn mở thi.
5. Mở Cổng thi học sinh bằng cửa sổ riêng tư: kiểm tra có lịch thi, nhập họ tên và mã, bắt đầu làm bài, nộp bài, rồi kiểm tra kết quả trên máy giáo viên.

Có thể triển khai bằng Firebase CLI đã đăng nhập:

```sh
npm run deploy:learning-wall
```

Để tự động triển khai bộ quyền đầy đủ từ GitHub Actions, cấu hình repository secret `FIREBASE_SERVICE_ACCOUNT_JSON` bằng tài khoản dịch vụ của chính dự án có quyền triển khai Firebase Rules. Không gửi khóa riêng trong chat hoặc đưa vào mã nguồn.

## Kiểm thử

`test:exam-access-rules` chạy trên emulator, kiểm tra công bố toàn vẹn, lịch công khai, mở đề bằng mã, cách ly chủ sở hữu, khôi phục đề bị thiếu, tạo học sinh, bắt đầu thi, nộp bài và đóng thi. Bộ kiểm thử này chạy với cả hai file quyền.
