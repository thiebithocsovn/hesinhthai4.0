# AITHEROVA — quản trị thời khóa biểu

Mở trực tiếp: `https://thiebithocsovn.github.io/hesinhthai4.0/?app=smart-timetable`.

Ứng dụng React/Vite hiện có được mở rộng; không thay thế các công cụ khác trong Hệ sinh thái 4.0. Mã triển khai nằm trong repository của trường, không sử dụng mã nguồn máy chủ hoặc dữ liệu riêng của tkb.com.vn.

## Phạm vi đã triển khai

| Nghiệp vụ | Hoạt động |
| --- | --- |
| Danh mục và khối | Thêm/sửa/tìm kiếm, chặn xóa tài nguyên còn trong phân công |
| GVCN | Liên kết hai chiều giữa lớp và giáo viên |
| Phân công | Số tiết, block, buổi, phòng, cố định, đồng giảng và nhóm học |
| Ghép lớp | Xem trước rồi gộp phân công cùng môn/số tiết/block; lịch hiện ở mọi lớp và giữ giờ mọi giáo viên; có thể tách lại |
| Tách lớp | Các nhóm không trùng học sinh; phân công theo nhóm; ràng buộc học song song theo buổi tương ứng |
| Môn cùng buổi | Buổi thứ n của các phân công cùng ngày và cùng buổi sáng/chiều |
| Nhiều cơ sở | Cơ sở của lớp/phòng/phân công; số tiết trống để di chuyển |
| Phòng và sĩ số | Sức chứa, sĩ số lớp/nhóm và giờ không khả dụng |
| Giới hạn tài nguyên | Lớp đồng thời theo môn; số tiết/ngày, tiết liên tục, ngày dạy của giáo viên |
| Xếp lịch | Web Worker; bộ đa tài nguyên có tìm kiếm nhiều lượt và sửa bằng quay lui có giới hạn; không tuyên bố tối ưu toàn cục |
| Tinh chỉnh | Chuyển/đổi chỗ nguyên block hoặc nhóm song song; giữ tiết khóa/cố định; kiểm tra độc lập trước khi áp dụng |
| Xem toàn trường | Bảng nhiều lớp theo ngày và cấp học; lịch riêng từng lớp/giáo viên/phòng |
| Nhập liệu | Excel có bước xem trước; không tự xóa các tiết cố định dư; hiển thị vấn đề để sửa |
| Hoàn tác | Tối đa 20 trạng thái dữ liệu trong phiên; áp dụng cho chỉnh sửa, nhập, khóa và chuyển tiết |
| Xuất/in | Excel tổng hợp/lớp/GV/phòng/phân công, PDF qua in trình duyệt, in nhiều đối tượng; nhiều nhóm cùng tiết không bị bỏ sót |
| Công bố | Kiểm tra độc lập, ngày áp dụng, ẩn/hiện tên GV, xem trước HTML, xác nhận công bố, cập nhật và thu hồi liên kết |
| Chia phòng thi | SBD/họ tên/lớp, sức chứa, seed có thể tái lập; kiểm tra mỗi thí sinh đúng một chỗ; Excel kết quả |

## Mô hình mở rộng và tương thích

`additionalClassIds` và `additionalTeacherIds` là các tài nguyên bổ sung của một phân công. `studentGroups` chia lớp thành các tập học sinh không trùng nhau; một phân công không chọn nhóm chiếm mọi nhóm của lớp đó. `lessonGroups` có hai loại `parallel` và `same-session`, liên kết các buổi cùng chỉ số `meetingIndex`.

Các trường mới đều là tùy chọn. Bản JSON cũ tiếp tục dùng được; bản sao lưu đầy đủ mới mang phiên bản 3. Các file Excel không chứa đầy đủ mọi giờ bận và lịch sử; dùng JSON để sao lưu toàn bộ.

Bộ kiểm tra độc lập kiểm đếm lại số tiết, tài nguyên, block, giờ bận, giới hạn tải, sức chứa, lớp đồng thời, chuyển cơ sở và ràng buộc nhóm. Bộ xếp không gọi bộ kiểm tra của chính nó để thay thế bước này. Kết quả chưa đủ tiết hoặc còn lỗi không được công bố.

## Công bố và quyền truy cập

`api/timetable.ts` chạy trên Vercel hiện có; GitHub Pages phục vụ giao diện. Máy chủ giữ nguyên vai trò Google chỉ đọc. Mọi thao tác ghi bản công bố dùng Firebase ID token của chính chủ sở hữu và các Rules hiện tại. Không sửa Firestore Rules hoặc mở rộng quyền Google của máy chủ.

Bản công bố được nén trong `workspace.scenario.publicationSnapshots` của chính giáo viên. Đồng bộ làm việc dùng transaction để giữ các bản công bố trên cloud, tránh dữ liệu offline cũ ghi đè hoặc khôi phục một liên kết đã thu hồi. Liên kết AES-GCM che UID chủ sở hữu và không thể sửa để đọc không gian của tài khoản khác. Khóa `TIMETABLE_PUBLICATION_SECRET` chỉ nằm ở môi trường máy chủ và phải được giữ ổn định để các liên kết đang dùng tiếp tục hoạt động.

Bản công khai là một bản chụp đã duyệt: không gồm tài khoản, giờ bận, lịch sử, sĩ số hay danh sách thí sinh. Tên giáo viên mặc định được ẩn. Thu hồi liên kết không xóa được các tệp người nhận đã tải trước đó.

## Bộ giải CP-SAT

Dịch vụ Python tùy chọn cũng hỗ trợ các ràng buộc đa tài nguyên qua `advanced.py`; kết quả được kiểm tra lại riêng. `OPTIMAL` chỉ là chứng nhận cho hàm mục tiêu đã mô hình hóa; `FEASIBLE` chỉ cho biết có nghiệm hợp lệ. Dịch vụ này vẫn phải được triển khai riêng sau một proxy xác thực để dùng từ trình duyệt; GitHub Pages không tự chạy Python/PostgreSQL/Redis.

## Kiểm thử

- `npm run test:smart-timetable`
- `npm run test:timetable-agent`
- `npm run test:timetable-admin`
- `npm run test:timetable-advanced`
- `npm run test:timetable-ui` (Chromium, fixture độc lập, không ghi dữ liệu giáo viên thật)
- `npm run lint` và `npm run build:static`
- `python3 -m pytest -q` trong `services/timetable-solver`

Các fixture ghi rõ là dữ liệu kiểm thử. Không dùng chúng làm số liệu thực nghiệm nhà trường.

Kiểm tra tải bổ sung: 50 lớp độc lập, 50 giáo viên, 200 tiết; xếp đủ và kiểm tra độc lập trong kiểm thử tự động. Thời gian phụ thuộc thiết bị và độ chặt của ràng buộc. Không coi mẫu này là cam kết hiệu năng mọi trường.

Cột Excel `Nhóm ghép` dùng dạng `6B:Nhóm 1;6C:Nhóm 2`; khai báo nhóm chính ở cột `Nhóm`. Mỗi lớp tách cần ít nhất hai nhóm riêng biệt. Tệp Excel có sheet `Phan cong` sẽ được đọc sheet này khi nhập lại. Mã JSON cũ vẫn được chấp nhận.
