<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Lớp Học Thông Minh 4.0

Nền tảng trò chơi và công cụ giáo dục tương tác dành cho giáo viên, tích hợp camera và nhận diện cử chỉ ngay trên trình duyệt.

Website: <https://trungtuyen.github.io/4.0/>

## Danh mục 13 ứng dụng

| Ứng dụng | Mục đích | Điều kiện hoạt động |
| --- | --- | --- |
| GestureClass | Quản lý lớp, ngân hàng câu hỏi, trắc nghiệm cử chỉ, lật thẻ và gọi tên | Trình duyệt, camera |
| Trắc nghiệm 10 dạng | Tạo ngân hàng câu hỏi với 10 dạng trắc nghiệm cơ bản bằng Question Engine dùng chung | Trình duyệt; dữ liệu dùng thử lưu trên thiết bị và tách theo tài khoản giáo viên |
| Vòng quay may mắn | Chọn học sinh hoặc phần thưởng ngẫu nhiên | Trình duyệt |
| Bốc thẻ tương tác | Bốc và lật thẻ trong hoạt động trên lớp | Trình duyệt |
| Tương tác thẻ Plicker | Quản lý câu hỏi, lớp học và nhận diện thẻ đáp án | Firebase; nhận diện camera trực tiếp trên thiết bị |
| Tường học tập Ai | Chia sẻ bài làm, nhận xét và học liệu | Firebase Authentication và Firestore |
| Lắc đầu chọn đáp án | Trả lời câu hỏi bằng chuyển động đầu | Trình duyệt, camera; tự tạo câu hỏi ngay trên GitHub Pages |
| Tư vấn học đường AI | Hỗ trợ phân tích và trao đổi về tình huống học đường | Google Gemini qua Firebase AI Logic; có dự phòng trên thiết bị |
| Quản lý kỳ thi | Tạo đề, tổ chức thi và tổng hợp kết quả | Firebase; chấm phiếu OMR cần máy chủ AI |
| Mở ô bí mật | Tổ chức trò chơi câu hỏi hoặc phần thưởng | Trình duyệt |
| Kéo thả đúng chỗ | Tạo bài tập kéo thả đáp án | Trình duyệt |
| Gộp tệp Excel | Ghép dữ liệu từ nhiều bảng tính | Trình duyệt |
| Tách, gộp file PDF | Tách từng trang, trích khoảng trang hoặc ghép nhiều tài liệu PDF | Trình duyệt |

## Cổng thi học sinh

Trang đăng nhập học sinh sử dụng bố cục quyển sách hai trang, tối ưu cho cả máy tính và điện thoại. Trang trái là biểu mẫu đăng nhập; trang phải tự động truy xuất các kỳ thi có trạng thái **Đang mở** từ Firestore, hiển thị lịch bắt đầu, thời lượng, số câu hỏi và trạng thái **Đang mở/Sắp diễn ra**. Kỳ thi bản nháp hoặc đã đóng không xuất hiện trong thông báo; mã đăng nhập vẫn được giáo viên cung cấp riêng cho học sinh.

## Thống kê cộng đồng tại chân trang

Chân trang hiển thị tám chỉ số: **lượt truy cập, trường đăng ký, giáo viên tham gia, người đang trực tuyến, lớp học, học sinh, kỳ thi và số ứng dụng giáo dục**. Số liệu công khai được phân phối chủ yếu qua tệp tĩnh `public/platform-stats.json`, phù hợp với CDN miễn phí; mỗi trình duyệt kiểm tra lại tối đa 15 phút một lần. Khi tệp tĩnh chưa có số đăng ký, ứng dụng chỉ đọc đúng một tài liệu tổng hợp `platform_stats/overview` làm phương án dự phòng.

- Trang chủ không tạo truy vấn đếm Firestore, không mở luồng realtime và không ghi nhịp hoạt động từ mỗi lượt truy cập. Vì vậy số lần đọc/ghi Firebase không tăng theo số người chỉ mở trang chủ.
- Khi quản trị viên đăng nhập, ứng dụng tổng hợp số lượng giáo viên đang hoạt động và số trường khác nhau. Bộ nhớ trên thiết bị và tài liệu `platform_stats/overview` chỉ chứa số lượng; không chứa tên, email hay danh sách trường.
- Tệp `platform-stats.json` chỉ chứa số liệu đã xác minh. Quản trị viên hoặc quy trình tổng hợp riêng có thể cập nhật tệp định kỳ; giá trị chưa xác minh phải giữ `null` và hiển thị `—`, tuyệt đối không tự tạo số liệu.
- Khi chưa có số liệu tổng hợp, lượt truy cập và phiên đang hoạt động chỉ phản ánh trình duyệt hiện tại; giao diện không tuyên bố đây là tổng số trực tuyến toàn hệ thống.
- Rules chỉ cho khách `get` tài liệu tổng hợp `platform_stats/overview`, cấm truy vấn danh sách và chỉ cho quản trị ghi đúng các trường số lượng đã được kiểm tra. Hồ sơ giáo viên, học sinh và bài thi vẫn không công khai.

## Kiến trúc local-first và khả năng chịu tải

