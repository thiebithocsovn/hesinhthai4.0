export interface SchoolCounselingMessage {
  role: 'user' | 'model';
  text: string;
}

export type SchoolCounselingTopic =
  | 'immediate-danger'
  | 'sexual-abuse'
  | 'cyberbullying'
  | 'bullying'
  | 'exam-stress'
  | 'emotional-distress'
  | 'family-conflict'
  | 'learning-difficulty'
  | 'general';

export const SCHOOL_COUNSELING_SYSTEM_PROMPT = [
  'Bạn là trợ lý tư vấn học đường tại Việt Nam, hỗ trợ học sinh, giáo viên và phụ huynh.',
  'Trả lời hoàn toàn bằng tiếng Việt, thân thiện, thấu cảm, ngắn gọn và đưa ra bước xử lý cụ thể.',
  'Không chẩn đoán bệnh, không đổ lỗi, không yêu cầu họ tên, địa chỉ, mật khẩu hoặc thông tin riêng tư của trẻ.',
  'Khi có nguy cơ tự gây hại, bạo lực, xâm hại hoặc nguy hiểm tức thời, ưu tiên tìm người lớn tin cậy và gọi 111, 113 hoặc 115 phù hợp.',
  'Khuyến khích phối hợp giáo viên chủ nhiệm, phụ huynh, cán bộ tư vấn và chuyên gia khi cần.',
].join(' ');

export function normalizeSchoolCounselingText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(message: string, phrases: readonly string[]): boolean {
  return phrases.some(phrase => message.includes(phrase));
}

export function detectSchoolCounselingTopic(message: string): SchoolCounselingTopic {
  const normalized = normalizeSchoolCounselingText(message);
  if (!normalized) return 'general';

  if (includesAny(normalized, [
    'tu tu', 'tu sat', 'muon chet', 'khong muon song', 'ket thuc cuoc doi',
    'tu lam hai', 'tu hai', 'rach tay', 'cat tay', 'nhay lau', 'treo co',
    'uong thuoc tu tu', 'uong thuoc doc',
    'dang bi danh', 'de doa giet', 'co dao', 'co hung khi',
  ])) {
    return 'immediate-danger';
  }

  if (includesAny(normalized, [
    'xam hai', 'quay roi tinh duc', 'bi sam so', 'so vao vung kin',
    'ep quan he', 'anh nhay cam', 'clip nhay cam', 'doi anh nong',
    'grooming', 'cuong hiep',
  ])) {
    return 'sexual-abuse';
  }

  if (includesAny(normalized, [
    'bat nat tren mang', 'bao luc mang', 'dang anh', 'dang clip',
    'facebook', 'zalo', 'tiktok', 'nhom chat', 'binh luan xau',
    'tin nhan xuc pham', 'tai khoan gia', 'boi nho tren mang',
  ])) {
    return 'cyberbullying';
  }

  if (includesAny(normalized, [
    'bat nat', 'bao luc hoc duong', 'bi danh', 'danh nhau', 'de doa',
    'co lap', 'tay chay', 'che gieu', 'xuc pham', 'tran lot',
    'phan biet doi xu', 'beu xau',
  ])) {
    return 'bullying';
  }

  if (includesAny(normalized, [
    'thi cu', 'ky thi', 'ap luc thi', 'diem kem', 'diem thap',
    'so thi', 'kiem tra', 'hoc qua nhieu', 'mat ngu vi thi',
    'ap luc diem so', 'on thi',
  ])) {
    return 'exam-stress';
  }

  if (includesAny(normalized, [
    'lo au', 'tram cam', 'buon chan', 'co don', 'cang thang',
    'hoang so', 'mat ngu', 'khong ai hieu', 'met moi',
    'stress', 'tu ti', 'so hai',
  ])) {
    return 'emotional-distress';
  }

  if (includesAny(normalized, [
    'bo me', 'cha me', 'phu huynh', 'gia dinh', 'bo danh',
    'me mang', 'ly hon', 'cai nhau o nha', 'con toi',
  ])) {
    return 'family-conflict';
  }

  if (includesAny(normalized, [
    'khong hieu bai', 'hoc kem', 'mat goc', 'mat tap trung',
    'khong theo kip', 'chan hoc', 'phuong phap hoc', 'bo hoc',
    'nghi hoc', 'lam bai tap',
  ])) {
    return 'learning-difficulty';
  }

  return 'general';
}

