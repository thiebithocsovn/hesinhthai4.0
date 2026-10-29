const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { host: '127.0.0.1', port: 3208, strictPort: true, hmr: false } });
  await vite.listen();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chromium' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let denied = false;
    await page.route('**/api/admin/teachers/password', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: denied ? 403 : 200, contentType: 'application/json', body: JSON.stringify(denied
        ? { error: 'Tài khoản hiện tại không có quyền thay mật khẩu giáo viên.' }
        : { updated: true, teacherId: 'qa-teacher' }) });
    });
    await page.goto('http://127.0.0.1:3208/hesinhthai4.0/scripts/fixtures/teacher-password-preview.html');
    const open = page.getByRole('button', { name: 'Reset mật khẩu giáo viên kiểm thử' });
    await open.click();
    const first = page.getByLabel('Mật khẩu mới', { exact: true });
    const confirm = page.getByLabel('Nhập lại mật khẩu mới');
    await first.waitFor();
    assert.equal(await first.getAttribute('type'), 'password');
    await first.fill('QA-Secret-2026!'); await confirm.fill('QA-Wrong-2026!');
    await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'chưa trùng khớp' }).waitFor();
    assert.equal(requests.length, 0);
    await confirm.fill('QA-Secret-2026!');
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await first.getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Đóng', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Gửi email khôi phục' }).evaluate(el => el === document.activeElement), true, 'Focus stays in the modal.');
    denied = true;
    await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'không có quyền' }).waitFor();
    assert.equal(await first.inputValue(), 'QA-Secret-2026!', 'An unsuccessful request keeps the draft for correction.');
    assert.equal(await page.getByRole('status').count(), 0, 'A failed server update never displays success.');
    denied = false;
    await page.getByRole('button', { name: 'Đặt mật khẩu mới', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'thành công' }).waitFor();
    assert.equal(requests.at(-1).teacherId, 'qa-teacher');
    assert.equal(requests.at(-1).newPassword, 'QA-Secret-2026!');
    assert.equal(await page.locator('input').count(), 0, 'Success clears and removes password fields.');
    await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
    await open.click();
    assert.equal(await first.inputValue(), '', 'Reopening starts with empty password fields.');
    await page.getByRole('button', { name: 'Gửi email khôi phục' }).click();
    await page.getByRole('status').filter({ hasText: 'Đã gửi email' }).waitFor();
    assert.equal(await page.evaluate(() => window.emailRequests), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Escape');
    await open.click();
    require('node:fs').mkdirSync('teacher-password-ui-results', { recursive: true });
    await page.screenshot({ path: 'teacher-password-ui-results/mobile.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: 'teacher-password-ui-results/desktop.png' });
    assert.deepEqual(errors, []);
    console.info('Teacher password UI passed: validation, no false success, server errors, secret clearing, email fallback, keyboard focus and mobile layout.');
  } finally { if (browser) await browser.close(); await vite.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