- Các ứng dụng được tải theo nhu cầu; giao diện quản trị không tải toàn bộ trò chơi, Plicker, Excel, PDF và quản lý thi khi giáo viên chưa mở.
- Firestore dùng bộ nhớ tạm thời theo mặc định, vì vậy máy tính dùng chung không giữ lâu dữ liệu của giáo viên trước. Chỉ đặt `VITE_FIRESTORE_CACHE_MODE=persistent` trên thiết bị cá nhân được quản lý khi cần IndexedDB, đồng bộ nhiều tab và mở lại dữ liệu đã truy cập lúc mất mạng.
- Màn hình danh sách kỳ thi chỉ theo dõi danh sách đề. Danh sách học sinh/lớp, kết quả và giám sát phòng thi chỉ kết nối khi giáo viên mở đúng chức năng; nhịp cập nhật phòng thi là 60 giây.
- Website có thể cài cả hệ sinh thái bằng `smartclass.webmanifest`; luồng cài riêng ứng dụng Plicker bằng `plicker.webmanifest` vẫn được giữ nguyên.
- Service worker lưu giao diện, GestureClass, biểu tượng và bản thống kê công khai để giảm tải mạng và hỗ trợ mở lại nội dung đã dùng khi mất kết nối.
- Tính năng xác thực tập trung, thi trực tuyến đồng thời, đồng bộ thời gian thực và AI đám mây vẫn chịu hạn mức Firebase hoặc nhà cung cấp AI. Kiến trúc này giảm tải đáng kể nhưng không thay thế kiểm thử tải hoặc cam kết tự động phục vụ 50.000 người.

## Triển khai miễn phí bằng Cloudflare Pages

Giữ nguyên kho GitHub và đường dẫn hiện tại; Cloudflare Pages là lựa chọn phân phối tĩnh bổ sung:

1. Tạo dự án Cloudflare Pages từ kho `trungtuyen/4.0`.
2. Chọn lệnh build `npm run build:static` và thư mục đầu ra `dist`; tệp `.npmrc` đã xử lý tương thích các gói React hiện có.
3. Nếu cần, thêm biến `VITE_APP_BASE_PATH=/`; Cloudflare Pages cũng được nhận diện tự động qua `CF_PAGES=1`.
4. Thêm tên miền `*.pages.dev` của dự án vào Firebase Authentication → **Authorized domains** trước khi kiểm thử đăng nhập.
5. Nếu đã bật App Check/reCAPTCHA, đăng ký thêm tên miền `*.pages.dev` tương ứng.
6. Tệp `_routes.json` chỉ cho phép `/api/*` đi qua Cloudflare Functions; HTML, CSS, JavaScript, ảnh, manifest và thống kê vẫn là tài nguyên tĩnh miễn phí.

GitHub Pages tiếp tục dùng đường dẫn `/4.0/`; manifest, biểu tượng và service worker dùng đường dẫn tương đối nên hoạt động cả trên Cloudflare Pages và GitHub Pages.

## GestureClass — lớp học tương tác

GestureClass là ứng dụng độc lập trong danh mục chung và thư viện quản trị. Mô-đun sử dụng cùng phiên truy cập của hệ sinh thái, xử lý camera trực tiếp trên thiết bị và không yêu cầu máy chủ riêng.

- Quản lý ngân hàng câu hỏi và danh sách lớp học.
- Nhập câu hỏi Excel/CSV và xuất CSV.
- Trắc nghiệm bằng 1–4 ngón tay, chuột hoặc bàn phím.
- Lật thẻ ôn tập và gọi học sinh ngẫu nhiên.
- Đường dẫn trực tiếp: <https://trungtuyen.github.io/4.0/gestureclass/>.

## Trắc nghiệm 10 dạng — Question Studio

Question Studio là ứng dụng độc lập trong hệ sinh thái, đồng thời vẫn có thể mở từ GestureClass. Ứng dụng dùng một Question Engine chung cho 10 dạng: một đáp án đúng, nhiều đáp án đúng, Đúng/Sai, Đúng/Sai nhiều ý, trả lời ngắn, điền khuyết, ghép đôi, sắp xếp thứ tự, phân loại/kéo thả và chọn vị trí trên hình.

- Giáo viên có thể tạo nhiều bộ câu hỏi, đặt điểm, sửa, nhân bản và xóa câu hỏi.
- Dữ liệu trình duyệt được đặt tên theo UID Firebase của giáo viên; khi phiên xác thực được khôi phục sau tải lại trang, ứng dụng chuyển sang đúng ngân hàng của tài khoản đó.
- Khách chưa đăng nhập có vùng dữ liệu dùng thử riêng trên thiết bị.
- Lõi Question Engine tách khỏi giao diện để có thể dùng tiếp cho Quản lý kỳ thi, Plicker, trò chơi và AI tạo đề.

## Chạy tại máy tính

Yêu cầu Node.js 20 trở lên.

```bash
npm install --legacy-peer-deps
npm run dev
```

