import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { AuthFlowError, describeAuthError, waitForAuthOperation } from '../src/lib/authFlow.ts';

mock.timers.enable({ apis: ['setTimeout'] });
try {
  assert.equal(await waitForAuthOperation(Promise.resolve('teacher-one'), 100, 'auth/request-timeout'), 'teacher-one');
  const denied = new AuthFlowError('auth/popup-blocked');
  await assert.rejects(waitForAuthOperation(Promise.reject(denied), 100, 'auth/request-timeout'), error => error === denied);

  let deliverCredential!: (value: string) => void;
  let exchanges = 0;
  const popup = new Promise<string>(resolve => { deliverCredential = resolve; });
  const timedOut = waitForAuthOperation(popup, 100, 'auth/google-popup-timeout').then(() => { exchanges++; });
  const timedOutCheck = assert.rejects(timedOut, { code: 'auth/google-popup-timeout' });
  mock.timers.tick(100);
  await timedOutCheck;
  deliverCredential('late-google-credential');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(exchanges, 0, 'A timed-out popup cannot exchange a late Google result into the main account.');

  const controller = new AbortController();
  let rejectAbandoned!: (error: Error) => void;
  const abandoned = new Promise<void>((_, reject) => { rejectAbandoned = reject; });
  const cancelled = waitForAuthOperation(abandoned, 100, 'auth/google-popup-timeout', controller.signal);
  const cancelCheck = assert.rejects(cancelled, { code: 'auth/google-sign-in-cancelled' });
  controller.abort();
  await cancelCheck;
  rejectAbandoned(new Error('late network failure'));
  await Promise.resolve();
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  await assert.rejects(waitForAuthOperation(Promise.resolve('unused'), 100, 'auth/request-timeout', alreadyAborted.signal), { code: 'auth/google-sign-in-cancelled' });

  const profile = waitForAuthOperation(new Promise(() => undefined), 15, 'auth/profile-timeout');
  const profileCheck = assert.rejects(profile, { code: 'auth/profile-timeout' });
  mock.timers.tick(15);
  await profileCheck;
  assert.equal(await waitForAuthOperation(Promise.resolve('retry-success'), 100, 'auth/request-timeout'), 'retry-success', 'A previous failure does not leave future sign-in attempts blocked.');

  for (const [code, message] of [
    ['auth/popup-blocked', /chặn cửa sổ/],
    ['auth/popup-closed-by-user', /thử lại/],
    ['auth/google-popup-timeout', /đóng cửa sổ/],
    ['auth/google-sign-in-cancelled', /Đã hủy/],
    ['auth/profile-timeout', /hồ sơ giáo viên/],
    ['auth/network-request-failed', /kiểm tra mạng/],
    ['auth/unauthorized-domain', /Tên miền/],
    ['auth/account-exists-with-different-credential', /cách đăng nhập khác/],
  ] as const) assert.match(describeAuthError({ code }), message);
  mock.timers.runAll();
  console.info('Authentication: timeout, popup cancellation, late-result isolation, retry and error handling checks passed.');
} finally {
  mock.timers.reset();
}
