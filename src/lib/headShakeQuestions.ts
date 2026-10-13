export interface GeneratedHeadShakeQuestion {
  text: string;
  leftAnswer: string;
  rightAnswer: string;
  correctAnswer: 'left' | 'right';
  points: number;
}

type KnowledgeItem = readonly [question: string, correct: string, incorrect: string];

type BrowserAiSession = {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
};

type BrowserLanguageModel = {
  availability?: () => Promise<string>;
  create: () => Promise<BrowserAiSession>;
};

const QUESTION_LIMIT = 20;

const KNOWLEDGE_BANK: Record<string, readonly KnowledgeItem[]> = {
  ai: [
    ['AI là tên viết tắt của lĩnh vực nào?', 'Trí tuệ nhân tạo', 'Âm thanh Internet'],
    ['AI học cách nhận biết mẫu chủ yếu từ đâu?', 'Dữ liệu', 'May mắn'],
    ['Có nên kiểm tra lại thông tin do AI tạo ra không?', 'Có', 'Không'],
    ['Có nên nhập mật khẩu cá nhân vào công cụ AI không?', 'Không', 'Có'],
    ['Prompt là gì khi sử dụng AI?', 'Yêu cầu gửi cho AI', 'Mật khẩu máy tính'],
    ['Khi dùng AI làm bài tập, học sinh cần làm gì?', 'Hiểu và kiểm chứng câu trả lời', 'Chép nguyên văn không cần đọc'],
    ['AI có thể tạo ra thông tin sai không?', 'Có thể', 'Không bao giờ'],
    ['Dữ liệu nào cần tránh đưa lên công cụ AI công khai?', 'Thông tin cá nhân nhạy cảm', 'Tên môn học'],
    ['Nhận diện khuôn mặt là ứng dụng của lĩnh vực nào?', 'Trí tuệ nhân tạo', 'Đo nhiệt độ thủ công'],
    ['Để AI trả lời đúng yêu cầu, câu lệnh nên như thế nào?', 'Rõ ràng, cụ thể', 'Mơ hồ, thiếu bối cảnh'],
    ['Ai chịu trách nhiệm kiểm tra sản phẩm do AI hỗ trợ tạo?', 'Người sử dụng', 'Không có ai'],
    ['Một ứng dụng AI có thể hỗ trợ học tập bằng cách nào?', 'Gợi ý và giải thích kiến thức', 'Bảo đảm mọi đáp án luôn đúng'],
  ],
  informatics: [
    ['Thiết bị nào dùng để nhập văn bản vào máy tính?', 'Bàn phím', 'Loa'],
    ['Thiết bị nào hiển thị hình ảnh từ máy tính?', 'Màn hình', 'Micro'],
    ['Tổ hợp phím thường dùng để sao chép là gì?', 'Ctrl + C', 'Ctrl + P'],
    ['Tổ hợp phím thường dùng để dán là gì?', 'Ctrl + V', 'Ctrl + S'],
    ['Phần mềm bảng tính thường dùng để làm gì?', 'Tính toán và xử lý bảng dữ liệu', 'Giặt quần áo'],
    ['Mật khẩu an toàn nên có đặc điểm nào?', 'Dài và khó đoán', 'Chỉ gồm số 123456'],
    ['Khi nhận liên kết lạ, em nên làm gì?', 'Kiểm tra trước khi mở', 'Mở ngay và nhập mật khẩu'],
    ['Internet giúp người dùng thực hiện việc nào?', 'Trao đổi và tìm kiếm thông tin', 'Thay thế hoàn toàn việc học'],
    ['Thư mục trên máy tính dùng để làm gì?', 'Sắp xếp tệp', 'Tăng âm lượng loa'],
    ['Dữ liệu cá nhân có nên đăng công khai tùy ý không?', 'Không', 'Có'],
    ['Một thuật toán là gì?', 'Dãy bước giải quyết vấn đề', 'Tên một loại bàn phím'],
    ['Khi sử dụng thông tin trên mạng, em cần làm gì?', 'Kiểm tra nguồn và trích dẫn', 'Sao chép không ghi nguồn'],
    ['Thiết bị nào giúp di chuyển con trỏ trên màn hình?', 'Chuột máy tính', 'Máy in'],
    ['Tệp có đuôi .xlsx thường thuộc loại nào?', 'Bảng tính', 'Tệp âm thanh'],
  ],
  vietnamese: [
    ['Từ chỉ người, vật hoặc hiện tượng thuộc nhóm từ nào?', 'Danh từ', 'Động từ'],
    ['Từ chỉ hoạt động hoặc trạng thái thuộc nhóm từ nào?', 'Động từ', 'Danh từ'],
    ['Từ chỉ đặc điểm của sự vật thuộc nhóm từ nào?', 'Tính từ', 'Động từ'],
    ['Cuối câu hỏi thường sử dụng dấu nào?', 'Dấu chấm hỏi', 'Dấu phẩy'],
    ['Từ nào đồng nghĩa với “chăm chỉ”?', 'Siêng năng', 'Lười biếng'],
    ['Từ nào trái nghĩa với “cao”?', 'Thấp', 'Dài'],
    ['Bộ phận trả lời câu hỏi “Ai? Cái gì?” thường là gì?', 'Chủ ngữ', 'Dấu câu'],
    ['Đoạn văn thường có nội dung như thế nào?', 'Tập trung vào một ý chính', 'Gồm các câu không liên quan'],
    ['Khi kể chuyện, các sự việc cần được sắp xếp thế nào?', 'Theo trình tự hợp lý', 'Ngẫu nhiên, không cần liên kết'],
    ['Biện pháp so sánh giúp câu văn như thế nào?', 'Gợi hình và sinh động', 'Mất hoàn toàn ý nghĩa'],
    ['Tên riêng của người cần được viết như thế nào?', 'Viết hoa đúng quy tắc', 'Viết thường tất cả'],
    ['Khi đọc hiểu, em nên làm gì trước?', 'Xác định nội dung chính', 'Đoán mà không đọc'],
  ],
  english: [
    ['Từ “book” trong tiếng Anh có nghĩa là gì?', 'Quyển sách', 'Cái ghế'],
    ['Từ “teacher” có nghĩa là gì?', 'Giáo viên', 'Bác sĩ'],
    ['Từ “student” có nghĩa là gì?', 'Học sinh', 'Đầu bếp'],
    ['Từ “red” chỉ màu nào?', 'Màu đỏ', 'Màu xanh lá'],
    ['Từ “seven” chỉ số nào?', 'Số 7', 'Số 11'],
    ['Câu “How are you?” dùng để làm gì?', 'Hỏi thăm sức khỏe', 'Hỏi giá tiền'],
    ['Đáp lại “Thank you”, em có thể nói gì?', 'You’re welcome.', 'Good night.'],
    ['Từ “Monday” chỉ ngày nào?', 'Thứ Hai', 'Chủ nhật'],
    ['Từ “water” có nghĩa là gì?', 'Nước', 'Lửa'],
    ['Từ “school” có nghĩa là gì?', 'Trường học', 'Bệnh viện'],
    ['Câu “I am a student.” có nghĩa là gì?', 'Tôi là học sinh.', 'Tôi là giáo viên.'],
    ['Từ “beautiful” có nghĩa là gì?', 'Đẹp', 'Nguy hiểm'],
    ['Từ “apple” chỉ loại quả nào?', 'Quả táo', 'Quả cam'],
    ['Câu “Good morning!” thường dùng khi nào?', 'Buổi sáng', 'Nửa đêm'],
  ],
  science: [
    ['Thực vật cần khí nào để quang hợp?', 'Khí carbon dioxide', 'Khí helium'],
    ['Cơ quan nào bơm máu đi khắp cơ thể?', 'Tim', 'Dạ dày'],
    ['Nước đóng băng ở nhiệt độ nào trong điều kiện thông thường?', '0°C', '100°C'],
    ['Nước sôi ở nhiệt độ nào trong điều kiện thông thường?', '100°C', '0°C'],
    ['Trái Đất quay quanh thiên thể nào?', 'Mặt Trời', 'Mặt Trăng'],
    ['Bộ phận nào của cây thường hút nước từ đất?', 'Rễ', 'Hoa'],
    ['Con người cần khí nào để hô hấp?', 'Oxygen', 'Carbon dioxide'],
    ['Mặt Trăng là gì của Trái Đất?', 'Vệ tinh tự nhiên', 'Một ngôi sao'],
    ['Âm thanh truyền được trong môi trường nào?', 'Không khí', 'Chân không tuyệt đối'],
    ['Đơn vị thường dùng để đo lực là gì?', 'Newton', 'Mét'],
    ['Hiện tượng nước chuyển thành hơi gọi là gì?', 'Bay hơi', 'Đông đặc'],
    ['Vật nào thường dẫn điện tốt?', 'Dây đồng', 'Nhựa khô'],
    ['Động vật nào thuộc nhóm động vật có vú?', 'Cá voi', 'Cá chép'],
    ['Máu trong cơ thể được vận chuyển nhờ hệ nào?', 'Hệ tuần hoàn', 'Hệ tiêu hóa'],
  ],
  history: [
    ['Ai là người đọc Tuyên ngôn Độc lập ngày 2/9/1945?', 'Chủ tịch Hồ Chí Minh', 'Vua Quang Trung'],
    ['Chiến thắng Điện Biên Phủ diễn ra vào năm nào?', '1954', '1975'],
    ['Ngày Quốc khánh Việt Nam là ngày nào?', '2 tháng 9', '20 tháng 11'],
    ['Ngày Giải phóng miền Nam, thống nhất đất nước là ngày nào?', '30 tháng 4', '22 tháng 12'],
    ['Ai lãnh đạo cuộc khởi nghĩa Lam Sơn?', 'Lê Lợi', 'Ngô Quyền'],
    ['Ngô Quyền gắn với chiến thắng trên sông nào?', 'Bạch Đằng', 'Sông Hương'],
    ['Hai Bà Trưng đứng lên khởi nghĩa chống lại ách đô hộ nào?', 'Nhà Hán', 'Nhà Nguyễn'],
    ['Kinh đô Thăng Long nay thuộc thành phố nào?', 'Hà Nội', 'Huế'],
    ['Chiến thắng Ngọc Hồi - Đống Đa gắn với vị vua nào?', 'Quang Trung', 'Lý Công Uẩn'],
    ['Lý Công Uẩn dời đô ra Thăng Long vào năm nào?', '1010', '1945'],
    ['Văn Miếu - Quốc Tử Giám nằm ở đâu?', 'Hà Nội', 'Cần Thơ'],
    ['Ngày Nhà giáo Việt Nam là ngày nào?', '20 tháng 11', '1 tháng 6'],
  ],
  geography: [
    ['Thủ đô của Việt Nam là thành phố nào?', 'Hà Nội', 'Đà Nẵng'],
    ['Việt Nam nằm ở châu lục nào?', 'Châu Á', 'Châu Phi'],
    ['Vùng biển ở phía đông Việt Nam có tên là gì?', 'Biển Đông', 'Biển Đen'],
    ['Đỉnh núi cao nhất Việt Nam là đỉnh nào?', 'Fansipan', 'Everest'],
    ['Đồng bằng sông Cửu Long nằm ở miền nào?', 'Miền Nam', 'Miền Bắc'],
    ['Sông Hồng gắn với đồng bằng nào?', 'Đồng bằng Bắc Bộ', 'Đồng bằng sông Cửu Long'],
    ['Thái Nguyên nổi tiếng với sản phẩm nông nghiệp nào?', 'Chè', 'Cà phê Buôn Ma Thuột'],
    ['Hướng Mặt Trời mọc thường là hướng nào?', 'Hướng đông', 'Hướng tây'],
    ['Quả địa cầu mô phỏng hình dạng của thiên thể nào?', 'Trái Đất', 'Mặt Trăng'],
    ['Việt Nam có chung đường biên giới trên đất liền với Lào không?', 'Có', 'Không'],
    ['Đà Lạt thuộc vùng nào?', 'Tây Nguyên', 'Đồng bằng Bắc Bộ'],
    ['Vịnh Hạ Long thuộc tỉnh, thành nào?', 'Quảng Ninh', 'Nghệ An'],
  ],
  environment: [
    ['Việc nào giúp giảm rác thải nhựa?', 'Dùng bình nước nhiều lần', 'Dùng thêm túi nylon một lần'],
    ['Rác hữu cơ thường gồm loại nào?', 'Vỏ rau, củ, quả', 'Pin đã qua sử dụng'],
    ['Tắt điện khi ra khỏi phòng giúp ích gì?', 'Tiết kiệm năng lượng', 'Làm tăng lượng điện tiêu thụ'],
    ['Trồng cây xanh giúp cải thiện yếu tố nào?', 'Chất lượng không khí', 'Lượng rác nhựa'],
    ['Pin cũ cần được xử lý như thế nào?', 'Đưa đến điểm thu gom phù hợp', 'Vứt xuống ao hồ'],
    ['Cách nào giúp tiết kiệm nước?', 'Khóa vòi khi không sử dụng', 'Để nước chảy liên tục'],
    ['Khói bụi giao thông ảnh hưởng đến yếu tố nào?', 'Chất lượng không khí', 'Màu sách giáo khoa'],
    ['Hoạt động nào góp phần bảo vệ môi trường?', 'Phân loại rác', 'Đốt rác tùy tiện'],
    ['Tái sử dụng đồ dùng có lợi ích gì?', 'Giảm lượng chất thải', 'Tăng lượng rác'],
    ['Nguồn năng lượng nào là năng lượng tái tạo?', 'Năng lượng mặt trời', 'Than đá'],
    ['Hành vi nào giúp bảo vệ nguồn nước?', 'Không xả rác xuống sông', 'Đổ dầu thải xuống cống'],
    ['Đa dạng sinh học cần được bảo vệ vì sao?', 'Giữ cân bằng hệ sinh thái', 'Để khai thác không giới hạn'],
  ],
  traffic: [
    ['Khi đi xe máy, người tham gia giao thông cần làm gì?', 'Đội mũ bảo hiểm đúng cách', 'Không cần đội mũ'],
    ['Đèn giao thông màu đỏ báo hiệu điều gì?', 'Dừng lại', 'Đi nhanh qua'],
    ['Người đi bộ nên qua đường tại đâu?', 'Vạch dành cho người đi bộ', 'Bất kỳ vị trí khuất tầm nhìn'],
    ['Khi sang đường, em cần làm gì?', 'Quan sát các hướng', 'Vừa chạy vừa nhìn điện thoại'],
    ['Ngồi sau xe máy nên làm gì?', 'Ngồi ngay ngắn, bám chắc', 'Đùa nghịch trên xe'],
    ['Biển báo nguy hiểm thường có dạng nào?', 'Hình tam giác', 'Hình trái tim'],
    ['Có nên sử dụng điện thoại khi đang điều khiển xe không?', 'Không', 'Có'],
    ['Khi đi xe đạp, em nên đi như thế nào?', 'Đúng phần đường quy định', 'Dàn hàng ngang chiếm hết đường'],
    ['Đèn giao thông màu xanh cho phép điều gì?', 'Đi khi bảo đảm an toàn', 'Dừng giữa ngã tư'],
    ['Có nên đùa nghịch dưới lòng đường không?', 'Không', 'Có'],
    ['Khi trời tối, xe đạp cần chú ý điều gì?', 'Có đèn hoặc vật phản quang', 'Tắt mọi nguồn sáng'],
    ['Thắt dây an toàn khi ngồi ô tô nhằm mục đích gì?', 'Giảm nguy cơ chấn thương', 'Làm xe chạy nhanh hơn'],
  ],
  physicalEducation: [
    ['Trước khi vận động mạnh, em nên làm gì?', 'Khởi động kỹ', 'Chạy hết sức ngay'],
    ['Sau khi tập luyện, em nên làm gì?', 'Thả lỏng cơ thể', 'Dừng đột ngột và ngồi ngay'],
    ['Uống nước khi vận động nên như thế nào?', 'Uống từng ngụm phù hợp', 'Đợi đến khi kiệt sức'],
    ['Tập luyện thể dục đều đặn giúp gì?', 'Nâng cao sức khỏe', 'Làm cơ thể yếu đi'],
    ['Khi bị đau trong lúc tập, em nên làm gì?', 'Dừng lại và báo giáo viên', 'Tiếp tục tập bất chấp'],
    ['Trang phục khi vận động nên như thế nào?', 'Gọn gàng, phù hợp', 'Vướng víu và quá chật'],
    ['Môn bóng đá chủ yếu dùng bộ phận nào để chuyền bóng?', 'Chân', 'Khuỷu tay'],
    ['Tinh thần fair-play có nghĩa là gì?', 'Chơi trung thực, tôn trọng đối thủ', 'Tìm cách gian lận'],
    ['Nhịp tim thường thay đổi thế nào khi vận động?', 'Tăng lên', 'Ngừng hoàn toàn'],
    ['Khi tập ngoài trời nắng, em nên chú ý điều gì?', 'Uống nước và nghỉ phù hợp', 'Tập liên tục không nghỉ'],
    ['Kỹ thuật hít thở phù hợp giúp ích gì?', 'Hỗ trợ vận động hiệu quả', 'Làm giảm an toàn khi tập'],
    ['Khởi động các khớp có tác dụng gì?', 'Giảm nguy cơ chấn thương', 'Làm tăng nguy cơ té ngã'],
  ],
  finance: [
    ['Tiết kiệm là gì?', 'Dành lại một phần tiền để dùng sau', 'Chi hết tiền ngay lập tức'],
    ['Trước khi mua hàng, em nên làm gì?', 'So sánh nhu cầu và giá', 'Mua ngay không cần cân nhắc'],
    ['Chi tiêu hợp lý cần ưu tiên điều gì?', 'Nhu cầu cần thiết', 'Mọi món đồ đang quảng cáo'],
    ['Ghi chép thu chi giúp ích gì?', 'Quản lý tiền hiệu quả', 'Làm mất toàn bộ tiền'],
    ['Mục tiêu tiết kiệm nên như thế nào?', 'Cụ thể và phù hợp', 'Mơ hồ, không giới hạn'],
    ['Có nên chia sẻ mã OTP ngân hàng cho người lạ không?', 'Không', 'Có'],
    ['Khi mua sắm trực tuyến, cần làm gì?', 'Kiểm tra độ tin cậy của người bán', 'Chuyển tiền cho mọi tài khoản lạ'],
    ['Khoản nào thường là nhu cầu thiết yếu?', 'Đồ dùng học tập cần thiết', 'Món đồ mua chỉ vì bạn bè có'],
    ['Lãi kép là gì?', 'Tiền lãi tiếp tục tạo ra lãi', 'Tiền gốc luôn bằng không'],
    ['Lập kế hoạch tài chính giúp gì?', 'Chủ động với các khoản thu chi', 'Không cần theo dõi chi tiêu'],
    ['Quỹ dự phòng nên dùng khi nào?', 'Khi có tình huống cần thiết', 'Để mua sắm bốc đồng'],
    ['Sản phẩm OCOP gắn với mục tiêu nào?', 'Phát triển sản phẩm địa phương', 'Loại bỏ mọi ngành nghề địa phương'],
  ],
  general: [
    ['Khi học một chủ đề mới, bước nào giúp hiểu bài?', 'Xác định ý chính', 'Bỏ qua toàn bộ nội dung'],
    ['Khi gặp thông tin chưa chắc chắn, em nên làm gì?', 'Kiểm tra nguồn đáng tin cậy', 'Chia sẻ ngay mà không kiểm tra'],
    ['Làm việc nhóm hiệu quả cần điều gì?', 'Lắng nghe và phân công', 'Để một người làm hết'],
    ['Khi chưa hiểu bài, em nên làm gì?', 'Đặt câu hỏi cho giáo viên', 'Giấu thắc mắc và bỏ học'],
    ['Ghi chú kiến thức có tác dụng gì?', 'Giúp hệ thống và ôn tập', 'Làm kiến thức biến mất'],
    ['Một ví dụ thực tế giúp học sinh làm gì?', 'Liên hệ và hiểu kiến thức', 'Không cần hiểu bài'],
    ['Khi trình bày ý kiến, em nên làm gì?', 'Nêu lý do và dẫn chứng', 'Nói mà không cần căn cứ'],
    ['Trước khi kết luận, em cần làm gì?', 'Xem xét thông tin liên quan', 'Đoán ngẫu nhiên'],
    ['Tôn trọng ý kiến khác biệt giúp gì?', 'Trao đổi tích cực', 'Ngăn mọi người học tập'],
    ['Khi sử dụng học liệu của người khác, em cần làm gì?', 'Ghi nguồn phù hợp', 'Nhận là sản phẩm của mình'],
    ['Ôn tập sau giờ học giúp gì?', 'Củng cố kiến thức', 'Làm mất kiến thức'],
    ['Tự đánh giá kết quả học tập giúp gì?', 'Nhận ra điểm cần cải thiện', 'Không cần cố gắng nữa'],
  ],
};

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function boundCount(count: number): number {
  const parsed = Number.isFinite(count) ? Math.trunc(count) : 5;
  return Math.max(1, Math.min(QUESTION_LIMIT, parsed));
}