Máy chủ phát triển chạy tại `http://localhost:3000`. Tư vấn học đường sử dụng mặc định **Google Gemini 3.1 Flash-Lite** qua Firebase AI Logic; không cần vận hành máy chủ Node.js riêng. Nếu tự triển khai máy chủ tùy chọn, đặt biến môi trường `GEMINI_API_KEY` **chỉ trên máy chủ**. Không đưa khóa API Gemini vào mã frontend, GitHub Pages hoặc biến có tiền tố `VITE_`.

## Google Gemini, Firebase AI Logic và GitHub Pages

GitHub Pages chỉ triển khai giao diện tĩnh. Để dùng AI đám mây an toàn, ứng dụng gọi **Google Gemini 3.1 Flash-Lite** thông qua Firebase AI Logic; Firebase quản lý việc ủy quyền tới Gemini, không cần nhúng khóa Gemini bí mật vào trình duyệt.

- **Tương tác thẻ Plicker:** thuật toán nhận diện thẻ xử lý khung hình ngay trên thiết bị; chỉ sử dụng Firebase để lưu lớp, câu hỏi và đồng bộ buổi học. Không cần máy chủ AI để quét thẻ.
- **Tư vấn học đường AI:** ưu tiên máy chủ riêng nếu quản trị viên chủ động cấu hình; mặc định sử dụng Google Gemini qua Firebase AI Logic; khi chưa kích hoạt Firebase AI, mất mạng hoặc hết hạn mức, tự động dùng AI trong trình duyệt nếu khả dụng rồi chuyển sang bộ tư vấn học đường tích hợp.
- Tình huống có nguy cơ tự gây hại, bạo lực hoặc xâm hại được ưu tiên hướng dẫn an toàn ngay trên thiết bị, kèm số **111**, **113** và **115** phù hợp.

Để kích hoạt **Google Gemini** trên dự án Firebase hiện có:

1. Mở Firebase Console → **AI Services → AI Logic → Get started**.
2. Chọn **Gemini Developer API** để có thể sử dụng hạn mức miễn phí phù hợp.
3. Đăng ký ứng dụng web của dự án `gen-lang-client-0870957273` trong **App Check** bằng **reCAPTCHA Enterprise**, cho phép domain `thiebithocsovn.github.io`. Giữ App Check được thực thi cho AI Logic; không tắt bảo vệ để bỏ qua lỗi kết nối.
4. Đặt repository variable `VITE_FIREBASE_APP_CHECK_SITE_KEY` bằng site key công khai của reCAPTCHA Enterprise. Không đặt secret key tại đây.
5. Nếu cần đổi model, đặt repository variable `VITE_GOOGLE_AI_MODEL`; mặc định là `gemini-3.1-flash-lite`.
6. Chạy lại workflow GitHub Pages. Khi Firebase AI Logic chưa được kích hoạt, tư vấn tích hợp trên thiết bị vẫn tiếp tục hoạt động.

Riêng ứng dụng **Lắc đầu chọn đáp án** tạo câu hỏi theo ba lớp dự phòng: ưu tiên máy chủ AI đã cấu hình, sau đó sử dụng AI có sẵn trong trình duyệt nếu thiết bị hỗ trợ, cuối cùng dùng bộ tạo câu hỏi theo môn học chạy trực tiếp trên thiết bị. Vì vậy nút **Tạo bằng AI** vẫn hoạt động ngay trên GitHub Pages, không yêu cầu đưa khóa API vào mã frontend. Chế độ trên thiết bị hỗ trợ Toán theo dạng bài và khối lớp, Tin học, AI, Tiếng Việt, Tiếng Anh, Khoa học, Lịch sử, Địa lý, Giáo dục thể chất, môi trường, an toàn giao thông và tài chính cá nhân.

Máy chủ Node.js riêng vẫn là lựa chọn bổ sung cho OMR hoặc hệ thống có yêu cầu riêng: triển khai `server.ts` lên dịch vụ HTTPS, khai báo `GEMINI_API_KEY`, tùy chọn `GEMINI_MODEL=gemini-3.1-flash-lite`, giới hạn `ALLOWED_ORIGINS` và cấu hình `VITE_API_BASE_URL`. Endpoint `/api/health` chỉ công khai tình trạng cấu hình và tên model, không tiết lộ khóa.

## Tài khoản giáo viên và quản trị

