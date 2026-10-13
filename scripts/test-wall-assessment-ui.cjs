const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { host: '127.0.0.1', port: 3199, strictPort: true, hmr: false } });
  await vite.listen();
  let browser;
  require('node:fs').mkdirSync('wall-ai-ui-results', { recursive: true });
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({viewport:{width:1366,height:900}, permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage(); const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    page.setDefaultTimeout(12000);
    const button = name => page.getByRole('button', {name,exact:true});
    const step = name => page.getByRole('navigation', {name:'Các bước nhận xét AI'}).getByRole('button', {name});
    await page.goto('http://127.0.0.1:3199/hesinhthai4.0/scripts/fixtures/wall-assessment-preview.html');
    await page.getByRole('button',{name:'✨ Phân tích AI',exact:true}).click();
    await page.getByLabel('Chọn cách dùng AI').selectOption('chatgpt');
    await page.getByLabel('Môn học',{exact:true}).fill('Tin học'); await page.getByLabel('Khối / lớp').fill('8');
    await button('Sao chép yêu cầu phân tích').click();
    await page.getByText('Xem / chọn yêu cầu để sao chép thủ công').click();
    const id = (await page.getByLabel('Yêu cầu gửi AI').inputValue()).match(/"requestId":"([^"]+)"/)[1];
    const analysis = {requestId:id,summary:'Cần phân biệt hành vi an toàn.',strengths:['Nhận biết được lừa đảo.'],limitations:[],errors:[{id:'e1',skill:'Bảo vệ mật khẩu',title:'Chia sẻ mật khẩu',evidence:'Có ghi chia sẻ mật khẩu để nhận thưởng.',hypothesis:'Có thể nhầm xác thực và cung cấp bí mật.',confidence:'medium',verificationQuestion:'Em có chia sẻ OTP để nhận quà không?',remediation:'Phân biệt việc đăng nhập và lừa lấy OTP.'}],feedback:'Em đã nêu lừa đảo, hãy sửa nhánh thông tin đăng nhập.'};
    await page.getByLabel('Kết quả JSON từ AI').fill(JSON.stringify({...analysis,requestId:'WRONG-POST'}));
    await button('Nhập phân tích dưới dạng bản nháp').click(); await page.getByText('Kết quả này không khớp',{exact:false}).waitFor();
    await page.getByLabel('Kết quả JSON từ AI').fill(JSON.stringify(analysis)); await button('Nhập phân tích dưới dạng bản nháp').click();
    await page.getByLabel('Kết luận lỗi 1').waitFor(); await button('Duyệt nhận xét và lưu điểm').click();
    await page.getByText('Hãy xác nhận hoặc loại bỏ từng lỗi trước khi duyệt.').waitFor();
    await page.getByLabel('Kết luận lỗi 1').selectOption('confirmed');
    await page.getByLabel('Nguyên nhân lỗi 1').fill('Nhầm lẫn về bí mật đăng nhập.');
    await page.getByLabel('Căn cứ lỗi 1').fill('Em trả lời sẽ gửi OTP cho người hứa tặng quà.');
    await page.getByLabel('Mã học sinh để theo dõi').fill('8A-012');
    await page.getByLabel('Điểm giáo viên quyết định').fill('7.5');
    await button('Duyệt nhận xét và lưu điểm').click(); await button('Sao chép nhận xét đã duyệt').waitFor();
    assert.equal((await page.evaluate(()=>window.saved)).score,7.5);
    assert.equal((await page.evaluate(()=>window.saved)).comments.length,1);
    await page.screenshot({path:'wall-ai-ui-results/review-desktop.png'});
    await step('3. Luyện tập').click(); await button('Sao chép yêu cầu luyện tập').click();
    await page.getByText('Xem / chọn yêu cầu để sao chép thủ công').click();
    const practiceId=(await page.getByLabel('Yêu cầu gửi AI').inputValue()).match(/"requestId":"([^"]+)"/)[1];
    const practice={requestId:practiceId,instructions:'Giải thích từng lựa chọn.',exercises:[
      {errorId:'e1',difficulty:'foundation',question:'Bạn A xin OTP để gửi quà. Em xử lý thế nào?',hint:'Nghĩ về chức năng của OTP.',expectedAnswer:'SECRET-ANSWER Không cung cấp OTP.',successCriteria:'Nêu từ chối OTP và giải thích.'},
      {errorId:'e1',difficulty:'application',question:'Website xin mật khẩu email để nhận quà. Em làm gì?',hint:'Kiểm tra nguồn.',expectedAnswer:'SECRET-ANSWER Dừng thao tác, báo người lớn.',successCriteria:'Không gửi mật khẩu, biết báo cáo.'}
    ]};
    await page.getByLabel('Kết quả JSON từ AI').fill(JSON.stringify(practice)); await button('Nhập bài luyện tập để duyệt').click();
    await page.getByLabel('Đề luyện tập 1').waitFor(); await page.getByLabel('Đề luyện tập 1').fill('Bài đã sửa: Bạn A xin OTP để gửi quà. Em xử lý thế nào?');
    await button('Duyệt và giao luyện tập').click(); await button('Sao chép phiếu luyện tập').click();
    const worksheet=await page.evaluate(()=>navigator.clipboard.readText()); assert.ok(worksheet.includes('Bài đã sửa')); assert.ok(!worksheet.includes('SECRET-ANSWER'));
    await button('Ghi nhận tiến bộ').click();
    for (const exercise of ['x1','x2']) {
      await page.getByLabel('Bài luyện tập đã làm').selectOption(exercise);
      await page.getByLabel('Bài làm luyện tập của học sinh').fill('Em từ chối gửi OTP và báo thầy cô.');
      await page.getByLabel('Căn cứ đánh giá tiến bộ').fill('Đã giải thích đúng các bước theo tiêu chí.');
      await page.getByLabel('Kết quả giáo viên đánh giá').selectOption('resolved');
      await button('Lưu lần luyện tập').click();
      await page.waitForFunction(n=>window.saved.aiAssessment.practice.attempts.length===n,exercise==='x1'?1:2);
    }
    await page.locator('.lw-ai-table .is-resolved').waitFor();
    assert.equal(await page.locator('.lw-ai-table .is-resolved').count(),1);
    await page.setViewportSize({width:390,height:844}); await step('2. Giáo viên duyệt').click();
    await page.screenshot({path:'wall-ai-ui-results/review-mobile.png'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page must not overflow');
    await page.getByRole('button',{name:'Đóng',exact:true}).click(); await button('📈 Tiến bộ học sinh').click();
    await page.locator('.lw-ai-table .is-resolved').waitFor();
    assert.equal(await page.locator('.lw-ai-table .is-resolved').count(),1);
    await page.getByRole('button',{name:'Đóng',exact:true}).click();
    await page.getByRole('button',{name:/✨ Phân tích AI/}).click();
    await button('Chỉnh nhận xét thành bản mới').click();
    await button('Lưu bản nháp').click();
    await page.waitForFunction(()=>window.saved.aiAssessmentHistory?.length===1);
    assert.equal((await page.evaluate(()=>window.saved)).aiAssessmentHistory[0].practice.attempts.length,2);
    await page.goto('http://127.0.0.1:3199/hesinhthai4.0/scripts/fixtures/wall-assessment-preview.html?guest');
    await page.locator('.lw-post').waitFor();
    assert.equal(await page.getByRole('button',{name:/Phân tích AI/}).count(),0,'Guests cannot access private AI workflow');
    assert.deepEqual(errors,[]); console.log('Wall AI UI passed: cross-post refusal, teacher cause verification/grading, personalized practice editing, student worksheet redaction, progress, history, mobile layout, guest privacy.');
  } finally { if (browser) await browser.close(); await vite.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