export function requiresImmediateSchoolSafetySupport(message: string): boolean {
  const topic = detectSchoolCounselingTopic(message);
  return topic === 'immediate-danger' || topic === 'sexual-abuse';
}

function resolveRelevantMessage(message: string, history: readonly SchoolCounselingMessage[]): string {
  if (detectSchoolCounselingTopic(message) !== 'general') return message;

  const previousUserMessage = [...history]
    .reverse()
    .find(item => item.role === 'user' && detectSchoolCounselingTopic(item.text) !== 'general');

  return previousUserMessage ? `${previousUserMessage.text}. ${message}` : message;
}

export function buildOfflineSchoolCounselingReply(
  message: string,
  history: readonly SchoolCounselingMessage[] = [],
): string {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    return 'Bạn có thể chia sẻ ngắn gọn tình huống đang gặp phải. Không cần cung cấp họ tên, địa chỉ hoặc thông tin riêng tư của học sinh.';
  }

  const relevantMessage = resolveRelevantMessage(cleanMessage, history);
  const topic = detectSchoolCounselingTopic(relevantMessage);

  if (topic === 'immediate-danger') {
    return [
      '**Ưu tiên an toàn ngay lúc này.** Bạn không cần xử lý một mình.',
      '',
      '1. Đến nơi an toàn, tránh xa dao, thuốc, nơi cao hoặc người đang đe dọa; không để người gặp nguy hiểm ở một mình.',
      '2. Báo ngay cho cha mẹ, giáo viên chủ nhiệm, ban giám hiệu hoặc một người lớn tin cậy gần nhất.',
      '3. Gọi **111** để được Tổng đài quốc gia bảo vệ trẻ em hỗ trợ; nếu đang có bạo lực/nguy hiểm gọi **113**; nếu cần cấp cứu y tế gọi **115**.',
      '4. Nếu bạn là giáo viên hoặc phụ huynh, hãy ở cạnh trẻ, lắng nghe không phán xét và phối hợp cơ sở y tế/cơ quan chức năng.',
      '',
      '**Bạn hoặc người đang gặp nguy hiểm hiện có ở gần một người lớn an toàn không?**',
    ].join('\n');
  }

  if (topic === 'sexual-abuse') {
    return [
      '**Điều quan trọng nhất là bảo vệ sự an toàn và quyền riêng tư của trẻ.** Sự việc không phải lỗi của người bị hại.',
      '',
      '1. Rời khỏi người hoặc nơi có nguy cơ; tìm ngay cha mẹ, giáo viên hoặc người lớn đáng tin cậy.',
      '2. Không đối chất một mình, không tiếp tục gửi hình ảnh/thông tin cá nhân; lưu lại tin nhắn, đường dẫn và bằng chứng nếu có thể an toàn.',
      '3. Gọi **111** để được hướng dẫn bảo vệ trẻ em; nếu nguy hiểm tức thời hoặc có hành vi phạm pháp, gọi **113**; gọi **115** khi cần hỗ trợ y tế.',
      '4. Nhà trường và gia đình cần bảo mật thông tin, phối hợp cơ quan chức năng và chuyên gia tâm lý.',
      '',
      '**Bạn có thể nói mình là học sinh, giáo viên hay phụ huynh để tôi gợi ý bước tiếp theo phù hợp hơn.**',
    ].join('\n');
  }

  const guidance: Record<Exclude<SchoolCounselingTopic, 'immediate-danger' | 'sexual-abuse'>, { title: string; steps: string[]; question: string }> = {
    cyberbullying: {
      title: 'Tình huống có dấu hiệu bắt nạt hoặc xúc phạm trên môi trường mạng.',
      steps: [
        'Không đáp trả bằng lời xúc phạm; chụp màn hình và lưu liên kết, thời gian, tài khoản liên quan.',
        'Chặn hoặc báo cáo tài khoản/nội dung vi phạm trên nền tảng, đồng thời rà soát quyền riêng tư.',
        'Chia sẻ ngay với giáo viên chủ nhiệm, phụ huynh hoặc người lớn tin cậy để nhà trường phối hợp xử lý.',
        'Nếu có đe dọa, tống tiền hoặc lan truyền hình ảnh nhạy cảm của trẻ, liên hệ **111** hoặc **113**.',
      ],
      question: 'Sự việc xảy ra trên nhóm lớp, mạng xã hội hay tin nhắn riêng?',
    },
    bullying: {
      title: 'Bạn đang mô tả tình huống có dấu hiệu bắt nạt hoặc bạo lực học đường.',
      steps: [
        'Ưu tiên đến nơi an toàn; tránh gặp riêng hoặc trả đũa người gây hại.',
        'Ghi lại thời điểm, địa điểm, người chứng kiến và bằng chứng phù hợp; không chia sẻ thông tin riêng tư công khai.',
        'Thông báo giáo viên chủ nhiệm, ban giám hiệu và phụ huynh để xây dựng phương án bảo vệ, theo dõi và hỗ trợ.',
        'Nếu nguy cơ tiếp diễn, gọi **111** để được tư vấn; gọi **113** nếu có đe dọa hoặc bạo lực trực tiếp.',
      ],
      question: 'Tình huống xảy ra một lần hay lặp lại nhiều lần?',
    },
    'exam-stress': {
      title: 'Áp lực học tập và thi cử có thể giảm khi chia nhỏ việc cần làm.',
      steps: [
        'Tạm nghỉ, hít thở chậm và xác định môn hoặc phần kiến thức gây áp lực nhất.',
        'Lập kế hoạch ôn tập theo từng khoảng 25–30 phút, xen kẽ 5 phút nghỉ và mục tiêu vừa sức.',
        'Duy trì ngủ đủ, ăn uống, vận động nhẹ; tránh so sánh điểm số hoặc thức quá khuya.',
        'Trao đổi với giáo viên, cha mẹ hoặc cán bộ tư vấn nếu lo lắng kéo dài hoặc ảnh hưởng sinh hoạt.',
      ],
      question: 'Bạn đang lo nhất về môn học, điểm số hay kỳ vọng của gia đình?',
    },
    'emotional-distress': {
      title: 'Cảm xúc của bạn đáng được lắng nghe và không nên phải chịu đựng một mình.',
      steps: [
        'Tìm một người đáng tin cậy để chia sẻ: giáo viên, phụ huynh, bạn thân hoặc cán bộ tư vấn.',
        'Thử hít vào chậm 4 nhịp, giữ 4 nhịp và thở ra 6 nhịp; uống nước và nghỉ ngơi.',
        'Ghi lại điều gì khiến cảm xúc nặng hơn và điều gì giúp bạn cảm thấy an toàn hơn.',
        'Nếu tình trạng kéo dài, mất ngủ nhiều hoặc ảnh hưởng học tập, hãy nhờ gia đình/nhà trường kết nối chuyên gia.',
      ],
      question: 'Cảm giác này bắt đầu từ khi nào và hiện bạn có người nào có thể trò chuyện cùng không?',
    },
    'family-conflict': {
      title: 'Mâu thuẫn gia đình cần được xử lý bình tĩnh và đặt sự an toàn của học sinh lên trước.',
      steps: [
        'Chọn thời điểm yên tĩnh, dùng câu bắt đầu bằng “Con/em cảm thấy...” thay vì trách móc.',
        'Nhờ giáo viên chủ nhiệm hoặc người thân đáng tin cậy làm cầu nối nếu khó trao đổi trực tiếp.',
        'Thống nhất một vấn đề nhỏ cần giải quyết trước, ví dụ lịch học, thời gian nghỉ hoặc cách góp ý.',
        'Nếu có đánh đập, đe dọa hoặc bạo lực gia đình, tìm nơi an toàn và gọi **111** hoặc **113**.',
      ],
      question: 'Khó khăn chủ yếu liên quan đến việc học, cách ứng xử hay sự an toàn ở nhà?',
    },
    'learning-difficulty': {
      title: 'Khó khăn học tập có thể cải thiện từng bước khi xác định đúng phần kiến thức đang vướng.',
      steps: [
        'Ghi rõ bài hoặc kỹ năng chưa hiểu; bắt đầu từ kiến thức nền thay vì học dàn trải.',
        'Nhờ giáo viên hướng dẫn một ví dụ mẫu, sau đó tự làm một bài tương tự và đối chiếu từng bước.',
        'Chia mục tiêu thành việc nhỏ mỗi ngày; học cùng bạn hoặc tham gia phụ đạo khi phù hợp.',
        'Phối hợp gia đình và giáo viên để điều chỉnh kế hoạch; tránh phê bình, so sánh hoặc gây áp lực.',
      ],
      question: 'Bạn đang gặp khó ở môn nào và học lớp mấy?',
    },
    general: {
      title: 'Cảm ơn bạn đã chia sẻ. Tôi có thể hỗ trợ phân tích tình huống học đường theo hướng an toàn và tôn trọng.',
      steps: [
        'Mô tả ngắn gọn sự việc: điều gì xảy ra, mức độ lặp lại và cảm xúc của người liên quan.',
        'Xác định trước tiên có nguy cơ mất an toàn, bị đe dọa, bắt nạt hoặc xâm hại hay không.',
        'Tìm giáo viên chủ nhiệm, phụ huynh hoặc người lớn đáng tin cậy để cùng xây dựng cách xử lý.',
        'Không công khai họ tên, địa chỉ, hình ảnh riêng tư hoặc thông tin nhạy cảm của học sinh.',
      ],
      question: 'Bạn là học sinh, giáo viên hay phụ huynh, và tình huống chính là gì?',
    },
  };

  const item = guidance[topic];
  return [
    `**${item.title}**`,
    '',
    ...item.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `**${item.question}**`,
    '',
    '_Gợi ý này là hỗ trợ ban đầu, không thay thế tư vấn chuyên môn hoặc xử lý khẩn cấp._',
  ].join('\n');
}