- Đăng nhập sử dụng Firebase Authentication; ứng dụng không lưu mật khẩu dưới dạng văn bản trong Firestore.
- Quản trị viên có thể đăng nhập bằng Google hoặc bằng email đã xác minh.
- Đăng nhập Google có nút hủy và thời gian chờ tối đa 2 phút; lỗi cửa sổ bị chặn, mất mạng hoặc tên miền chưa được cấp phép có thông báo tiếng Việt. Cửa sổ Google sử dụng phiên Firebase tạm trong bộ nhớ; kết quả đến sau khi hủy hoặc hết giờ không thể thay đổi tài khoản của ứng dụng. Bước xác thực chính chờ tối đa 30 giây, đọc hồ sơ giáo viên chờ tối đa 15 giây và lấy dữ liệu từ máy chủ trước khi cấp quyền. Chạy `npm run test:auth-flow` để kiểm tra các trường hợp này.
- Google provider phải được bật trong Firebase Authentication; **Authorized domains** của website này phải có `thiebithocsovn.github.io` (không thêm `https://` hoặc đường dẫn). GitHub Pages giữ `authDomain` Firebase hiện có và dùng popup; không tự chuyển sang redirect vì trình duyệt chặn lưu trữ bên thứ ba có thể làm luồng redirect không hoàn tất.
- Repository variable `VITE_ADMIN_EMAIL` là tùy chọn. Nếu chưa cấu hình, khi nhập tên `admin` hãy điền email Firebase của quản trị viên; hoặc đăng nhập bằng Google. Sau khi quyền quản trị được Firebase/Firestore xác minh, trình duyệt ghi nhớ email cho phiên hiện tại.
- Giáo viên mới được tạo ở trạng thái chờ duyệt; quản trị viên phải kích hoạt trước khi sử dụng thư viện.
- Firebase chặn trực tiếp giáo viên đang chờ duyệt hoặc đã bị khóa, kể cả khi cố truy vấn dữ liệu bên ngoài giao diện; tài khoản đang sử dụng bị đăng xuất ngay khi quản trị viên vô hiệu hóa.
- Chức năng khôi phục mật khẩu gửi liên kết bảo mật qua Firebase, không hiển thị hoặc đặt trực tiếp mật khẩu.
- Lớp học, danh sách học sinh, bài đăng, kỳ thi, phiên thi, điểm số và báo cáo được giới hạn theo UID Firebase của giáo viên; quản trị viên có thể truy cập dữ liệu của toàn hệ thống.
- Bộ câu hỏi, trò chơi, GestureClass, Plicker và báo cáo lưu trên trình duyệt sử dụng khóa riêng cho từng tài khoản, kể cả khi nhiều giáo viên dùng chung một thiết bị.
- Khi đổi tài khoản hoặc đăng xuất, hệ thống xóa phiên học sinh, đề thi đã giải mã và dấu vết phiên của giáo viên trước; dữ liệu tài khoản kế tiếp được tải lại từ đầu.
- Báo cáo Plicker, danh sách lớp và bộ câu hỏi đã đồng bộ được tổng hợp đầy đủ cho quản trị viên; giáo viên vẫn chỉ thấy dữ liệu thuộc UID Firebase của chính mình. Các bộ nhớ cũ không rõ chủ sở hữu không được tự động nhập sang tài khoản khác.
- Lịch thi công khai chỉ chứa tên kỳ thi, thời gian, thời lượng và số câu; không có mã thi, nội dung đề, đáp án, danh sách học sinh hoặc các mã đề. Đề thi gốc trong `exams` luôn riêng tư; bản dành cho học sinh nằm trong `public_exam_access`, được mã hóa AES-256-GCM với khóa dẫn xuất PBKDF2 và chỉ mở bằng mã thi hợp lệ. Không thể liệt kê các đề mã hóa nếu không có quyền quản trị.
- Khi giáo viên mở kỳ thi, hệ thống tạo danh mục đối chiếu học sinh bằng SHA-256 theo giáo viên và kỳ thi. Cổng thi không đọc danh sách lớp, bảng điểm hoặc báo cáo riêng; học sinh chưa có trong danh sách chỉ được đăng ký cho một kỳ thi đang mở. Mã kỳ thi mới gồm 12 chữ số ngẫu nhiên an toàn; mã đề trộn mới gồm 10 chữ số.
- Phiên thi và kết quả nộp phải thuộc học sinh đã đăng ký đúng giáo viên, đúng kỳ thi đang mở và có phiên đang làm bài; dữ liệu thừa, đổi chủ sở hữu hoặc điểm vượt số câu đều bị Firestore từ chối.
- Kiểm thử phân quyền mô phỏng 5.000 tài khoản: mỗi giáo viên chỉ thấy đúng một không gian của mình, khách không thấy dữ liệu riêng và quản trị viên xem được toàn bộ.
- `firebase.json` ghép chính xác bộ quy tắc với cơ sở dữ liệu `ai-studio-51fdfd5e-caf8-4640-bdd8-404753ba685e`. Nếu repository secret `FIREBASE_SERVICE_ACCOUNT_JSON` đã được cấu hình bằng tài khoản dịch vụ có quyền Firebase Rules, GitHub Actions tự xuất bản `firestore.rules` trước khi triển khai website.
- Nếu chưa có secret, quản trị viên Firebase vẫn phải mở dự án `gen-lang-client-0870957273`, chọn đúng cơ sở dữ liệu, dán `firestore.rules` vào **Firestore Database → Rules** rồi chọn **Publish**; hoặc đăng nhập Firebase CLI và chạy `npm run deploy:firestore`. Cho đến khi hoàn tất, máy chủ tiếp tục dùng bộ quy tắc đã triển khai trước đó.

## Chia sẻ Tường học tập Ai và nhận bài không cần đăng nhập

