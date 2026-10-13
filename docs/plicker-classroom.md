# Thẻ tương tác lớp học: thiết kế và thuật toán

## Tài liệu tham khảo chính thức

- [Plickers: tổng quan về thẻ](https://help.plickers.com/hc/en-us/articles/360009089113-Cards-Overview)
- [Plickers: hướng dẫn quét câu trả lời](https://help.plickers.com/hc/en-us/articles/360009089693-How-to-scan-your-students-answers)
- [Plickers: quy trình vận hành lớp học](https://help.plickers.com/hc/en-us/articles/360009395854-What-is-Plickers)
- [Plickers: bảng kết quả Scoresheet](https://help.plickers.com/hc/en-us/articles/360008946014-What-is-the-Scoresheet)

Các tài liệu công khai mô tả nguyên lý: mỗi học sinh được gắn một mã thẻ,
đáp án A/B/C/D được xác định bởi cạnh nằm phía trên và mỗi lớp sử dụng tối đa
63 mẫu thẻ. Thuật toán nội bộ và từ điển mã của sản phẩm Plickers là tài sản
riêng, không được công bố đầy đủ. Vì vậy dự án này xây dựng bộ mã riêng theo
nguyên lý tương tự, không sao chép hoặc tuyên bố tương thích thẻ thương mại.

## Cấu trúc mã thẻ

Mỗi thẻ sử dụng lưới nhị phân 7 × 7:

1. Viền ngoài màu đen giúp phát hiện vùng hình vuông.
2. Tám ô định hướng phân biệt bốn chiều xoay.
3. Sáu ô dữ liệu biểu diễn mã học sinh từ 1 đến 63.
4. Ba ô kiểm tra phát hiện trường hợp đọc nhầm hoặc ảnh có chất lượng thấp.

Vị trí các chữ xung quanh thẻ là A ở trên, B bên phải, C bên dưới và D bên
trái. Khi học sinh xoay thẻ, phần mềm kiểm tra bốn chiều xoay của ma trận rồi
lấy đáp án tương ứng với cạnh hiện nằm phía trên.

## Quy trình xử lý ảnh

```text
Camera → ảnh xám → ngưỡng Otsu → thành phần liên thông tối →
lọc hình vuông → chuẩn hóa bốn góc → lấy mẫu 7 × 7 →
đọc chiều xoay → giải mã 6 bit → kiểm tra 3 bit →
ổn định qua nhiều khung hình → gắn với học sinh → lưu kết quả
```

Bộ quét xử lý nhiều vùng hình vuông trong cùng một khung hình. Với mỗi mã
học sinh chỉ giữ kết quả có độ tin cậy cao nhất. Đáp án chỉ được chấp nhận sau
khi xuất hiện ổn định trong ít nhất hai khung hình liên tiếp, giúp giảm rung và
đọc sai khi camera hoặc thẻ di chuyển.

Toàn bộ ảnh được xử lý trực tiếp trên trình duyệt; không cần API `/api/scan-plicker`,
không cần khóa AI và không gửi hình ảnh học sinh lên máy chủ bên ngoài.

## Sử dụng

1. Tạo lớp học và nhập danh sách học sinh.
2. In bộ thẻ do chính ứng dụng tạo cho lớp đó.
3. Tạo bộ câu hỏi và chọn đáp án đúng hoặc để trống cho câu khảo sát.
4. Bắt đầu buổi học và cấp quyền camera cho trình duyệt.
5. Yêu cầu học sinh xoay cạnh A/B/C/D mong muốn lên phía trên.
6. Quét lớp, theo dõi kết quả trực tiếp rồi lưu báo cáo hoặc xuất CSV.

Nếu camera chưa khả dụng, giáo viên vẫn có thể nhập lựa chọn A/B/C/D thủ công
trong danh sách học sinh. Khi chuyển sang câu tiếp theo, câu trả lời trước đó
vẫn được giữ trong báo cáo buổi học.

## Kiểm thử

```bash
npm run test:plicker
npm run test:platform
npm run test:gesture
npm run lint
npm run build
```

Bộ kiểm thử thị giác máy tính kiểm tra đủ 63 mã, cả bốn chiều xoay, nhận dạng
nhiều thẻ trong cùng một ảnh, khả năng chịu nhiễu, thẻ nghiêng và thuật toán ổn
định kết quả theo thời gian.
