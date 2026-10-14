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
    // Intercept only this fixture's AI service module. Production has no mock or fallback responses.
    await page.route(/\/src\/lib\/learningWallAi\.ts(?:\?.*)?$/, route => route.fulfill({contentType:'application/javascript',body:`
      import { parseWallAnalysis, parseWallPractice } from '/hesinhthai4.0/src/lib/learningWallAssessment.ts';
      import { parseWallChatReply } from '/hesinhthai4.0/src/lib/learningWallChat.ts';
      const model='gemini-ui-fixture';
      window.aiRequests=[];
      export async function checkWallAiConnection(){ return model; }
      export async function chatAboutWallWork(request,message,history){
        window.aiRequests.push({request,message,history});
        if(message==='SIMULATE-API-ERROR') throw new Error('Kiểm thử: Firebase AI API chưa bật.');
        return parseWallChatReply(JSON.stringify({requestId:message==='WRONG-REQUEST'?'wrong':request.id,
          reply:'Có bằng chứng chia sẻ mật khẩu. Hãy hỏi em để xác minh nguyên nhân. <b>RENDER-TEXT</b>',
          feedback:'Em đã nhận biết lừa đảo; hãy sửa nhánh chia sẻ mật khẩu và giải thích cách bảo vệ.'}),request.id,model);
      }
      export async function analyzeWallWork(request){
        return {model,analysis:parseWallAnalysis(JSON.stringify({requestId:request.id,summary:'Cần phân biệt hành vi an toàn.',strengths:['Nhận biết được lừa đảo.'],limitations:[],errors:[{id:'e1',skill:'Bảo vệ mật khẩu',title:'Chia sẻ mật khẩu',evidence:'Có ghi chia sẻ mật khẩu để nhận thưởng.',hypothesis:'Có thể nhầm xác thực và cung cấp bí mật.',confidence:'medium',verificationQuestion:'Em có chia sẻ OTP để nhận quà không?',remediation:'Phân biệt việc đăng nhập và lừa lấy OTP.'}],feedback:'Em đã nêu lừa đảo, hãy sửa nhánh thông tin đăng nhập.'}),request.id)};
      }
      export async function generateWallPractice(assessment,id){
        return parseWallPractice(JSON.stringify({requestId:id,instructions:'Giải thích từng lựa chọn.',exercises:[
          {errorId:'e1',difficulty:'foundation',question:'Bạn A xin OTP để gửi quà. Em xử lý thế nào?',hint:'Nghĩ về chức năng của OTP.',expectedAnswer:'SECRET-ANSWER Không cung cấp OTP.',successCriteria:'Nêu từ chối OTP và giải thích.'},
          {errorId:'e1',difficulty:'application',question:'Website xin mật khẩu email để nhận quà. Em làm gì?',hint:'Kiểm tra nguồn.',expectedAnswer:'SECRET-ANSWER Dừng thao tác, báo người lớn.',successCriteria:'Không gửi mật khẩu, biết báo cáo.'}
        ]}),id,assessment,'firebase-gemini',model);
      }
    `}));
    const button = name => page.getByRole('button', {name,exact:true});
    const step = name => page.getByRole('navigation', {name:'Các bước nhận xét AI'}).getByRole('button', {name});
    const openFirst = async () => page.locator('.lw-post').filter({has:page.getByText('Sơ đồ an toàn số',{exact:true})}).getByRole('button',{name:/✨ Phân tích AI/}).click();
    const saved = () => page.evaluate(()=>window.saved);
    const log = page.getByRole('log',{name:'Cuộc trao đổi AI'});
    const composer = page.getByLabel('Nhắn AI về bài làm',{exact:true});
    const send = async message => { await composer.fill(message); await button('Gửi cho AI').click(); };
    await page.goto('http://127.0.0.1:3199/hesinhthai4.0/scripts/fixtures/wall-assessment-preview.html');
    await openFirst(); await composer.waitFor();
    assert.equal(await page.getByLabel('Chọn cách dùng AI').count(),0);
    assert.equal(await page.getByRole('link',{name:/Mở AI/}).count(),0);
    await page.getByLabel('Môn học',{exact:true}).fill('Tin học'); await page.getByLabel('Khối / lớp').fill('8');
    await button('Kiểm tra kết nối AI').click(); await page.getByText(/API sẵn sàng cho chat/).waitFor();
    await send('Em sai ở đâu?'); await page.waitForFunction(()=>window.saved?.aiChat?.messages.length===2);
    assert.equal((await saved()).comments,undefined); assert.equal((await saved()).score,undefined,'Chat never grades');
    assert.ok((await log.textContent()).includes('<b>RENDER-TEXT</b>'),'AI markup is rendered as text');
    assert.equal(await log.locator('b').count(),0);
    await button('Đưa vào ô nhận xét').click();
    assert.ok((await page.getByLabel('Nhận xét của giáo viên',{exact:true}).inputValue()).includes('bảo vệ'));
    assert.equal((await saved()).comments,undefined,'Applying a suggestion only fills the teacher draft');
    await button('Gửi nhận xét').click(); await page.waitForFunction(()=>window.saved.comments?.length===1);
    await send('Cần hỏi em thế nào?'); await page.waitForFunction(()=>window.saved.aiChat.messages.length===4);
    const calls=await page.evaluate(()=>window.aiRequests);
    assert.equal(calls[1].history.length,2); assert.equal(calls[1].history[0].text,'Em sai ở đâu?');
    assert.ok(calls[1].request.workText.includes('chia sẻ mật khẩu')); assert.equal(context.pages().length,1,'Chat stays in the same page');
    await log.scrollIntoViewIfNeeded(); await page.screenshot({path:'wall-ai-ui-results/chat-desktop.png'});
    await page.setViewportSize({width:390,height:844}); await log.scrollIntoViewIfNeeded();
    await page.screenshot({path:'wall-ai-ui-results/chat-mobile.png'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile chat must not overflow');
    await page.setViewportSize({width:1366,height:900});
    await send('SIMULATE-API-ERROR'); await page.getByText('Kiểm thử: Firebase AI API chưa bật.').waitFor();
    assert.equal(await composer.inputValue(),'SIMULATE-API-ERROR'); assert.equal((await saved()).aiChat.messages.length,4);
    await send('WRONG-REQUEST'); await page.getByText('Phản hồi không khớp với bài đang trao đổi.').waitFor();
    assert.equal((await saved()).aiChat.messages.length,4,'Wrong request is never appended');
    await page.evaluate(()=>window.failChatSave=true); await send('Gợi ý cách sửa lỗi');
    await page.getByText('Kiểm thử: chưa lưu được chat.').waitFor();
    assert.equal((await saved()).aiChat.messages.length,4);
    const beforeRetry=await page.evaluate(()=>window.aiRequests.length);
    await button('Lưu cuộc trao đổi').click(); await page.waitForFunction(()=>window.saved.aiChat.messages.length===6);
    assert.equal(await page.evaluate(()=>window.aiRequests.length),beforeRetry,'Retrying storage does not call AI again');
    await button('Đóng').click();
    await page.locator('.lw-post').filter({has:page.getByText('Bài làm khác',{exact:true})}).getByRole('button',{name:/✨ Phân tích AI/}).click();
    await composer.waitFor(); assert.ok(!(await log.textContent()).includes('RENDER-TEXT'),'Conversations stay scoped to each post');
    await button('Đóng').click(); await openFirst(); await composer.waitFor();
    assert.equal(await log.locator('.lw-ai-chat-message').count(),6,'Saved conversation reopens with its context');
    assert.equal(await composer.isEnabled(),true);
    await page.getByText('Đề bài và tiêu chí dùng cho AI',{exact:true}).click();
    assert.equal(await page.getByLabel('Môn học',{exact:true}).inputValue(),'Tin học');
    await page.getByLabel('Đáp án / tiêu chí đánh giá',{exact:true}).fill('Cần từ chối chia sẻ mật khẩu.');
    await page.getByText('Bài làm hoặc tiêu chí đã đổi. Hãy bắt đầu cuộc trao đổi mới trước khi dùng gợi ý cũ.').waitFor();
    assert.equal(await composer.isEnabled(),false);
    await button('Bắt đầu trao đổi mới').click(); await send('Đánh giá theo tiêu chí mới');
    await page.waitForFunction(()=>window.saved.aiChatHistory?.length===1);
    assert.equal((await saved()).aiChatHistory[0].messages.length,6);
    await button('AI đánh giá bài làm tại đây').click(); await page.getByLabel('Kết luận lỗi 1').waitFor();
    await button('Duyệt nhận xét và lưu điểm').click(); await page.getByText('Hãy xác nhận hoặc loại bỏ từng lỗi trước khi duyệt.').waitFor();
    await page.getByLabel('Kết luận lỗi 1').selectOption('confirmed');
    await page.getByLabel('Nguyên nhân lỗi 1').fill('Nhầm lẫn về bí mật đăng nhập.');
    await page.getByLabel('Căn cứ lỗi 1').fill('Em trả lời sẽ gửi OTP cho người hứa tặng quà.');
    await page.getByLabel('Mã học sinh để theo dõi').fill('8A-012'); await page.getByLabel('Điểm giáo viên quyết định').fill('7.5');
    await button('Duyệt nhận xét và lưu điểm').click(); await button('Sao chép nhận xét đã duyệt').waitFor();
    assert.equal((await saved()).score,7.5); assert.equal((await saved()).comments.length,2);
    await page.screenshot({path:'wall-ai-ui-results/review-desktop.png'});
    await step('3. Luyện tập').click(); await button('Tạo luyện tập cá nhân hóa').click();
    await page.getByLabel('Đề luyện tập 1').waitFor(); await page.getByLabel('Đề luyện tập 1').fill('Bài đã sửa: Bạn A xin OTP để gửi quà. Em xử lý thế nào?');
    await button('Duyệt và giao luyện tập').click(); await button('Sao chép phiếu luyện tập').click();
    const worksheet=await page.evaluate(()=>navigator.clipboard.readText()); assert.ok(worksheet.includes('Bài đã sửa')); assert.ok(!worksheet.includes('SECRET-ANSWER'));
    await button('Ghi nhận tiến bộ').click();
    for (const exercise of ['x1','x2']) {
      await page.getByLabel('Bài luyện tập đã làm').selectOption(exercise);
      await page.getByLabel('Bài làm luyện tập của học sinh').fill('Em từ chối gửi OTP và báo thầy cô.');
      await page.getByLabel('Căn cứ đánh giá tiến bộ').fill('Đã giải thích đúng các bước theo tiêu chí.');
      await page.getByLabel('Kết quả giáo viên đánh giá').selectOption('resolved'); await button('Lưu lần luyện tập').click();
      await page.waitForFunction(n=>window.saved.aiAssessment.practice.attempts.length===n,exercise==='x1'?1:2);
    }
    await page.locator('.lw-ai-table .is-resolved').waitFor(); assert.equal(await page.locator('.lw-ai-table .is-resolved').count(),1);
    await page.setViewportSize({width:390,height:844}); await step('2. Giáo viên duyệt').click();
    await page.screenshot({path:'wall-ai-ui-results/review-mobile.png'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile review must not overflow');
    await button('Đóng').click(); await button('📈 Tiến bộ học sinh').click();
    await page.locator('.lw-ai-table .is-resolved').waitFor(); assert.equal(await page.locator('.lw-ai-table .is-resolved').count(),1);
    await button('Đóng').click(); await openFirst(); await step('2. Giáo viên duyệt').click();
    await button('Chỉnh nhận xét thành bản mới').click(); await button('Lưu bản nháp').click();
    await page.waitForFunction(()=>window.saved.aiAssessmentHistory?.length===1);
    assert.equal((await saved()).aiAssessmentHistory[0].practice.attempts.length,2);
    await page.goto('http://127.0.0.1:3199/hesinhthai4.0/scripts/fixtures/wall-assessment-preview.html?guest');
    await page.locator('.lw-post').first().waitFor(); assert.equal(await page.getByRole('button',{name:/Phân tích AI/}).count(),0,'Guests cannot access private AI workflow');
    assert.deepEqual(errors,[]);
    console.log('Inline AI UI passed: same-page chat, context/history, teacher draft and explicit approval, API/storage failure recovery, post isolation, stale context, personalized practice, student redaction, progress, mobile layout and guest privacy.');
  } finally { if (browser) await browser.close(); await vite.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