- Giáo viên mở bảng → **Chia sẻ** → **Cho phép học sinh nộp bài**, sau đó gửi liên kết hoặc mã QR. Bất kỳ học sinh nào có liên kết đều có thể nhập tên và gửi nội dung, ảnh hoặc liên kết tài liệu, không cần tạo tài khoản hay đăng nhập Firebase.
- Giáo viên có thể **Xóa bảng** ngay trong danh sách hoặc **Cài đặt bảng → Xóa lớp / bảng**. Bảng được chuyển vào **Thùng rác** của chủ sở hữu, các cột và bài làm được giữ lại, và liên kết học sinh bị tắt trong cùng một lần ghi. **Khôi phục** đưa bảng trở lại danh sách; giáo viên phải bật chia sẻ lại nếu muốn nhận bài tiếp.
- Vai trò công khai chỉ được xem nội dung đã công khai và tạo bài nộp vào hộp chờ của đúng bảng khi chế độ nhận bài đang bật. Khách không được sửa, xóa, chấm điểm, quản lý bảng hoặc đọc các bài đang chờ duyệt. Giáo viên duyệt bài trước khi đăng lên bảng.
- Chuyển sang **Chỉ xem** vẫn giữ liên kết hoạt động, nhưng máy chủ từ chối bài nộp mới ngay cả khi học sinh đã mở sẵn biểu mẫu. **Tắt liên kết** chặn truy cập công khai; bảng đã lưu trữ không nhận bài mới.
- Nếu xuất hiện lỗi **Missing or insufficient permissions**, cần xuất bản quyền Tường học tập Ai cho cơ sở dữ liệu **ai-studio-51fdfd5e-caf8-4640-bdd8-404753ba685e** của dự án **gen-lang-client-0870957273**. Việc cập nhật GitHub Pages riêng lẻ không cập nhật quyền Firebase. GitHub Actions ghi rõ bước này chưa hoàn tất nếu thiếu thông tin triển khai; không cần mở quyền ghi toàn bộ cơ sở dữ liệu.
- [firestore.learning-wall.rules](./firestore.learning-wall.rules) là bản cập nhật riêng cho Tường học tập Ai, ghép vào bộ quyền thực tế được đọc trên Firebase Console ngày 30/09/2026. Bản này bổ sung đường chia sẻ, khóa dữ liệu tường theo chủ sở hữu và giữ nguyên chính sách các ứng dụng khác trong bản đang triển khai. Sau khi đăng nhập Firebase CLI, chạy `npm run deploy:learning-wall` để xuất bản bằng [firebase.learning-wall-production.json](./firebase.learning-wall-production.json). `firestore.rules` vẫn là bộ quyền chuẩn đầy đủ của toàn hệ sinh thái; triển khai bộ này là phạm vi khác với bản cập nhật riêng cho tường.
- Kiểm thử quyền trên Firestore Emulator: `npx --yes firebase-tools@^15.17.0 emulators:exec --project demo-learning-wall --config firebase.learning-wall.json --only firestore "npm run test:learning-wall-rules"` (Node.js 20+ và Java 21+). Kiểm thử dùng dữ liệu mô phỏng, không gửi bài vào bảng thật.

## AI nhận xét bài làm trên Tường học tập Ai

Mở phần nhận xét của bài đăng hoặc nhấn **Phân tích AI**. Khung **Chat AI về bài làm này** nằm ngay trong phần nhận xét. Chat, đánh giá, duyệt, luyện tập và tiến bộ đều thực hiện trong cửa sổ hiện tại.

1. **Chat và đánh giá:** hỏi AI về lỗi, bằng chứng, câu hỏi kiểm chứng hoặc cách nhận xét. Chat gửi nội dung của đúng bài, đề và tiêu chí cùng 12 tin nhắn gần nhất. **Đưa vào ô nhận xét** chỉ điền bản soạn; giáo viên sửa rồi **Gửi nhận xét**. **AI đánh giá bài làm tại đây** tạo phân tích có cấu trúc để duyệt. Có thể bổ sung môn, lớp, đề, tiêu chí trong mục **Đề bài và tiêu chí dùng cho AI**. Chữ, TXT/CSV, ảnh/PDF tải trực tiếp được đọc; tài liệu Office và liên kết ngoài cần dán nội dung bổ sung.
2. **Giáo viên duyệt:** xác nhận hoặc loại bỏ từng lỗi. Lỗi được xác nhận cần nguyên nhân do giáo viên kết luận và căn cứ/câu trả lời học sinh. Giáo viên sửa nhận xét và tự quyết định điểm 0–10. Duyệt lưu nhận xét và điểm trong cùng một giao dịch; AI không tự chấm hoặc tự duyệt.
3. **Luyện tập:** AI tạo bài cho từng lỗi đã xác nhận ngay tại đây. Giáo viên sửa đề/gợi ý/đáp án/tiêu chí rồi **Duyệt và giao luyện tập**. Tải hoặc sao chép phiếu để gửi riêng; phiếu không có đáp án mẫu hoặc nhận định riêng. Học sinh nộp lại qua tường hoặc giáo viên; giáo viên nhập bài làm và căn cứ ở bước Tiến bộ.
4. **Tiến bộ:** lưu từng lượt với kết quả **Còn mắc lỗi / Đang cải thiện / Đã khắc phục** do giáo viên chọn. “Đã khắc phục” yêu cầu lần đánh giá mới nhất của mọi bài luyện tập cho lỗi đó đều đạt. **Tiến bộ học sinh** tổng hợp theo kỹ năng, có CSV. Mã học sinh do giáo viên xác minh nối nhiều bài trong cùng bảng và chủ sở hữu; tên tự khai trùng nhau không tự gộp hồ sơ.