interface BrowserLanguageModelSession {
  prompt: (value: string) => Promise<string>;
  destroy?: () => void;
}

interface BrowserLanguageModel {
  availability?: () => Promise<string>;
  create: () => Promise<BrowserLanguageModelSession>;
}

export async function tryBrowserSchoolCounseling(
  message: string,
  history: readonly SchoolCounselingMessage[] = [],
): Promise<string> {
  const browser = globalThis as typeof globalThis & { LanguageModel?: BrowserLanguageModel };
  const model = browser.LanguageModel;
  if (!model || typeof model.create !== 'function') return '';

  try {
    if (typeof model.availability === 'function') {
      const availability = await model.availability();
      if (availability !== 'available' && availability !== 'readily') return '';
    }

    const relevantHistory = history.slice(-6)
      .map(item => `${item.role === 'user' ? 'Người hỏi' : 'Trợ lý'}: ${item.text.slice(0, 1200)}`)
      .join('\n');

    const session = await model.create();
    try {
      const prompt = [
        SCHOOL_COUNSELING_SYSTEM_PROMPT,
        relevantHistory ? `Bối cảnh gần đây:\n${relevantHistory}` : '',
        `Tình huống cần tư vấn: ${message.trim().slice(0, 2500)}`,
      ].filter(Boolean).join('\n\n');

      return (await session.prompt(prompt)).trim();
    } finally {
      session.destroy?.();
    }
  } catch (error) {
    console.info('AI trên thiết bị chưa sẵn sàng; chuyển sang hướng dẫn học đường tích hợp.', error);
    return '';
  }
}