function extractGrade(topic: string): number {
  const match = normalizeText(topic).match(/(?:lop|khoi|grade)\s*(1[0-2]|[1-9])(?!\d)/);
  return match ? Number(match[1]) : 5;
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function makeQuestion(text: string, correct: string, incorrect: string, index: number): GeneratedHeadShakeQuestion {
  const answerOnLeft = index % 2 === 0;
  return {
    text,
    leftAnswer: answerOnLeft ? correct : incorrect,
    rightAnswer: answerOnLeft ? incorrect : correct,
    correctAnswer: answerOnLeft ? 'left' : 'right',
    points: 10,
  };
}

function generateMathQuestion(topic: string, grade: number, index: number): GeneratedHeadShakeQuestion {
  const normalized = normalizeText(topic);
  const left = randomBetween(2, grade <= 2 ? 9 : 12);
  const right = randomBetween(2, grade <= 2 ? 9 : 12);
  const offset = index + 1;

  if (/phan so|rut gon|quy dong/.test(normalized)) {
    const numerator = 1 + index % 7;
    const denominator = numerator + 2 + index % 5;
    const multiplier = 2 + index % 3;
    return makeQuestion(
      `Phân số nào bằng ${numerator}/${denominator}?`,
      `${numerator * multiplier}/${denominator * multiplier}`,
      `${numerator * multiplier + 1}/${denominator * multiplier}`,
      index,
    );
  }

  if (/phan tram|ti le|ty le|%/.test(normalized)) {
    const percentage = [10, 20, 25, 50, 75][index % 5];
    const total = (4 + index) * 20;
    const answer = total * percentage / 100;
    return makeQuestion(`${percentage}% của ${total} bằng bao nhiêu?`, String(answer), String(answer + 5), index);
  }

  if (/so thap phan|thap phan/.test(normalized)) {
    const first = (left + offset / 10).toFixed(1);
    const second = (right / 10).toFixed(1);
    const answer = (Number(first) + Number(second)).toFixed(1);
    const incorrect = (Number(answer) + 0.1).toFixed(1);
    return makeQuestion(`${first.replace('.', ',')} + ${second.replace('.', ',')} = ?`, answer.replace('.', ','), incorrect.replace('.', ','), index);
  }

  if (/phuong trinh|tim x|bac nhat/.test(normalized)) {
    const solution = 2 + index;
    const coefficient = 2 + index % 4;
    const constant = 1 + index % 6;
    const result = coefficient * solution + constant;
    return makeQuestion(`Giải phương trình ${coefficient}x + ${constant} = ${result}. Giá trị của x là:`, String(solution), String(solution + 1), index);
  }

  if (/don thuc|da thuc|hang dang thuc|dai so/.test(normalized)) {
    const coefficientA = 2 + index;
    const coefficientB = 3 + index % 5;
    return makeQuestion(`Rút gọn biểu thức ${coefficientA}x + ${coefficientB}x.`, `${coefficientA + coefficientB}x`, `${coefficientA * coefficientB}x`, index);
  }

  if (/hinh hoc|chu vi|dien tich|hinh chu nhat|hinh vuong|tam giac/.test(normalized)) {
    const width = 2 + index % 7;
    const length = width + 2 + index % 4;
    const area = length * width;
    const perimeter = 2 * (length + width);
    if (index % 2 === 0) {
      const incorrectArea = area === perimeter ? perimeter + width : perimeter;
      return makeQuestion(`Hình chữ nhật dài ${length} cm, rộng ${width} cm có diện tích bằng bao nhiêu?`, `${area} cm²`, `${incorrectArea} cm²`, index);
    }
    const incorrectPerimeter = area === perimeter ? area + width : area;
    return makeQuestion(`Hình chữ nhật dài ${length} cm, rộng ${width} cm có chu vi bằng bao nhiêu?`, `${perimeter} cm`, `${incorrectPerimeter} cm`, index);
  }

  if (/phep chia|chia het|chia/.test(normalized)) {
    const divisor = 2 + index % 8;
    const quotient = 2 + index + right;
    return makeQuestion(`${divisor * quotient} : ${divisor} = ?`, String(quotient), String(quotient + 1), index);
  }

  if (/phep nhan|bang cuu chuong|nhan|nhân/.test(normalized) || grade === 3) {
    const multiplier = 2 + index % 8;
    const multiplicand = 2 + (index * 3) % 9;
    return makeQuestion(`${multiplier} × ${multiplicand} = ?`, String(multiplier * multiplicand), String(multiplier * multiplicand + multiplier), index);
  }

  if (/phep tru|tru/.test(normalized)) {
    const greater = left + right + offset;
    return makeQuestion(`${greater} − ${left} = ?`, String(greater - left), String(greater - left + 1), index);
  }

  const first = grade === 1 ? index % 9 + 1 : left + offset;
  const second = grade === 1 ? Math.min(9, 1 + index % 7) : right;
  if (grade >= 6 && index % 3 === 2) {
    return makeQuestion(`${first} × ${second} − ${second} = ?`, String(first * second - second), String(first * second + second), index);
  }
  return makeQuestion(`${first} + ${second} = ?`, String(first + second), String(first + second + 1 + index % 3), index);
}

function detectKnowledgeGroup(topic: string): string {
  const normalized = normalizeText(topic);
  if (/(^|\s)(ai|tri tue nhan tao|machine learning|gemini|chatgpt)(\s|$)/.test(normalized)) return 'ai';
  if (/tin hoc|may tinh|internet|lap trinh|thuat toan|nang luc so|chuyen doi so|scratch|python/.test(normalized)) return 'informatics';
  if (/tieng anh|english|tu vung|vocabulary|grammar|ngu phap anh/.test(normalized)) return 'english';
  if (/tieng viet|ngu van|van hoc|doc hieu|tap lam van|chinh ta|danh tu|dong tu|tinh tu/.test(normalized)) return 'vietnamese';
  if (/an toan giao thong|giao thong|bien bao|duong bo|atgt/.test(normalized)) return 'traffic';
  if (/moi truong|tai che|bien doi khi hau|rac thai|nang luong sach|bao ve nuoc/.test(normalized)) return 'environment';
  if (/the duc|the chat|gdtc|the thao|bong da|chay ben|khoi dong/.test(normalized)) return 'physicalEducation';
  if (/tai chinh|tiet kiem|lai kep|chi tieu|khoi nghiep|ocop/.test(normalized)) return 'finance';
  if (/lich su|dien bien|bach dang|quang trung|hai ba trung|thang long/.test(normalized)) return 'history';
  if (/dia ly|dia li|ban do|thai nguyen|bien dong|tay nguyen|dong bang/.test(normalized)) return 'geography';
  if (/khoa hoc|tu nhien|vat li|vat ly|hoa hoc|sinh hoc|quang hop|he mat troi|co the|thuc vat|dong vat|stem/.test(normalized)) return 'science';
  return 'general';
}

function isMathTopic(topic: string): boolean {
  const normalized = normalizeText(topic);
  const explicitlyMath = /toán/i.test(topic) || /(?:^|\s)toan(?:\s+(?:hoc|lop|khoi|grade|\d)|$)/.test(normalized);
  return explicitlyMath || /phan so|phan tram|thap phan|phuong trinh|hinh hoc|chu vi|dien tich|don thuc|da thuc|phep cong|phep tru|phep nhan|phep chia|bang cuu chuong|so hoc|dai so/.test(normalized);
}

function createPrompt(topic: string, count: number): string {
  return [
    'Bạn là giáo viên Việt Nam. Hãy tạo câu hỏi trắc nghiệm chính xác, phù hợp lứa tuổi.',
    `Chủ đề: ${topic.trim()}.`,
    `Số câu: ${count}. Mỗi câu chỉ có hai phương án, một phương án đúng.`,
    'Chỉ trả về mảng JSON hợp lệ, không dùng markdown, theo cấu trúc sau:',
    '[{"text":"Câu hỏi","leftAnswer":"Đáp án trái","rightAnswer":"Đáp án phải","correctAnswer":"left","points":10}]',
    'correctAnswer chỉ được là "left" hoặc "right". Không thêm nội dung ngoài JSON.',
  ].join('\n');
}

export function normalizeGeneratedHeadShakeQuestions(value: unknown, requestedCount = QUESTION_LIMIT): GeneratedHeadShakeQuestion[] {
  if (!Array.isArray(value)) return [];

  const limit = boundCount(requestedCount);
  const normalized: GeneratedHeadShakeQuestion[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const question = candidate as Record<string, unknown>;
    const text = typeof question.text === 'string' ? question.text.trim() : '';
    const leftAnswer = typeof question.leftAnswer === 'string' ? question.leftAnswer.trim() : '';
    const rightAnswer = typeof question.rightAnswer === 'string' ? question.rightAnswer.trim() : '';
    if (!text || !leftAnswer || !rightAnswer || leftAnswer === rightAnswer) continue;
    if (question.correctAnswer !== 'left' && question.correctAnswer !== 'right') continue;

    normalized.push({
      text,
      leftAnswer,
      rightAnswer,
      correctAnswer: question.correctAnswer,
      points: typeof question.points === 'number' && Number.isFinite(question.points) && question.points > 0
        ? Math.min(100, Math.round(question.points))
        : 10,
    });

    if (normalized.length >= limit) break;
  }

  return normalized;
}

export function generateOfflineHeadShakeQuestions(topic: string, requestedCount: number): GeneratedHeadShakeQuestion[] {
  const cleanTopic = topic.trim();
  if (!cleanTopic) return [];

  const count = boundCount(requestedCount);
  if (isMathTopic(cleanTopic)) {
    const grade = extractGrade(cleanTopic);
    const questions: GeneratedHeadShakeQuestion[] = [];
    const usedQuestionTexts = new Set<string>();

    for (let index = 0; index < count; index += 1) {
      let question = generateMathQuestion(cleanTopic, grade, index);
      let attempt = 0;
      while (usedQuestionTexts.has(question.text) && attempt < 50) {
        attempt += 1;
        question = generateMathQuestion(cleanTopic, grade, index + attempt * count);
      }
      usedQuestionTexts.add(question.text);
      questions.push(question);
    }

    return questions;
  }

  const group = detectKnowledgeGroup(cleanTopic);
  const bank = KNOWLEDGE_BANK[group];
  const rotation = randomBetween(0, bank.length - 1);

  return Array.from({ length: count }, (_, index) => {
    const item = bank[(rotation + index) % bank.length];
    if (index < bank.length) {
      const question = group === 'general' ? `Với chủ đề “${cleanTopic}”: ${item[0]}` : item[0];
      return makeQuestion(question, item[1], item[2], index);
    }

    const statementIsCorrect = index % 2 === 0;
    const statedAnswer = statementIsCorrect ? item[1] : item[2];
    const statement = `Nhận định sau đúng hay sai: Với câu hỏi “${item[0]}”, đáp án là “${statedAnswer}”.`;
    return makeQuestion(statement, statementIsCorrect ? 'Đúng' : 'Sai', statementIsCorrect ? 'Sai' : 'Đúng', index);
  });
}

export async function tryGenerateHeadShakeQuestionsWithBrowserAi(topic: string, requestedCount: number): Promise<GeneratedHeadShakeQuestion[]> {
  const browser = globalThis as typeof globalThis & { LanguageModel?: BrowserLanguageModel };
  const model = browser.LanguageModel;
  if (!model || typeof model.create !== 'function') return [];

  try {
    if (typeof model.availability === 'function') {
      const status = await model.availability();
      if (status !== 'available' && status !== 'readily') return [];
    }

    const session = await model.create();
    try {
      const answer = await session.prompt(createPrompt(topic, boundCount(requestedCount)));
      const json = answer.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      return normalizeGeneratedHeadShakeQuestions(JSON.parse(json), requestedCount);
    } finally {
      session.destroy?.();
    }
  } catch (error) {
    console.info('AI trong trình duyệt chưa khả dụng, chuyển sang chế độ dự phòng.', error);
    return [];
  }
}