Ngay trong phần nhận xét, giáo viên có **Chọn AI cho bài làm** gồm **ChatGPT · OpenAI**, **Gemini · Google**, **Claude · Anthropic**. Lựa chọn áp dụng cho chat, phân tích và tạo luyện tập; được nhớ riêng theo UID giáo viên và không lưu khóa. Đổi lựa chọn không gọi API, không gửi bài và không xóa bản nháp hoặc lịch sử. Kết quả kiểm tra kết nối cũ được xóa khi đổi AI; mỗi tin nhắn mới lưu tên model thực sự đã trả lời. Không tự chuyển sang dịch vụ khác khi lỗi.

Nút **Đăng nhập bằng Google** có ở lối vào tường và trong phần nhận xét. Nút này dùng luồng Firebase Authentication hiện có: popup có hủy/thời gian chờ, kiểm tra tài khoản và hồ sơ giáo viên đã được duyệt, rồi giữ giáo viên trong tường. Không tự cấp quyền giáo viên hoặc quản trị. **Đăng nhập Google chỉ xác thực tài khoản trong hệ sinh thái; không tự cấp API key, credit hoặc quyền gọi ChatGPT/Gemini/Claude**. Mỗi dịch vụ vẫn cần cấu hình và kiểm tra phản hồi thật. Không nhúng trang chat của nhà cung cấp hoặc lấy cookie/token của tài khoản chat cá nhân.

ChatGPT dùng **OpenAI Responses API** qua máy chủ riêng, mặc định `gpt-5.4-mini`. Gemini dùng Firebase AI Logic, model công khai theo `VITE_GOOGLE_AI_MODEL`. Claude dùng **Anthropic Messages API** qua cùng máy chủ riêng, mặc định `claude-sonnet-5-5`. Chat, phân tích và luyện tập vẫn ở ngay phần nhận xét. Firebase tiếp tục quản lý đăng nhập và dữ liệu. Các ứng dụng khác giữ cấu hình hiện có.

Thiết lập OpenAI:

1. Triển khai máy chủ riêng `server/wallApiServer.ts` bằng Node.js 22 trở lên có HTTPS (`npm run build:wall-api`, `npm run start:wall-api`), hoặc dùng bộ triển khai Cloud Run bên dưới. Máy chủ này chỉ phục vụ API tường học tập. GitHub Pages chỉ phục vụ giao diện và không chạy được máy chủ này.
2. Đặt `OPENAI_API_KEY` và tùy chọn `OPENAI_MODEL` trong hệ thống quản lý secret của máy chủ. Chỉ cấp quyền cần thiết cho dự án API, cấu hình hạn mức chi tiêu. API có cơ chế thanh toán riêng với gói ChatGPT. Không đưa khóa vào GitHub, giao diện, localStorage hoặc biến `VITE_`.
3. Thiết lập Firebase Admin Application Default Credentials cho đúng dự án `gen-lang-client-0870957273`; trên máy chủ riêng dùng tài khoản dịch vụ lưu ngoài kho mã. Máy chủ dùng `verifyIdToken(token, true)` để kiểm tra chữ ký, hết hạn, thu hồi và tài khoản bị vô hiệu hóa. Liệt kê UID giáo viên trong `OPENAI_TEACHER_UIDS`, hoặc email đã xác minh trong `OPENAI_TEACHER_EMAILS` (phân cách bằng dấu phẩy). Email chưa xác minh và tài khoản ẩn danh bị từ chối. Không có khóa hoặc danh sách tài khoản được phép thì từ chối toàn bộ yêu cầu.
4. Giới hạn `ALLOWED_ORIGINS` tới `https://thiebithocsovn.github.io` (và localhost khi phát triển). Đặt repository variable công khai `VITE_WALL_OPENAI_API_URL` bằng URL HTTPS của máy chủ, không thêm `/api/wall-ai`. `VITE_WALL_AI_PROVIDER` chỉ chọn giá trị mặc định (`openai`, `firebase-gemini`, `anthropic`); giáo viên có thể đổi trong giao diện. Chạy lại workflow để giao diện nhận URL. Tường không dùng URL máy chủ lưu trong trình duyệt vì không được gửi token Firebase tới một địa chỉ tùy ý.
5. Trong phần nhận xét, bấm **Kiểm tra kết nối AI**. Chỉ báo sẵn sàng khi OpenAI trả lời thật; yêu cầu kiểm tra không gửi bài làm hoặc thông tin học sinh. Thiếu URL, khóa, quyền giáo viên, hết hạn mức hay mất mạng đều báo lỗi và giữ bản đang soạn.

