# Xếp thời khóa biểu thông minh — Giáo dục 4.0

## Mục tiêu

Ứng dụng phục vụ trường liên cấp **Tiểu học + THCS**, dùng một bộ máy xếp lịch chung để xử lý giáo viên dạy xuyên cấp, phòng bộ môn dùng chung và các ràng buộc đặc thù của nhà trường.

Kiến trúc triển khai:

```text
PlatformBootstrap
  ├─ SmartTimetablePublicPortal
  ├─ SmartTimetableLibraryPortal
  └─ SmartTimetableEntry
       ├─ TrialAccessGate
       ├─ Local-first workspace
       ├─ Firestore owner-scoped sync
       └─ SmartTimetable UI
            └─ timetable.worker.ts
                 └─ smartTimetable.ts
```

## Các ràng buộc được hỗ trợ

### Ràng buộc cứng

- Không trùng lớp tại cùng một tiết.
- Không trùng giáo viên tại cùng một tiết, kể cả giáo viên dạy cả Tiểu học và THCS.
- Không trùng phòng bộ môn.
- Giáo viên/lớp/phòng có thể khai báo các ô không khả dụng.
- Tiết cố định được giữ nguyên.
- Block 2–3 tiết phải nằm liên tiếp và không vượt qua ranh giới sáng/chiều.
- Có thể giới hạn số tiết tối đa/ngày và số tiết dạy liên tiếp của giáo viên.
- Có thể yêu cầu một phân công chỉ học buổi sáng hoặc chỉ buổi chiều.

### Ràng buộc mềm / tối ưu

- Ưu tiên các môn chính vào buổi sáng.
- Hạn chế tiết cuối.
- Hạn chế tiết trống xen kẽ của giáo viên.
- Hạn chế khoảng trống trong lịch lớp.
- Cân bằng tải giữa các ngày.
- Ưu tiên GVCN Tiểu học ở các vị trí phù hợp.
- Có thể khai báo các ô ưu tiên cho từng phân công hoặc giáo viên.

## Quy trình sử dụng khuyến nghị

1. Cấu hình số ngày học/tuần, số tiết/ngày và số tiết buổi sáng.
2. Nhập danh mục giáo viên, lớp, môn, phòng hoặc nhập trực tiếp từ Excel.
3. Nhập/kiểm tra phân công chuyên môn.
4. Khai báo GVCN, phòng bộ môn, tiết đôi, buổi học và tiết cố định.
5. Khóa các khoảng thời gian giáo viên/lớp/phòng không khả dụng.
6. Xem cảnh báo khả thi trước khi xếp.
7. Chạy **Xếp tự động**.
8. Kiểm tra mục **Chẩn đoán**.
9. Khóa các block đã tốt và tối ưu lại nếu cần.
10. Xuất Excel hoặc sao lưu JSON.

## Nhập Excel

Ứng dụng đọc sheet đầu tiên. Ba cột tối thiểu là:

- `Lớp`
- `Môn`
- `Giáo viên`

Các cột hỗ trợ:

| Cột | Ý nghĩa |
|---|---|
| Cấp | Tiểu học / THCS |
| Lớp | Tên lớp |
| Môn | Tên môn |
| Giáo viên | Giáo viên phụ trách |
| Cấp GV | Tiểu học / THCS / Liên cấp |
| GVCN | Đánh dấu giáo viên chủ nhiệm |
| Phòng | Phòng bộ môn |
| Tiết/tuần | Tổng số tiết mỗi tuần |
| Tối đa/ngày | Số tiết tối đa của phân công trong một ngày |
| Tiết đôi | Có / 2 / 3 |
| Buổi | Sáng / Chiều / Bất kỳ |
| Ưu tiên sáng | Có/Không |
| Tránh tiết cuối | Có/Không |
| Tiết cố định | Ví dụ `T6-5` |
| Tiết cấm | Ví dụ `T2-1;T3-2` |
| Tiết ưu tiên | Ví dụ `T3-2;T5-2` |

Có thể tải **file mẫu Excel** ngay trong giao diện ứng dụng.

## Bộ tối ưu

Bộ giải hiện tại sử dụng chiến lược **constraint-first randomized multi-start heuristic**:

1. Kiểm tra dữ liệu đầu vào.
2. Giữ các tiết người dùng đã khóa.
3. Đặt các tiết cố định.
4. Xếp các phân công khan hiếm/khó trước.
5. Loại toàn bộ vị trí vi phạm hard constraints.
6. Tính penalty cho các vị trí còn lại.
7. Sinh nhiều phương án với seed khác nhau.
8. Chọn phương án có tổng điểm phạt thấp nhất.

Điểm phạt rất lớn được dùng cho xung đột cứng và tiết chưa xếp; các yếu tố chất lượng như khoảng trống, môn chính học muộn và mất cân bằng tải có trọng số thấp hơn.

## Hiệu năng

Bộ tối ưu chạy trong **Web Worker**, vì vậy quá trình xếp lịch không khóa giao diện chính. Nếu trình duyệt không hỗ trợ Worker hoặc Worker lỗi, hệ thống tự chuyển sang solver dự phòng với số vòng tối ưu thấp hơn.

Định hướng mở rộng khi quy mô vượt khả năng xử lý hợp lý trên thiết bị:

```text
Web/PWA
  -> API job queue
  -> server-side solver (CP-SAT / OR-Tools hoặc solver tương đương)
  -> version store
  -> trả nhiều phương án xếp hạng
```

## Lưu dữ liệu và bảo mật

- Khách dùng thử: dữ liệu chỉ nằm trên thiết bị.
- Giáo viên đăng nhập: ứng dụng vẫn **local-first**, nên mất mạng vẫn tiếp tục làm việc.
- Khi có mạng, workspace hiện tại được đồng bộ tới `timetable_workspaces/{uid}`.
- Firestore Rules chỉ cho giáo viên đang hoạt động đọc/ghi document mang đúng UID của mình; quản trị viên có quyền giám sát.
- Lịch sử nhiều phương án được giữ local và có thể sao lưu JSON. Cloud chỉ giữ scenario hiện tại + phương án hiện tại để hạn chế kích thước document.

## Xuất báo cáo

File Excel gồm:

- Sheet tổng hợp.
- Một sheet cho từng lớp.
- Một sheet cho từng giáo viên.

Trong giao diện có thể xem trực tiếp theo:

- Lớp.
- Giáo viên.
- Phòng học.

## Kiểm thử hồi quy

Script `npm run test:smart-timetable` kiểm tra tối thiểu:

- Không trùng lớp, giáo viên, phòng.
- Tiết cố định giữ đúng vị trí.
- Tiết đôi nằm cùng ngày và liên tiếp.
- Block đã khóa không bị thay đổi khi tối ưu lại.
- Giờ giáo viên bận không bị sử dụng.
- Chế độ 6 ngày có Thứ Bảy.
- Bộ nhập Excel nhận tiết đôi, tiết cố định và GVCN.

## Giới hạn và hướng nâng cấp

Phiên bản này được thiết kế để dùng thực tế cho một trường và là nền tảng để nâng cấp tiếp. Với bài toán cực lớn hoặc hàng trăm ràng buộc nâng cao, nên chuyển solver sang dịch vụ máy chủ chuyên dụng. Các tính năng có thể bổ sung tiếp gồm dạy thay, kéo-thả có kiểm tra xung đột, khóa theo nhóm, phân quyền Ban giám hiệu/tổ chuyên môn, công bố lịch cho giáo viên và lịch theo tuần A/B.
