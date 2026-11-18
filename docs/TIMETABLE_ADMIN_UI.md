# AITHEROVA — giao diện quản trị thời khóa biểu

Mở trực tiếp: `https://thiebithocsovn.github.io/hesinhthai4.0/?app=smart-timetable`.

Giao diện được triển khai bằng mã React/TypeScript trong repository hiện có, dựa trên bố cục và các nhóm nghiệp vụ quan sát được ở trang quản trị tkb.com.vn. Không có mã nguồn máy chủ, tài khoản hay dữ liệu nhà trường của tkb.com.vn được sao chép vào ứng dụng.

## Thành phần

- `TimetableAdminShell.tsx` và `timetableAdmin.css`: menu dọc có tìm kiếm, thanh tên trường, quy trình 9 bước, menu di động.
- `timetableNavigation.ts`: ánh xạ menu đến màn hình thật hoặc thông tin phạm vi hỗ trợ.
- `TimetableAdminPanels.tsx`: danh mục dạng bảng, khối, GVCN, bảng tiết/phân công, cấu hình, lưới giờ bận, sao lưu.
- `timetableAdmin.ts`: tương thích khối trong bản sao lưu cũ, cập nhật GVCN hai chiều, chuyển nguyên block qua kiểm tra độc lập.
- `SmartTimetable.tsx`: tích hợp với Web Worker, Excel/JSON, dữ liệu local-first và các màn hình hiện có.

## Phạm vi hoạt động

| Nghiệp vụ | Trạng thái |
| --- | --- |
| Khối, lớp, môn, giáo viên, phòng | Thêm, sửa tên, tìm kiếm; chặn xóa khi còn phân công liên quan |
| Chủ nhiệm | Gán/gỡ và đồng bộ liên kết lớp–giáo viên |
| Phân công, số tiết | Sửa từng lớp–môn; buổi, block, phòng, thời điểm cố định |
| Ngày, tiết, buổi | Cấu hình 5/6 ngày, số tiết/ngày, ranh giới sáng/chiều |
| Giờ bận | Lưới giáo viên/lớp/phòng; khóa cả buổi hoặc từng ô |
| Giới hạn số tiết | Số tiết/ngày và tiết liên tục của giáo viên |
| Xếp và tinh chỉnh | Bộ xếp hiện có; chuyển block bằng click hoặc kéo thả, chặn vi phạm bằng bộ kiểm tra độc lập |
| Xuất/in | Excel theo trường/lớp/GV; in và lưu PDF qua trình duyệt |
| Sao lưu | JSON đầy đủ; mở lại phương án chỉ khi khớp dữ liệu hiện tại |
| Nhiều cơ sở và thời gian di chuyển | Chưa hỗ trợ; hiển thị rõ trên màn hình |
| Nhóm nhiều môn cùng buổi, giới hạn đồng thời theo môn | Chưa hỗ trợ; có hướng dẫn dùng các ràng buộc hiện có khi phù hợp |
| Ghép lớp, tách nhóm học song song | Chưa hỗ trợ trong mô hình bộ xếp hiện tại; không ghi nhận nhóm như lịch hợp lệ |
| Link công khai tra cứu, chia phòng thi | Chưa hỗ trợ trong bộ thời khóa biểu; không tạo liên kết hoặc nút xuất bản giả |

Dữ liệu cũ không có `grades`/`gradeId` vẫn dùng được. Khối mặc định được suy ra từ tên lớp và cấp; trường có thể tự khai báo khối. Đồng bộ Firebase tiếp tục theo UID; không sửa quy tắc bảo mật.

## Kiểm tra

`npm run test:smart-timetable`, `npm run test:timetable-agent`, `npm run test:timetable-admin`, `npm run lint`, `npm run build:static` và `python3 -m pytest -q` trong `services/timetable-solver`.

Bộ kiểm thử mới kiểm tra GVCN khi đổi lớp, dữ liệu khối cũ/mới và chuyển block: giữ đủ tiết, không trùng tài nguyên, không vào giờ bận, không vượt ranh giới buổi, không di chuyển block cố định/đang khóa. Phương án cũ thiếu mã block tiết đôi phải xếp lại trước khi chuyển.