Hai proxy `/api/wall-ai` (OpenAI) và `/api/wall-claude` (Anthropic) xác thực trước khi đọc body, chặn origin lạ, giới hạn dữ liệu, có timeout và không cho trình duyệt chọn khóa/model/URL/system instruction. Chỉ chuyển ảnh/PDF dạng data, không tải URL do bài làm cung cấp. JSON Schema khóa mã yêu cầu; kết quả chưa đầy đủ/sai mã bị từ chối. OpenAI dùng `store:false`; đây không phải cam kết nhà cung cấp không lưu dữ liệu cho các mục đích vận hành. Proxy không ghi bài làm/token/khóa vào log, không thay đổi nhận xét hoặc điểm. Hai proxy dùng chung bộ đếm: 6 yêu cầu/phút và 80/ngày cho một giáo viên, 400/ngày tổng cộng, một yêu cầu đồng thời/giáo viên và ba yêu cầu đồng thời toàn máy chủ. Đổi giữa OpenAI/Claude không vượt qua hạn mức. Gemini trực tiếp chịu hạn mức Firebase AI Logic. Các bộ đếm proxy đặt lại khi tiến trình khởi động; triển khai nhiều instance cần hạn mức dùng chung và hạn mức chi tiêu ở từng nhà cung cấp.

Thiết lập Claude: cung cấp `ANTHROPIC_API_KEY` trong Secret Manager và tùy chọn `ANTHROPIC_MODEL` **chỉ trên máy chủ**. Nếu dùng chung máy chủ, frontend dùng URL `VITE_WALL_OPENAI_API_URL`; nếu tách máy chủ, đặt `VITE_WALL_ANTHROPIC_API_URL`. Không đặt khóa Anthropic vào `VITE_`, trình duyệt hoặc GitHub. [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) dùng `output_config.format`; schema gửi Claude bỏ `maxItems` không được hỗ trợ và ghi giới hạn trong mô tả, còn parser ứng dụng vẫn kiểm tra số lượng/kích thước trước khi lưu. Không tạo hoặc tự mua credit/khóa Claude qua giao diện chọn AI.

