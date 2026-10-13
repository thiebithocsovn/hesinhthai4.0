(() => {
  "use strict";

  const requestedOwner = typeof window.location?.search === "string" && typeof URLSearchParams === "function"
    ? new URLSearchParams(window.location.search).get("owner")
    : "guest";
  const ownerUid = /^[a-zA-Z0-9_-]{1,128}$/.test(requestedOwner || "") ? requestedOwner : "guest";
  const STORAGE_KEY = `gestureclass.v1.private::${ownerUid}`;
  const SUBJECTS = ["Toán 8", "Tin học 6", "Tin học 7", "Tin học 8", "Tin học 9", "Toán 5", "Chủ đề AI"];
  const iconPaths = {
    hand: '<path d="M12 11V5a2 2 0 0 1 4 0v6"/><path d="M8 11V7a2 2 0 0 1 4 0v4"/><path d="M16 11V8a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-2a2 2 0 0 1 4 0v2"/>',
    dashboard: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/>',
    questions: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    camera: '<path d="M14 4h-4L8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.66 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.66a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.34 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
    spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z"/><path d="m19 14 .9 2.6L22 17.5l-2.1.9L19 21l-.9-2.6-2.1-.9 2.1-.9L19 14z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6M10 11v6M14 11v6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m-5 13h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/>',
    cards: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    shuffle: '<path d="m18 14 4 4-4 4"/><path d="M18 2l4 4-4 4"/><path d="M2 18h2.5a6 6 0 0 0 5-2.7l5-6.6a6 6 0 0 1 5-2.7H22"/><path d="M2 6h2.5a6 6 0 0 1 5 2.7l.5.7M14 14.6l.5.7a6 6 0 0 0 5 2.7H22"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v7a5 5 0 0 1-10 0V4Z"/><path d="M7 7H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h8"/>'
  };

  const icon = (name, size = 17) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.info}</svg>`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const uid = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const today = () => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

  const sampleNames = ["Nguyễn Minh Anh", "Trần Gia Bảo", "Hoàng Thu Hà", "Phạm Đức Huy", "Lê Khánh Linh", "Nông Quang Minh", "Bế Phương Thảo", "Đặng Tuấn Kiệt", "Ma Thùy Dương", "Vi Hoàng Nam", "Nguyễn Ngọc Ánh", "Triệu Hải Yến"];
  const sampleQuestions = [
    ["Đơn thức nào sau đây đồng dạng với 3x²y?", ["5x²y", "3xy²", "3x²", "3y²"], 0, "Toán 8", "Nhận biết"],
    ["Kết quả phép tính 2x + 5x là:", ["7x²", "7x", "10x", "3x"], 1, "Toán 8", "Nhận biết"],
    ["Giá trị của biểu thức 2a² khi a = 3 là:", ["6", "12", "18", "36"], 2, "Toán 8", "Thông hiểu"],
    ["Đa thức x² + 2x + 1 có bao nhiêu hạng tử?", ["1", "2", "3", "4"], 2, "Toán 8", "Nhận biết"],
    ["Thu gọn 4x²y − x²y ta được:", ["3x²y", "3xy", "5x²y", "3x²"], 0, "Toán 8", "Thông hiểu"],
    ["Bậc của đơn thức 5x³y² là:", ["2", "3", "5", "6"], 2, "Toán 8", "Thông hiểu"],
    ["Tích của 2x và 3x² bằng:", ["5x³", "6x²", "6x³", "5x²"], 2, "Toán 8", "Vận dụng"],
    ["Khi dùng AI, thông tin nào không nên đưa vào câu lệnh?", ["Tên một chủ đề học tập", "Dữ liệu cá nhân nhạy cảm", "Một bài toán minh hoạ", "Yêu cầu giải thích khái niệm"], 1, "Tin học 6", "Nhận biết"],
    ["Đâu là bước cần làm sau khi nhận câu trả lời từ AI?", ["Tin ngay toàn bộ", "Chia sẻ ngay", "Kiểm chứng nguồn và nội dung", "Xoá thiết bị"], 2, "Tin học 6", "Thông hiểu"],
    ["Tệp bảng tính thường có phần mở rộng nào?", [".mp3", ".xlsx", ".png", ".exe"], 1, "Tin học 7", "Nhận biết"],
    ["Để tạo mật khẩu an toàn, em nên:", ["Dùng ngày sinh", "Dùng 123456", "Kết hợp chữ, số và ký tự đặc biệt", "Cho bạn bè biết mật khẩu"], 2, "Tin học 7", "Thông hiểu"],
    ["Một gia đình dùng 50 kWh và tiết kiệm được 10%. Số điện tiết kiệm là:", ["2 kWh", "5 kWh", "10 kWh", "15 kWh"], 1, "Toán 8", "Vận dụng"]
  ];

  function createSeedData() {
    return {
      questions: sampleQuestions.map(([text, options, correct, subject, level], index) => ({ id: `sample-q-${index + 1}`, text, options, correct, subject, level, createdAt: "22/08/2026" })),
      classes: [
        { id: "class-8a", name: "Lớp 8A", subject: "Toán 8", students: sampleNames.map((name, index) => ({ id: `8a-${index + 1}`, name })), sessions: 4 },
        { id: "class-8b", name: "Lớp 8B", subject: "Toán 8", students: sampleNames.slice(0, 9).map((name, index) => ({ id: `8b-${index + 1}`, name })), sessions: 2 },
        { id: "class-6a", name: "Lớp 6A", subject: "Tin học 6", students: sampleNames.slice(0, 7).map((name, index) => ({ id: `6a-${index + 1}`, name })), sessions: 1 }
      ],
      sessions: [],
      activities: [
        { title: "Ngân hàng câu hỏi mẫu đã sẵn sàng", detail: "Toán 8 · Tin học 6, 7 · AI an toàn", time: "Vừa xong", type: "questions" },
        { title: "Khởi tạo 3 lớp học minh hoạ", detail: "8A · 8B · 6A", time: "Hôm nay", type: "people" },
        { title: "GestureClass đã tích hợp hệ sinh thái", detail: "Dữ liệu lớp lưu trên trình duyệt này", time: "Hôm nay", type: "shield" }
      ]
    };
  }

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return stored?.questions && stored?.classes ? stored : createSeedData();
    } catch {
      return createSeedData();
    }
  }

  const state = {
    data: loadData(),
    view: "dashboard",
    search: "",
    subject: "Tất cả môn",
    modal: null,
    drawerOpen: false,
    game: { questionIds: [], index: 0, selected: null, revealed: false, correct: 0, score: 0, finished: false, classId: "class-8a" },
    camera: { stream: null, detector: null, active: false, detecting: false, lastGesture: null, stableGesture: null, stableFrames: 0, lastSelectionAt: 0, raf: null, modelMessage: "Camera chưa bật" },
    flashcard: { index: 0, revealed: false }
  };

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch {
      toast("Không thể lưu trên trình duyệt; hãy kiểm tra chế độ riêng tư.", "error");
    }
  }

  function addActivity(title, detail, type = "spark") {
    state.data.activities.unshift({ title, detail, type, time: "Vừa xong" });
    state.data.activities = state.data.activities.slice(0, 8);
    save();
  }

  function toast(message, kind = "success") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    const item = document.createElement("div");
    item.className = `toast ${kind}`;
    item.innerHTML = `<span class="toast-icon">${icon(kind === "error" ? "close" : "check", 15)}</span><span>${esc(message)}</span>`;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }

  function navigate(view) {
    if (state.view === "play" && view !== "play") stopCamera();
    state.view = view;
    state.drawerOpen = false;
    if (view === "play" && !state.game.questionIds.length) prepareGame();
    render();
  }

  function prepareGame(subject = "Toán 8", classId = "class-8a") {
    const matching = state.data.questions.filter((question) => question.subject === subject);
    const questions = matching.length ? matching : state.data.questions;
    state.game = { questionIds: questions.map((question) => question.id), index: 0, selected: null, revealed: false, correct: 0, score: 0, finished: false, classId };
  }

  const currentQuestion = () => state.data.questions.find((question) => question.id === state.game.questionIds[state.game.index]);

  function shell(content) {
    const labels = { dashboard: "Tổng quan", questions: "Ngân hàng câu hỏi", classes: "Quản lý lớp học", play: "Phòng chơi cử chỉ" };
    return `<div class="app-shell${state.view === "play" ? " play-mode" : ""}">
      <aside class="sidebar ${state.drawerOpen ? "open" : ""}">
        <div class="brand"><div class="brand-mark">${icon("hand", 22)}</div><div><div class="brand-wordmark">Gesture<span>Class</span></div><div class="brand-caption">Học bằng chuyển động</div></div></div>
        <button class="school-switch" data-action="school-info"><div class="school-avatar">KL</div><div><div class="school-name">TH & THCS Kim Lư</div><div class="school-meta">Không gian giảng dạy mẫu</div></div>${icon("chevron", 13)}</button>
        <div class="nav-label">Không gian làm việc</div>
        <nav class="nav-list" aria-label="Điều hướng chính">
          ${navItem("dashboard", "dashboard", "Tổng quan")}
          ${navItem("questions", "questions", "Ngân hàng câu hỏi", state.data.questions.length)}
          ${navItem("classes", "people", "Lớp học", state.data.classes.length)}
          ${navItem("play", "play", "Phòng chơi cử chỉ")}
        </nav>
        <div class="nav-label">Công cụ nhanh</div>
        <div class="nav-list"><button class="nav-item" data-action="flashcards">${icon("cards")}<span>Lật thẻ ôn tập</span></button><button class="nav-item" data-action="random-picker">${icon("shuffle")}<span>Gọi tên ngẫu nhiên</span></button></div>
        <div class="sidebar-spacer"></div>
        <div class="privacy-note"><strong>${icon("shield", 13)} Xử lý trên thiết bị</strong>Camera xử lý trực tiếp trên thiết bị; không ghi hình hay tải video lên.</div>
        <div class="teacher-card"><div class="teacher-avatar">T</div><div class="teacher-info"><strong>Giáo viên</strong><span>Hệ sinh thái lớp học 4.0</span></div></div>
      </aside>
      <main class="main"><div class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="icon-button mobile-menu" data-action="toggle-menu" aria-label="Mở menu">${icon("menu")}</button><div class="breadcrumb">GestureClass &nbsp;/&nbsp; <strong>${labels[state.view]}</strong></div></div><div class="top-actions"><span class="status-pill"><span class="dot"></span>Hệ sinh thái 4.0</span><button class="icon-button" data-action="settings" aria-label="Thông tin ứng dụng">${icon("settings")}</button></div></div>${content}</main>
    </div>${modalMarkup()}`;
  }

  function navItem(view, iconName, label, count) {
    return `<button class="nav-item ${state.view === view ? "active" : ""}" data-action="navigate" data-view="${view}">${icon(iconName)}<span>${label}</span>${count === undefined ? "" : `<span class="nav-count">${count}</span>`}</button>`;
  }

  function heading(kicker, title, subtitle, action = "") {
    return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
  }

  function dashboardView() {
    const studentCount = state.data.classes.reduce((sum, item) => sum + item.students.length, 0);
    const sessionsCount = state.data.classes.reduce((sum, item) => sum + item.sessions, 0) + state.data.sessions.length;
    const subjects = [...new Set(state.data.questions.map((question) => question.subject))];
    const subjectGroups = subjects.slice(0, 3).map((subject, index) => {
      const count = state.data.questions.filter((question) => question.subject === subject).length;
      const className = index === 1 ? "green" : index === 2 ? "orange" : "";
      return `<div class="quiz-item"><div class="subject-icon ${className}">${icon(index ? "spark" : "questions", 19)}</div><div class="quiz-info"><strong>${esc(subject)} — Bộ câu hỏi tương tác</strong><span>${count} câu hỏi · Dữ liệu minh hoạ</span></div><button class="button secondary small" data-action="start-subject" data-subject="${esc(subject)}">${icon("play", 12)} Chơi</button></div>`;
    }).join("");

    return `${heading("Chào mừng trở lại", "Lớp học của thầy đã sẵn sàng 👋", "Soạn một bộ câu hỏi, bật camera và biến tiết học thành trải nghiệm tương tác.")}
      <section class="hero"><div class="hero-copy"><span class="hero-badge">${icon("spark", 12)} Bản mẫu có thể trải nghiệm ngay</span><h2>Giơ ngón tay. Chọn đáp án.</h2><p>Học sinh giơ 1, 2, 3 hoặc 4 ngón tay trước camera để trả lời. Có thể dùng bàn phím hoặc bấm đáp án khi chưa bật camera.</p><div class="hero-actions"><button class="button" data-action="start-subject" data-subject="Toán 8">${icon("play", 13)} Vào phòng chơi</button><button class="button secondary" data-action="navigate" data-view="questions">${icon("questions", 13)} Xem câu hỏi</button></div></div><div class="gesture-orbit">${icon("hand", 58)}</div></section>
      <section class="stats-grid" aria-label="Thống kê lớp học">${statCard("Câu hỏi sẵn sàng", state.data.questions.length, `${subjects.length} môn học`, "questions")}${statCard("Lớp đang quản lý", state.data.classes.length, "Dữ liệu minh hoạ", "people", "green")}${statCard("Học sinh mẫu", studentCount, "Danh sách có thể chỉnh sửa", "people", "orange")}${statCard("Phiên đã tổ chức", sessionsCount, "Bao gồm phiên minh hoạ", "chart", "rose")}</section>
      <section class="content-grid"><article class="panel"><div class="panel-header"><div><h2 class="panel-title">Bộ câu hỏi gần đây</h2><div class="panel-subtitle">Bắt đầu ngay với nội dung đã chuẩn bị</div></div><button class="button ghost small" data-action="navigate" data-view="questions">Xem tất cả ${icon("chevron", 12)}</button></div><div class="quiz-list">${subjectGroups}</div><div class="quick-tools"><button class="tool-tile" data-action="flashcards">${icon("cards", 18)}<strong>Lật thẻ ôn tập</strong><span>Lật để xem đáp án</span></button><button class="tool-tile" data-action="random-picker">${icon("shuffle", 18)}<strong>Gọi tên ngẫu nhiên</strong><span>Chọn học sinh công bằng</span></button></div></article>
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Hoạt động gần đây</h2><div class="panel-subtitle">Được cập nhật trên thiết bị này</div></div>${icon("clock", 16)}</div><div class="activity-list">${state.data.activities.slice(0, 5).map((activity) => `<div class="activity-item"><div class="activity-marker">${icon(activity.type, 14)}</div><div class="activity-copy"><strong>${esc(activity.title)}</strong><span>${esc(activity.detail)}</span></div><div class="activity-time">${esc(activity.time)}</div></div>`).join("")}</div></article></section>`;
  }

  function statCard(title, value, foot, iconName, variant = "") {
    return `<article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon ${variant}">${icon(iconName, 14)}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
  }

  function filteredQuestions() {
    const query = state.search.trim().toLocaleLowerCase("vi");
    return state.data.questions.filter((question) => (state.subject === "Tất cả môn" || question.subject === state.subject) && (!query || `${question.text} ${question.subject} ${question.options.join(" ")}`.toLocaleLowerCase("vi").includes(query)));
  }

  function questionsView() {
    const questions = filteredQuestions();
    const subjects = ["Tất cả môn", ...new Set(state.data.questions.map((question) => question.subject))];
    return `${heading("Ngân hàng nội dung", "Quản lý câu hỏi", "Soạn trực tiếp, nhập CSV/Excel và tái sử dụng cho từng lớp học.", `<button class="button" data-action="new-question">${icon("plus", 14)} Thêm câu hỏi</button>`)}
      <section class="panel"><div class="workspace-toolbar"><div class="toolbar-left"><label class="search-field">${icon("search", 15)}<input id="question-search" type="search" placeholder="Tìm câu hỏi, chủ đề, đáp án..." value="${esc(state.search)}" /></label><select id="subject-filter" class="select">${subjects.map((subject) => `<option ${subject === state.subject ? "selected" : ""}>${esc(subject)}</option>`).join("")}</select></div><div class="toolbar-right"><button class="button secondary small" data-action="import">${icon("upload", 13)} Nhập Excel / CSV</button><button class="button secondary small" data-action="export">${icon("download", 13)} Xuất CSV</button></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>CÂU HỎI</th><th>MÔN HỌC</th><th>MỨC ĐỘ</th><th>ĐÁP ÁN</th><th>THAO TÁC</th></tr></thead><tbody>${questions.length ? questions.map(questionRow).join("") : `<tr><td colspan="5"><div class="empty-state">${icon("search", 30)}<strong>Chưa tìm thấy câu hỏi</strong><p>Hãy đổi bộ lọc hoặc thêm một câu hỏi mới.</p></div></td></tr>`}</tbody></table></div><div class="panel-subtitle" style="margin-top:13px">Hiển thị ${questions.length}/${state.data.questions.length} câu hỏi · Được lưu trên trình duyệt hiện tại</div></section>`;
  }

  function questionRow(question) {
    const variant = question.subject.startsWith("Tin") ? "green" : question.subject.includes("AI") ? "orange" : "";
    const levelVariant = question.level === "Vận dụng" ? "orange" : question.level === "Thông hiểu" ? "green" : "";
    return `<tr><td><div class="question-title">${esc(question.text)}</div><div class="question-caption">Cập nhật: ${esc(question.createdAt || today())}</div></td><td><span class="tag ${variant}">${esc(question.subject)}</span></td><td><span class="tag ${levelVariant}">${esc(question.level)}</span></td><td>${question.correct + 1} · ${esc(question.options[question.correct])}</td><td><div class="table-actions"><button class="button ghost small" data-action="edit-question" data-id="${esc(question.id)}" title="Chỉnh sửa">${icon("edit", 14)}</button><button class="button ghost small" data-action="duplicate-question" data-id="${esc(question.id)}" title="Nhân bản">${icon("copy", 14)}</button><button class="button ghost small" data-action="delete-question" data-id="${esc(question.id)}" title="Xoá">${icon("trash", 14)}</button></div></td></tr>`;
  }

  function classesView() {
    return `${heading("Quản trị dữ liệu lớp", "Lớp học của tôi", "Quản lý danh sách học sinh và tổ chức phiên chơi cho từng lớp.", `<button class="button" data-action="new-class">${icon("plus", 14)} Tạo lớp học</button>`)}
      <div class="status-pill" style="background:var(--orange-pale);color:#9b6b27">${icon("info", 13)} Tất cả tên học sinh bên dưới chỉ là dữ liệu minh hoạ.</div>
      ${state.data.classes.length ? `<section class="class-grid">${state.data.classes.map((item, index) => `<article class="panel class-card"><div class="class-card-top"><div class="class-code" style="${index === 1 ? "background:var(--mint-pale);color:var(--mint)" : index === 2 ? "background:var(--orange-pale);color:var(--orange)" : ""}">${esc(item.name.replace("Lớp ", ""))}</div><div class="class-card-controls"><button class="button ghost small" data-action="edit-class" data-id="${esc(item.id)}" title="Chỉnh sửa lớp học" aria-label="Chỉnh sửa ${esc(item.name)}">${icon("edit", 14)}</button><button class="button ghost small class-delete" data-action="delete-class" data-id="${esc(item.id)}" title="Xóa lớp học" aria-label="Xóa ${esc(item.name)}">${icon("trash", 14)}</button></div></div><h3>${esc(item.name)}</h3><p>${esc(item.subject)} · TH & THCS Kim Lư</p><div class="class-metrics"><div class="class-metric"><strong>${item.students.length}</strong><span>Học sinh mẫu</span></div><div class="class-metric"><strong>${item.sessions}</strong><span>Phiên minh hoạ</span></div></div><div class="class-actions"><button class="button secondary small" data-action="roster" data-id="${esc(item.id)}">${icon("people", 13)} Danh sách</button><button class="button small" data-action="start-class" data-id="${esc(item.id)}">${icon("play", 12)} Bắt đầu</button></div></article>`).join("")}</section>` : `<section class="panel empty-state class-empty-state">${icon("people", 34)}<strong>Chưa có lớp học nào</strong><p>Thầy hãy tạo một lớp mới để quản lý danh sách học sinh.</p><button class="button" data-action="new-class">${icon("plus", 13)} Tạo lớp học</button></section>`}`;
  }

  function playView() {
    const question = currentQuestion();
    if (!question && !state.game.finished) return `${heading("Trò chơi tương tác", "Phòng chơi cử chỉ", "Thêm câu hỏi để bắt đầu.")}<div class="panel empty-state"><strong>Chưa có câu hỏi</strong><p>Tạo ít nhất một câu hỏi trong ngân hàng nội dung.</p><button class="button" data-action="new-question">${icon("plus", 13)} Thêm câu hỏi</button></div>`;
    const classItem = state.data.classes.find((item) => item.id === state.game.classId);
    const total = state.game.questionIds.length;
    const stage = state.game.finished ? resultMarkup() : `<div class="stage-content"><div class="game-kicker"><span>${esc(question.subject)} · ${esc(classItem?.name || "Lớp minh hoạ")}</span><span>Câu ${state.game.index + 1}/${total}</span></div><div class="progress-track"><div class="progress-value" style="width:${((state.game.index + 1) / total) * 100}%"></div></div><div class="question-block"><h2>${esc(question.text)}</h2><p>Giơ số ngón tay tương ứng hoặc chọn bằng chuột / bàn phím.</p></div><div class="answer-grid">${question.options.map((answer, index) => `<button class="answer-card ${answerClass(index, question)}" data-action="choose-answer" data-index="${index}"><span class="answer-number">${index + 1}</span><span class="answer-copy">${esc(answer)}</span></button>`).join("")}</div><div class="stage-footer"><div class="keyboard-hint">Phím tắt <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd> · <kbd>Enter</kbd> câu tiếp</div>${state.game.revealed ? `<button class="button" data-action="next-question">${state.game.index === total - 1 ? "Xem kết quả" : "Câu tiếp theo"} ${icon("chevron", 13)}</button>` : `<button class="button secondary" data-action="reveal-answer" ${state.game.selected === null ? "disabled" : ""}>${icon("check", 13)} Chốt đáp án</button>`}</div></div>`;
    return `${heading("Trải nghiệm trực tiếp", "Phòng chơi cử chỉ", "Camera xử lý ngay trên thiết bị. Có sẵn nút bấm và phím 1–4 để trải nghiệm không cần camera.", `<button class="button secondary presentation-button" data-action="fullscreen" aria-label="Mở chế độ trình chiếu toàn màn hình">${icon("fullscreen", 16)} Trình chiếu</button>`)}
      <section class="play-layout"><article class="panel play-stage"><div class="play-stage-header"><div class="play-stage-title"><span class="live-indicator"></span>Phiên chơi đang hoạt động</div><div class="play-stage-actions"><button class="button ghost small fullscreen-exit" data-action="fullscreen">${icon("fullscreen", 14)} Thoát trình chiếu</button><button class="button ghost small" data-action="restart-game">${icon("shuffle", 13)} Chơi lại</button></div></div>${stage}</article>
      <aside class="play-sidebar"><article class="panel camera-card"><div class="camera-header"><div class="camera-title">${icon("camera", 15)} Nhận diện bàn tay</div><span class="tag ${state.camera.active ? "green" : ""}">${state.camera.active ? "Đang bật" : "Chưa bật"}</span></div><div class="camera-frame"><video id="camera-video" autoplay playsinline muted></video><canvas id="camera-canvas"></canvas><div class="camera-placeholder" id="camera-placeholder" style="${state.camera.active ? "display:none" : ""}">${icon("camera", 32)}<span>Bật camera và giơ 1–4 ngón tay trước màn hình.</span></div><span class="camera-badge">Xử lý trên thiết bị</span></div><div class="camera-bottom"><button class="button ${state.camera.active ? "secondary" : ""}" data-action="toggle-camera">${icon("camera", 14)} ${state.camera.active ? "Tắt camera" : "Bật camera nhận diện"}</button><div class="gesture-result"><span>Cử chỉ nhận được</span><strong id="gesture-label">${esc(state.camera.modelMessage)}</strong></div><div class="gesture-controls">${[1, 2, 3, 4].map((number) => `<button class="gesture-button" data-action="simulate-gesture" data-index="${number - 1}"><strong>${["☝️", "✌️", "🤟", "🖖"][number - 1]}</strong><span>${number} ngón</span></button>`).join("")}</div></div></article>
      <article class="panel score-card"><div class="panel-title">Kết quả hiện tại</div><div class="score-row"><div class="score-stat"><strong>${state.game.score}</strong><span>Điểm số</span></div><div class="score-stat"><strong>${state.game.correct}/${state.game.questionIds.length}</strong><span>Trả lời đúng</span></div><div class="score-stat"><strong>${state.game.index + (state.game.revealed ? 1 : 0)}</strong><span>Đã trả lời</span></div></div></article>
      <article class="panel instructions-card"><div class="panel-title">Cách chơi bằng cử chỉ</div><ol class="instructions"><li><span class="instruction-step">1</span>Cho phép camera; để bàn tay rõ, đủ sáng trong khung hình.</li><li><span class="instruction-step">2</span>Giơ 1, 2, 3 hoặc 4 ngón tay tương ứng đáp án.</li><li><span class="instruction-step">3</span>Giữ cử chỉ ổn định; đáp án sẽ được chọn và chấm tự động.</li><li><span class="instruction-step">4</span>Nếu chưa bật camera, hãy bấm nút cử chỉ hoặc dùng phím số.</li></ol></article></aside></section>`;
  }

  function answerClass(index, question) {
    if (!state.game.revealed) return state.game.selected === index ? "selected" : "";
    if (index === question.correct) return "correct";
    return index === state.game.selected ? "incorrect" : "";
  }

  function resultMarkup() {
    const total = state.game.questionIds.length;
    const ratio = total ? Math.round((state.game.correct / total) * 100) : 0;
    return `<div class="result-screen"><div><div class="result-emoji">${ratio >= 75 ? "🏆" : ratio >= 40 ? "👏" : "🌱"}</div><h2>${ratio >= 75 ? "Xuất sắc!" : "Hoàn thành phiên chơi!"}</h2><p>Tiếp tục ôn tập để cả lớp cùng tiến bộ.</p><div class="result-summary"><div><strong>${state.game.score}</strong><span>Tổng điểm</span></div><div><strong>${state.game.correct}/${total}</strong><span>Đáp án đúng</span></div><div><strong>${ratio}%</strong><span>Độ chính xác</span></div></div><div class="result-actions"><button class="button" data-action="restart-game">${icon("play", 13)} Chơi lại</button><button class="button secondary" data-action="navigate" data-view="questions">${icon("questions", 13)} Xem câu hỏi</button></div></div></div>`;
  }

  function chooseAnswer(index, autoReveal = false) {
    if (state.game.finished || state.game.revealed || index < 0 || index > 3 || !currentQuestion()) return;
    state.game.selected = index;
    if (autoReveal) revealAnswer(false);
    render({ preserveCamera: true });
  }

  function revealAnswer(shouldRender = true) {
    if (state.game.selected === null || state.game.revealed || !currentQuestion()) return;
    state.game.revealed = true;
    if (state.game.selected === currentQuestion().correct) {
      state.game.correct += 1;
      state.game.score += 100;
      toast("Chính xác! +100 điểm");
    } else {
      toast(`Đáp án đúng là ${currentQuestion().correct + 1}: ${currentQuestion().options[currentQuestion().correct]}`, "error");
    }
    if (shouldRender) render({ preserveCamera: true });
  }

  function nextQuestion() {
    if (!state.game.revealed) return;
    if (state.game.index >= state.game.questionIds.length - 1) {
      state.game.finished = true;
      const classItem = state.data.classes.find((item) => item.id === state.game.classId);
      if (classItem) classItem.sessions += 1;
      state.data.sessions.push({ id: uid(), classId: state.game.classId, score: state.game.score, correct: state.game.correct, total: state.game.questionIds.length, date: today() });
      addActivity("Hoàn thành một phiên trắc nghiệm", `${classItem?.name || "Lớp học"} · ${state.game.correct}/${state.game.questionIds.length} câu đúng`, "trophy");
    } else {
      state.game.index += 1;
      state.game.selected = null;
      state.game.revealed = false;
    }
    render({ preserveCamera: true });
  }

  function modalMarkup() {
    if (!state.modal) return "";
    const type = state.modal.type;
    const content = type === "question" ? questionModal() : type === "class" ? classModal() : type === "roster" ? rosterModal() : type === "import" ? importModal() : type === "picker" ? pickerModal() : type === "flashcards" ? flashcardModal() : infoModal();
    return `<div class="overlay" data-action="overlay"><div class="modal ${["question", "import", "roster"].includes(type) ? "wide" : ""}" role="dialog" aria-modal="true">${content}</div></div>`;
  }

  function modalHeader(title) {
    return `<div class="modal-header"><h2>${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Đóng">${icon("close", 16)}</button></div>`;
  }

  function questionModal() {
    const question = state.modal.question || { text: "", options: ["", "", "", ""], correct: 0, subject: "Toán 8", level: "Nhận biết" };
    const allSubjects = [...new Set([...SUBJECTS, ...state.data.questions.map((item) => item.subject)])];
    return `${modalHeader(question.id ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi trắc nghiệm")}<form id="question-form"><div class="form-grid"><div class="form-field full"><label for="question-text">Nội dung câu hỏi *</label><textarea id="question-text" name="text" required placeholder="Ví dụ: Đơn thức nào sau đây đồng dạng với 3x²y?">${esc(question.text)}</textarea></div><div class="form-field"><label for="question-subject">Môn học / chủ đề</label><select id="question-subject" name="subject">${allSubjects.map((subject) => `<option ${subject === question.subject ? "selected" : ""}>${esc(subject)}</option>`).join("")}</select></div><div class="form-field"><label for="question-level">Mức độ</label><select id="question-level" name="level">${["Nhận biết", "Thông hiểu", "Vận dụng"].map((level) => `<option ${level === question.level ? "selected" : ""}>${level}</option>`).join("")}</select></div>${question.options.map((option, index) => `<div class="form-field"><label for="answer-${index}">Đáp án ${index + 1}</label><div class="answer-form-row"><input type="radio" name="correct" value="${index}" ${question.correct === index ? "checked" : ""} aria-label="Đặt đáp án ${index + 1} là đúng" /><input id="answer-${index}" name="option${index}" value="${esc(option)}" required placeholder="Nhập đáp án ${index + 1}" /></div></div>`).join("")}<div class="form-field full"><div class="form-help">Chọn nút tròn cạnh phương án đúng. Số đáp án tương ứng số ngón tay học sinh giơ trước camera.</div></div></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Huỷ</button><button type="submit" class="button">${icon("check", 13)} ${question.id ? "Lưu thay đổi" : "Tạo câu hỏi"}</button></div></form>`;
  }

  function classModal() {
    const item = state.modal.classItem || { name: "", subject: "Toán 8", students: [] };
    return `${modalHeader(item.id ? "Chỉnh sửa lớp học" : "Tạo lớp học mới")}<form id="class-form"><div class="form-grid"><div class="form-field"><label for="class-name">Tên lớp *</label><input id="class-name" name="name" required placeholder="Ví dụ: Lớp 8C" value="${esc(item.name)}" /></div><div class="form-field"><label for="class-subject">Môn học chính</label><select id="class-subject" name="subject">${SUBJECTS.map((subject) => `<option ${subject === item.subject ? "selected" : ""}>${esc(subject)}</option>`).join("")}</select></div><div class="form-field full"><label for="class-students">Danh sách học sinh — mỗi dòng một tên</label><textarea id="class-students" name="students" style="min-height:150px" placeholder="Nguyễn Minh Anh&#10;Trần Gia Bảo&#10;Hoàng Thu Hà">${esc(item.students.map((student) => student.name).join("\n"))}</textarea><div class="form-help">Có thể dán một cột tên sao chép từ Excel. Chỉ nhập dữ liệu học sinh khi được phép sử dụng.</div></div></div><div class="modal-actions"><button type="button" class="button secondary" data-action="close-modal">Huỷ</button><button type="submit" class="button">${icon("check", 13)} Lưu lớp học</button></div></form>`;
  }

  function rosterModal() {
    const item = state.data.classes.find((candidate) => candidate.id === state.modal.classId);
    if (!item) return modalHeader("Không tìm thấy lớp");
    return `${modalHeader(`Danh sách ${esc(item.name)}`)}<div class="form-help">${item.students.length} học sinh · ${esc(item.subject)} · Dữ liệu minh hoạ có thể chỉnh sửa.</div><div class="roster-list">${item.students.map((student, index) => `<div class="roster-student"><div class="student-identity"><div class="avatar">${esc(student.name.split(" ").slice(-1)[0].charAt(0))}</div><div><strong>${esc(student.name)}</strong><span>Số thứ tự ${index + 1}</span></div></div><span class="tag green">Sẵn sàng</span></div>`).join("")}</div><div class="modal-actions"><button class="button secondary" data-action="edit-class" data-id="${esc(item.id)}">${icon("edit", 13)} Chỉnh danh sách</button><button class="button" data-action="start-class" data-id="${esc(item.id)}">${icon("play", 13)} Bắt đầu chơi</button></div>`;
  }

  function importModal() {
    return `${modalHeader("Nhập câu hỏi từ Excel / CSV")}<div class="dropzone">${icon("upload", 32)}<strong>Chọn tệp .csv, .tsv, .xlsx hoặc .xls</strong><span>Các cột cần có: Câu hỏi, Đáp án 1, Đáp án 2, Đáp án 3, Đáp án 4, Đáp án đúng, Môn học, Mức độ. Đáp án đúng ghi 1–4.</span><input class="hidden-input" id="import-file" type="file" accept=".csv,.tsv,.xlsx,.xls" /><button class="button" data-action="choose-import-file">${icon("file", 14)} Chọn tệp dữ liệu</button></div><div class="modal-actions"><button class="button secondary" data-action="download-template">${icon("download", 13)} Tải mẫu CSV</button><button class="button secondary" data-action="close-modal">Đóng</button></div>`;
  }

  function pickerModal() {
    const selectedClass = state.data.classes.find((item) => item.id === state.modal.classId) || state.data.classes[0];
    return `${modalHeader("Gọi tên học sinh ngẫu nhiên")}<div class="form-field"><label>Chọn lớp</label><select id="picker-class">${state.data.classes.map((item) => `<option value="${esc(item.id)}" ${item.id === selectedClass?.id ? "selected" : ""}>${esc(item.name)} · ${item.students.length} học sinh</option>`).join("")}</select></div><div class="winner-display"><div><strong id="picker-result">${state.modal.winner ? esc(state.modal.winner) : "Ai sẽ là người tiếp theo?"}</strong><span>${state.modal.winner ? "Đã chọn ngẫu nhiên từ danh sách lớp" : "Nhấn nút để chọn công bằng"}</span></div></div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Đóng</button><button class="button" data-action="pick-student">${icon("shuffle", 14)} Chọn ngẫu nhiên</button></div>`;
  }

  function flashcardModal() {
    const questions = state.data.questions;
    const question = questions[state.flashcard.index % Math.max(questions.length, 1)];
    return `${modalHeader("Lật thẻ ôn tập")}<div class="form-help">Thẻ ${state.flashcard.index + 1}/${questions.length} · ${esc(question?.subject || "")}</div><div class="flashcard"><div><strong>${esc(question?.text || "Chưa có câu hỏi")}</strong>${state.flashcard.revealed ? `<span>Đáp án: ${esc(question.options[question.correct])}</span>` : ""}</div></div><div class="modal-actions"><button class="button secondary" data-action="flip-card">${icon("cards", 13)} ${state.flashcard.revealed ? "Ẩn đáp án" : "Lật xem đáp án"}</button><button class="button" data-action="next-card">Thẻ tiếp theo ${icon("chevron", 13)}</button></div>`;
  }

  function infoModal() {
    return `${modalHeader("Về GestureClass")}<div class="form-help" style="font-size:11px;line-height:1.9">Bản mẫu dành cho lớp học tương tác: quản lý ngân hàng câu hỏi, danh sách lớp, trắc nghiệm bằng cử chỉ, lật thẻ và gọi tên ngẫu nhiên.<br /><br /><strong>Quyền riêng tư:</strong> camera chỉ chạy sau khi thầy/cô cấp phép; hình ảnh được xử lý trên trình duyệt và không được tải lên. Câu hỏi, danh sách lớp và kết quả hiện được lưu cục bộ trên thiết bị đang dùng.<br /><br /><strong>Lưu ý:</strong> dữ liệu ban đầu chỉ là dữ liệu minh hoạ. Nhập Excel cần kết nối mạng để tải thư viện đọc tệp; CSV hoạt động trực tiếp.</div><div class="modal-actions"><button class="button" data-action="close-modal">Đã hiểu</button></div>`;
  }

  function render(options = {}) {
    const app = document.querySelector("#app");
    if (!app) return;
    const keepCamera = options.preserveCamera && state.camera.active && state.view === "play";
    const activeVideo = keepCamera ? document.querySelector("#camera-video") : null;
    const content = state.view === "questions" ? questionsView() : state.view === "classes" ? classesView() : state.view === "play" ? playView() : dashboardView();
    app.innerHTML = shell(content);
    if (keepCamera && activeVideo?.srcObject) {
      const newVideo = document.querySelector("#camera-video");
      if (newVideo) {
        newVideo.srcObject = activeVideo.srcObject;
        newVideo.play().catch(() => {});
      }
    }
    const search = document.querySelector("#question-search");
    if (search) search.addEventListener("input", (event) => { state.search = event.target.value; const position = event.target.selectionStart; render(); const next = document.querySelector("#question-search"); next?.focus(); next?.setSelectionRange(position, position); });
    document.querySelector("#subject-filter")?.addEventListener("change", (event) => { state.subject = event.target.value; render(); });
    document.querySelector("#question-form")?.addEventListener("submit", submitQuestion);
    document.querySelector("#class-form")?.addEventListener("submit", submitClass);
    document.querySelector("#import-file")?.addEventListener("change", importFile);
    document.querySelector("#picker-class")?.addEventListener("change", (event) => { state.modal.classId = event.target.value; state.modal.winner = null; render(); });
  }

  function submitQuestion(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const original = state.modal.question;
    const item = { id: original?.id || uid(), text: String(form.get("text")).trim(), subject: String(form.get("subject")), level: String(form.get("level")), options: [0, 1, 2, 3].map((index) => String(form.get(`option${index}`)).trim()), correct: Number(form.get("correct") || 0), createdAt: today() };
    if (!item.text || item.options.some((option) => !option)) { toast("Vui lòng nhập câu hỏi và đầy đủ 4 đáp án.", "error"); return; }
    if (original?.id) state.data.questions = state.data.questions.map((question) => question.id === original.id ? item : question);
    else state.data.questions.unshift(item);
    addActivity(original?.id ? "Cập nhật câu hỏi" : "Thêm câu hỏi mới", `${item.subject} · ${item.level}`, "questions");
    state.modal = null;
    state.view = "questions";
    render();
    toast(original?.id ? "Đã lưu thay đổi câu hỏi." : "Đã thêm câu hỏi vào ngân hàng.");
  }

  function submitClass(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const original = state.modal.classItem;
    const students = String(form.get("students") || "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((name, index) => ({ id: original?.students.find((student) => student.name === name)?.id || uid(), name, order: index + 1 }));
    const item = { id: original?.id || uid(), name: String(form.get("name")).trim(), subject: String(form.get("subject")), students, sessions: original?.sessions || 0 };
    if (!item.name) { toast("Vui lòng nhập tên lớp.", "error"); return; }
    if (original?.id) state.data.classes = state.data.classes.map((candidate) => candidate.id === original.id ? item : candidate);
    else state.data.classes.push(item);
    addActivity(original?.id ? "Cập nhật lớp học" : "Tạo lớp học mới", `${item.name} · ${students.length} học sinh`, "people");
    state.modal = null;
    state.view = "classes";
    render();
    toast(`Đã lưu ${item.name} với ${students.length} học sinh.`);
  }

  function deleteClass(classId) {
    const item = state.data.classes.find((candidate) => candidate.id === classId);
    if (!item) return;

    const warning = `Xóa ${item.name}?\n\nDanh sách ${item.students.length} học sinh và lịch sử các phiên học của lớp sẽ bị xóa. Thao tác này không thể hoàn tác.`;
    if (!confirm(warning)) return;

    state.data.classes = state.data.classes.filter((candidate) => candidate.id !== item.id);
    state.data.sessions = state.data.sessions.filter((session) => session.classId !== item.id);

    if (state.game.classId === item.id) {
      const nextClass = state.data.classes[0];
      prepareGame(nextClass?.subject || "Toán 8", nextClass?.id || null);
    }

    if (state.modal?.classId === item.id || state.modal?.classItem?.id === item.id) state.modal = null;
    addActivity("Xóa lớp học", `${item.name} · ${item.students.length} học sinh`, "trash");
    state.view = "classes";
    render();
    toast(`Đã xóa ${item.name} và ${item.students.length} học sinh.`);
  }

  function downloadText(filename, content, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
  function questionsAsCsv(items) {
    const header = ["Câu hỏi", "Đáp án 1", "Đáp án 2", "Đáp án 3", "Đáp án 4", "Đáp án đúng", "Môn học", "Mức độ"];
    return [header, ...items.map((question) => [question.text, ...question.options, question.correct + 1, question.subject, question.level])].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function parseDelimited(text, delimiter = ",") {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ""; }
      else cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      let rows;
      if (/\.xlsx?$/i.test(file.name)) {
        if (!window.XLSX) await loadScript("https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
        if (!window.XLSX) throw new Error("Không tải được thư viện Excel; vui lòng lưu tệp thành CSV rồi nhập lại.");
        const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
      } else {
        const text = (await file.text()).replace(/^\ufeff/, "");
        const separator = /\.tsv$/i.test(file.name) ? "\t" : text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
        rows = parseDelimited(text, separator);
      }
      const dataRows = rows.slice(1).filter((row) => String(row[0] || "").trim());
      const imported = dataRows.map((row) => ({ id: uid(), text: String(row[0]).trim(), options: [1, 2, 3, 4].map((index) => String(row[index] || "").trim()), correct: Math.max(0, Math.min(3, Number(row[5] || 1) - 1)), subject: String(row[6] || "Toán 8").trim(), level: String(row[7] || "Nhận biết").trim(), createdAt: today() })).filter((question) => question.options.every(Boolean));
      if (!imported.length) throw new Error("Không tìm thấy dòng hợp lệ. Vui lòng kiểm tra mẫu và đủ 4 đáp án.");
      state.data.questions.unshift(...imported);
      addActivity("Nhập bộ câu hỏi từ tệp", `${file.name} · ${imported.length} câu hợp lệ`, "upload");
      state.modal = null;
      state.view = "questions";
      render();
      toast(`Đã nhập thành công ${imported.length} câu hỏi.`);
    } catch (error) {
      toast(error.message || "Không thể đọc tệp dữ liệu.", "error");
    }
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Không thể tải thư viện Excel; hãy thử định dạng CSV."));
      document.head.appendChild(script);
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { toast("Trình duyệt hoặc kết nối hiện tại không hỗ trợ camera.", "error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      state.camera.stream = stream;
      state.camera.active = true;
      state.camera.modelMessage = "Đang tải mô hình nhận diện...";
      render({ preserveCamera: false });
      const video = document.querySelector("#camera-video");
      video.srcObject = stream;
      await video.play();
      toast("Camera đã bật. Đang chuẩn bị nhận diện bàn tay...");
      try {
        const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm");
        const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm");
        state.camera.detector = await vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: .6, minHandPresenceConfidence: .6, minTrackingConfidence: .55 });
        state.camera.detecting = true;
        updateGestureLabel("Đưa bàn tay vào khung hình");
        scanHands();
        toast("Nhận diện đã sẵn sàng: hãy giơ 1–4 ngón tay.");
      } catch (error) {
        state.camera.detecting = false;
        updateGestureLabel("Camera sẵn sàng · dùng nút mô phỏng");
        toast("Không tải được mô hình nhận diện; camera vẫn hoạt động, hãy dùng nút cử chỉ.", "error");
        console.warn("Hand model unavailable", error);
      }
    } catch (error) {
      state.camera.active = false;
      state.camera.modelMessage = "Camera chưa bật";
      render();
      toast(error.name === "NotAllowedError" ? "Chưa được cấp quyền camera. Hãy cho phép camera trong trình duyệt." : "Không thể mở camera. Hãy kiểm tra thiết bị hoặc dùng nút mô phỏng.", "error");
    }
  }

  function stopCamera() {
    if (state.camera.raf) cancelAnimationFrame(state.camera.raf);
    state.camera.stream?.getTracks().forEach((track) => track.stop());
    state.camera.detector?.close?.();
    state.camera = { stream: null, detector: null, active: false, detecting: false, lastGesture: null, stableGesture: null, stableFrames: 0, lastSelectionAt: 0, raf: null, modelMessage: "Camera chưa bật" };
  }

  function updateGestureLabel(value) {
    state.camera.modelMessage = value;
    const label = document.querySelector("#gesture-label");
    if (label) label.textContent = value;
  }

  function countExtendedFingers(landmarks) {
    let count = 0;
    for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (landmarks[tip].y < landmarks[pip].y - .025) count += 1;
    const thumbDistance = Math.hypot(landmarks[4].x - landmarks[17].x, landmarks[4].y - landmarks[17].y);
    const palmWidth = Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y);
    if (thumbDistance > palmWidth * 1.2 && Math.abs(landmarks[4].x - landmarks[3].x) > .035) count += 1;
    return count;
  }

  function drawLandmarks(canvas, video, landmarks) {
    if (!canvas || !video) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;
    context.strokeStyle = "#9d99ff";
    context.lineWidth = 3;
    for (const [a, b] of [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]) { context.beginPath(); context.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height); context.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height); context.stroke(); }
    for (const landmark of landmarks) { context.beginPath(); context.fillStyle = "#52e0ae"; context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI); context.fill(); }
  }

  function scanHands() {
    if (!state.camera.active || !state.camera.detector || state.view !== "play") return;
    const video = document.querySelector("#camera-video");
    const canvas = document.querySelector("#camera-canvas");
    if (video?.readyState >= 2) {
      try {
        const result = state.camera.detector.detectForVideo(video, performance.now());
        const landmarks = result.landmarks?.[0];
        drawLandmarks(canvas, video, landmarks);
        if (landmarks) {
          const fingers = countExtendedFingers(landmarks);
          updateGestureLabel(fingers >= 1 && fingers <= 4 ? `${fingers} ngón tay → đáp án ${fingers}` : fingers === 0 ? "Nắm tay — hãy giơ 1–4 ngón" : "Hãy giơ từ 1 đến 4 ngón");
          if (fingers === state.camera.stableGesture) state.camera.stableFrames += 1;
          else { state.camera.stableGesture = fingers; state.camera.stableFrames = 1; }
          if (fingers >= 1 && fingers <= 4 && state.camera.stableFrames >= 7 && performance.now() - state.camera.lastSelectionAt > 1800 && !state.game.revealed) {
            state.camera.lastSelectionAt = performance.now();
            chooseAnswer(fingers - 1, true);
          }
        } else { state.camera.stableFrames = 0; updateGestureLabel("Đưa bàn tay vào khung hình"); }
      } catch (error) { console.warn("Hand detection frame skipped", error); }
    }
    state.camera.raf = requestAnimationFrame(scanHands);
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "overlay" && event.target !== target) return;
    if (action === "navigate") return navigate(target.dataset.view);
    if (action === "toggle-menu") { state.drawerOpen = !state.drawerOpen; return render(); }
    if (["close-modal", "overlay"].includes(action)) { state.modal = null; return render({ preserveCamera: true }); }
    if (["settings", "school-info"].includes(action)) { state.modal = { type: "info" }; return render({ preserveCamera: true }); }
    if (action === "new-question") { state.modal = { type: "question", question: null }; return render(); }
    if (action === "edit-question") { state.modal = { type: "question", question: state.data.questions.find((question) => question.id === target.dataset.id) }; return render(); }
    if (action === "duplicate-question") { const original = state.data.questions.find((question) => question.id === target.dataset.id); if (original) { state.data.questions.unshift({ ...original, id: uid(), text: `${original.text} (bản sao)`, createdAt: today() }); addActivity("Nhân bản câu hỏi", original.subject, "copy"); render(); toast("Đã tạo bản sao câu hỏi."); } return; }
    if (action === "delete-question") { const item = state.data.questions.find((question) => question.id === target.dataset.id); if (item && confirm(`Xoá câu hỏi: ${item.text}?`)) { state.data.questions = state.data.questions.filter((question) => question.id !== item.id); addActivity("Xoá một câu hỏi", item.subject, "trash"); render(); toast("Đã xoá câu hỏi."); } return; }
    if (action === "new-class") { state.modal = { type: "class", classItem: null }; return render(); }
    if (action === "edit-class") { state.modal = { type: "class", classItem: state.data.classes.find((item) => item.id === target.dataset.id) }; return render(); }
    if (action === "delete-class") return deleteClass(target.dataset.id);
    if (action === "roster") { state.modal = { type: "roster", classId: target.dataset.id }; return render(); }
    if (action === "start-subject") { state.modal = null; const classItem = state.data.classes.find((item) => item.subject === target.dataset.subject); prepareGame(target.dataset.subject, classItem?.id || state.data.classes[0]?.id); return navigate("play"); }
    if (action === "start-class") { const classItem = state.data.classes.find((item) => item.id === target.dataset.id); if (classItem) { state.modal = null; prepareGame(classItem.subject, classItem.id); navigate("play"); } return; }
    if (action === "choose-answer") return chooseAnswer(Number(target.dataset.index));
    if (action === "simulate-gesture") { toast(`Đã nhận cử chỉ ${Number(target.dataset.index) + 1} ngón tay.`); return chooseAnswer(Number(target.dataset.index), true); }
    if (action === "reveal-answer") return revealAnswer();
    if (action === "next-question") return nextQuestion();
    if (action === "restart-game") { const classItem = state.data.classes.find((item) => item.id === state.game.classId); prepareGame(classItem?.subject || "Toán 8", classItem?.id || state.data.classes[0]?.id); render({ preserveCamera: true }); toast("Đã bắt đầu phiên chơi mới."); return; }
    if (action === "toggle-camera") { if (state.camera.active) { stopCamera(); render(); toast("Đã tắt camera."); } else await startCamera(); return; }
    if (action === "fullscreen") { const stage = document.querySelector(".play-layout"); if (document.fullscreenElement) await document.exitFullscreen(); else if (stage?.requestFullscreen) await stage.requestFullscreen(); else toast("Trình duyệt chưa hỗ trợ chế độ toàn màn hình.", "error"); return; }
    if (action === "import") { state.modal = { type: "import" }; return render(); }
    if (action === "choose-import-file") return document.querySelector("#import-file")?.click();
    if (action === "download-template") { downloadText("Mau_cau_hoi_GestureClass.csv", questionsAsCsv(state.data.questions.slice(0, 2))); toast("Đã tải mẫu CSV; có thể mở bằng Excel."); return; }
    if (action === "export") { downloadText(`Ngan_hang_cau_hoi_GestureClass_${new Date().toISOString().slice(0, 10)}.csv`, questionsAsCsv(filteredQuestions())); toast("Đã xuất ngân hàng câu hỏi dưới dạng CSV."); return; }
    if (action === "random-picker") { state.modal = { type: "picker", classId: state.data.classes[0]?.id, winner: null }; return render({ preserveCamera: true }); }
    if (action === "pick-student") { const item = state.data.classes.find((candidate) => candidate.id === state.modal.classId); if (!item?.students.length) return toast("Lớp này chưa có học sinh.", "error"); state.modal.winner = item.students[Math.floor(Math.random() * item.students.length)].name; render(); toast(`Đã chọn: ${state.modal.winner}`); return; }
    if (action === "flashcards") { if (!state.data.questions.length) return toast("Hãy thêm câu hỏi trước khi dùng thẻ ôn tập.", "error"); state.flashcard = { index: 0, revealed: false }; state.modal = { type: "flashcards" }; return render({ preserveCamera: true }); }
    if (action === "flip-card") { state.flashcard.revealed = !state.flashcard.revealed; return render(); }
    if (action === "next-card") { state.flashcard.index = (state.flashcard.index + 1) % state.data.questions.length; state.flashcard.revealed = false; return render(); }
  });

  document.addEventListener("keydown", (event) => {
    if (state.modal || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    if (state.view === "play" && /^[1-4]$/.test(event.key)) chooseAnswer(Number(event.key) - 1, true);
    if (state.view === "play" && event.key === "Enter" && state.game.revealed) nextQuestion();
    if (event.key === "Escape" && state.drawerOpen) { state.drawerOpen = false; render(); }
  });

  window.addEventListener("beforeunload", stopCamera);
  render();
})();