Đây là kết nối OpenAI API, **chưa phải lấy quyền từ gói ChatGPT hiện tại**. [Sign in with ChatGPT cho website](https://developers.openai.com/siwc/website) cần client được OpenAI cấp, callback đã đăng ký và máy chủ; quyền dùng gói ChatGPT cần được cấp riêng. [Luồng mã nguồn mở](https://developers.openai.com/siwc/token-sharing-open-source) áp dụng cho ứng dụng chạy cục bộ; ứng dụng lưu trữ từ xa phải đăng ký chương trình phù hợp. Không lấy cookie/token phiên ChatGPT hoặc yêu cầu mật khẩu của giáo viên. Kho không chứa credential OpenAI hoặc client ChatGPT đã được cấp quyền. Chỉ có mã triển khai không đồng nghĩa máy chủ hoặc AI đã hoạt động.

### Triển khai API tường học tập trên Cloud Run

Bộ triển khai dùng dự án Firebase hiện có `gen-lang-client-0870957273`, dịch vụ `learning-wall-ai` tại `asia-southeast1`. Yêu cầu Google Cloud CLI đã đăng nhập, quyền triển khai và **billing của dự án đã được bật**. Script không bật billing, mua credit OpenAI hoặc đăng nhập thay người dùng. Thiếu các điều kiện này sẽ dừng trước khi tạo tài nguyên. OpenAI cần credit API riêng; lỗi `credit_balance_exhausted` yêu cầu bổ sung credit trong [Billing](https://platform.openai.com/settings/organization/billing), không thể xử lý bằng đổi khóa hoặc chờ rồi thử lại.

Xem kế hoạch trước (thay email mẫu bằng tài khoản giáo viên đã xác minh trong Firebase):

```bash
npm run deploy:wall-api -- --teacher-email teacher@example.edu
```

Chạy triển khai khi các điều kiện trên đã đầy đủ. Tham số `--env-file` trỏ tới tệp `.env` đã được lưu riêng, có `OPENAI_API_KEY`; không chép khóa vào lệnh:

```bash
npm run deploy:wall-api -- --teacher-email teacher@example.edu --env-file /path/to/private/.env --apply
```

Có thể lặp `--teacher-email` hoặc `--teacher-uid` để cấp quyền cho các tài khoản đã được duyệt. Mặc định `--provider openai`. Để triển khai Claude, thêm `--provider anthropic`; để dùng cả hai, thêm `--provider openai --provider anthropic`. Tệp riêng phải chứa đúng credential của các nhà cung cấp đã chọn. Script tạo hai tài khoản dịch vụ riêng: `wall-ai-runtime` chỉ đọc trạng thái Firebase Authentication và đọc các secret đã chọn (`learning-wall-openai-key`, `learning-wall-anthropic-key`); `wall-ai-builder` dùng quyền `roles/run.builder` để xây dựng container. Khóa được chuyển tới Secret Manager qua stdin và ghim phiên bản cụ thể, không đi vào tham số lệnh hoặc ảnh container. `.gcloudignore` và `.dockerignore` chỉ cho phép các tệp cần để xây dựng API; `.env`, credential và mã giao diện bị loại khỏi gói tải lên.

Dịch vụ có tối thiểu 0, tối đa 1 instance, 1 CPU, 512Mi, concurrency 3, timeout 60 giây. HTTPS có thể truy cập công khai để trình duyệt gửi token; từng lệnh gọi AI vẫn phải qua Firebase và danh sách giáo viên. Các hạn mức theo tiến trình không thay thế hạn mức chi tiêu của OpenAI; khởi động lại hoặc đổi revision đặt lại bộ đếm. Cloud Run, Cloud Build, Artifact Registry và Secret Manager có thể tính phí theo sử dụng.

Sau triển khai, script kiểm tra `/healthz` và xác nhận yêu cầu không đăng nhập tới từng proxy đã chọn bị chặn HTTP 401, rồi trả URL cần đặt vào repository variable `VITE_WALL_OPENAI_API_URL`. Chạy lại GitHub Pages, chọn nhà cung cấp rồi **Kiểm tra kết nối AI** trong phần nhận xét bằng tài khoản giáo viên được phép. `/healthz` chỉ xác nhận cấu hình của từng proxy, không gọi AI và không chứng minh còn credit. Phải có phản hồi thật trước khi coi kết nối đã hoạt động. Mã máy chủ xây vào `api-dist/`, tách khỏi `dist/` được xuất bản lên GitHub Pages.

Để dùng Gemini, bật Firebase AI Logic và đăng ký App Check theo [hướng dẫn Firebase](https://firebase.google.com/docs/ai-logic/get-started), rồi chọn Gemini trong phần nhận xét. Giữ App Check hiện có; không đổi rules hoặc đưa secret Gemini vào frontend. Đăng nhập Google trên website không tự bật AI Logic hoặc App Check.

`wall_posts.aiAssessment`, `aiAssessmentHistory`, `aiChat` và `aiChatHistory` dùng quyền riêng hiện có của bài đăng; không thêm collection công khai hoặc nới rules. `sharedWallPost` loại toàn bộ chat, phân tích, điểm, nhận xét, đáp án, tiến bộ và lịch sử. Nội dung/ảnh có thể tự chứa thông tin cá nhân, cần kiểm tra trước khi gửi AI. Bài làm và lịch sử được coi là dữ liệu, không phải chỉ dẫn hệ thống. React hiển thị phản hồi dưới dạng chữ, không thực thi HTML từ AI.

Lưu chat kiểm tra lại chủ sở hữu, bảng, phiên đăng nhập, SHA-256 của bài và bản chat hiện có. Đổi bài hoặc tiêu chí cần bắt đầu cuộc trao đổi mới. Mỗi cuộc có tối đa 20 lượt hỏi/đáp, lưu tối đa 5 cuộc trước; không tự xóa lịch sử. Nếu lưu thất bại sau khi AI trả lời, có thể **Lưu cuộc trao đổi** mà không gọi AI lại. Phân tích mới giữ bản đã duyệt và luyện tập cũ trong lịch sử (tối đa 10 phiên bản, 100 lượt/phiếu và giới hạn kích thước tài liệu Firestore).

Kiểm tra mô-đun: `npm run test:wall-assessment` và `npm run test:wall-chat`; quyền riêng: `npm run test:learning-wall-rules`. Kiểm tra trình duyệt: `npx playwright install --with-deps chromium` rồi `npm run test:wall-assessment-ui` (Vite cổng 3199). Fixture và mô-đun AI giả lập chỉ dùng trong kiểm thử, không dùng dữ liệu/tài khoản thật và không đi vào bản build sản phẩm. Ảnh máy tính/điện thoại nằm trong artifact `wall-ai-ui-results` của GitHub Actions. `npm run test:wall-openai` kiểm tra proxy có xác thực, hạn mức, dữ liệu ảnh/PDF, phản hồi sai/lỗi, phân biệt lỗi billing với tốc độ và client giữ phiên đúng. `npm run test:wall-api` kiểm tra máy chủ chỉ có API riêng, email đã xác minh, bước kiểm tra billing trước khi sửa Google Cloud và loại credential khỏi gói tải lên; phần triển khai dùng mô phỏng, không tạo tài nguyên thật. Các kiểm thử giả lập không thay thế kiểm tra OpenAI thật sau khi cấu hình máy chủ và quyền API.

## Lộ trình tiếp theo

1. Hoàn tất credential và máy chủ OpenAI cho tường học tập; kiểm thử phản hồi thật ngay trong phần nhận xét.
2. Hoàn thiện xác thực học sinh, phân quyền theo trường/lớp và bảo vệ dữ liệu cá nhân.
3. Nâng cấp Plicker, chấm phiếu OMR, ngân hàng câu hỏi và báo cáo kết quả theo lớp.
4. Bổ sung quản lý trường học, gói sử dụng, thanh toán và thống kê thực tế.

## Kiểm tra

```bash
npm run lint
npm run lint:firestore
npm run test:gestureclass
npm run test:platform
npm run test:ai-services
npm run test:platform-metrics
npm run test:scalability
npm run test:teacher-isolation
npm run test:hardening
npm run test:security-hardening
npm run test:plicker-student-sync
npm run test:exam-privacy
npm run test:pwa
npm run build
```
