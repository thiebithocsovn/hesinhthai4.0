import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ECOSYSTEM_APPLICATIONS } from '../src/ecosystem';
import { normalizeApiServer } from '../src/lib/api';
import { isAdministratorAlias, resolveAdministratorLoginEmail } from '../src/lib/adminAuth';
import { describeTeacherAccountError, validateTeacherCredentials } from '../src/lib/teacherAccounts';

assert.equal(ECOSYSTEM_APPLICATIONS.length, 13, 'The catalog exposes exactly 13 applications.');
assert.equal(new Set(ECOSYSTEM_APPLICATIONS.map(app => app.id)).size, 13, 'Application IDs remain unique.');
assert.equal(ECOSYSTEM_APPLICATIONS.some(app => app.name === 'GestureCore Edu'), false, 'The removed application never appears in the ecosystem catalog.');
assert.ok(ECOSYSTEM_APPLICATIONS.some(app => app.id === 'gesture-class'), 'GestureClass remains available.');
assert.ok(ECOSYSTEM_APPLICATIONS.some(app => app.id === 'question-studio'), 'Question Studio remains available.');
assert.ok(ECOSYSTEM_APPLICATIONS.some(app => app.id === 'plicker'), 'Plicker remains available.');

const application = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/PlatformFooter.tsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

assert.doesNotMatch(application, /GestureCoreEdu|gesture-core/, 'The homepage has no routes, cards, or lazy imports for the removed application.');
assert.doesNotMatch(dashboard, /GestureCoreEdu|gesture-core/, 'The teacher library has no routes, cards, or lazy imports for the removed application.');
assert.doesNotMatch(footer, /gesture-core/, 'Footer links cannot launch a removed application.');
assert.match(footer, /onOpenProduct\('gesture-class'\)/, 'The footer points to the supported GestureClass application.');
assert.match(readme, /Danh mục 13 ứng dụng/, 'Documentation displays the current application count.');
assert.ok(!existsSync(new URL('../src/components/GestureCoreEdu.tsx', import.meta.url)), 'The removed application component is not shipped in the source tree.');

const gestureClassIndex = readFileSync(new URL('../public/gestureclass/index.html', import.meta.url), 'utf8');
assert.match(gestureClassIndex, /href="\.\/styles\.css\?v=projector-readable-v1"/, 'GestureClass styles use the GitHub Pages subdirectory and refresh projector layouts.');
assert.match(gestureClassIndex, /src="\.\/app\.js\?v=projector-readable-v1"/, 'GestureClass scripts use the GitHub Pages subdirectory and a matching release version.');
assert.ok(existsSync(new URL('../public/gestureclass/styles.css', import.meta.url)));
assert.ok(existsSync(new URL('../public/gestureclass/app.js', import.meta.url)));

const gestureClassComponent = readFileSync(new URL('../src/components/GestureClass.tsx', import.meta.url), 'utf8');
assert.match(gestureClassComponent, /import\.meta\.env\.BASE_URL/);
assert.match(gestureClassComponent, /projector-readable-v1/);
assert.match(gestureClassComponent, /allow="camera; fullscreen"/);
assert.equal(normalizeApiServer('https://example.edu.vn/'), 'https://example.edu.vn');
assert.equal(normalizeApiServer('http://localhost:3000/'), 'http://localhost:3000');
assert.equal(normalizeApiServer('  '), '');
assert.throws(() => normalizeApiServer('http://example.edu.vn'));
assert.throws(() => normalizeApiServer('https://user:secret@example.edu.vn'));
assert.throws(() => normalizeApiServer('https://example.edu.vn/?token=123'));

assert.equal(isAdministratorAlias(' ADMIN '), true);
assert.equal(isAdministratorAlias('teacher@example.edu.vn'), false);
assert.equal(resolveAdministratorLoginEmail('admin', { configuredEmail: ' Owner@Example.edu.vn ' }), 'owner@example.edu.vn');
assert.equal(resolveAdministratorLoginEmail('admin', { rememberedEmail: ' Remembered@Example.edu.vn ' }), 'remembered@example.edu.vn');
assert.equal(resolveAdministratorLoginEmail('admin', { configuredEmail: 'owner@example.edu.vn', rememberedEmail: 'other@example.edu.vn' }), 'owner@example.edu.vn');
assert.equal(resolveAdministratorLoginEmail('admin'), '');
assert.equal(resolveAdministratorLoginEmail('teacher@example.edu.vn'), 'teacher@example.edu.vn');

assert.equal(validateTeacherCredentials('teacher@example.edu.vn', 'password-123', 'password-123'), '');
assert.match(validateTeacherCredentials('teacher@example.edu.vn', 'short', 'short'), /ít nhất 8 ký tự/);
assert.match(validateTeacherCredentials('teacher@example.edu.vn', 'password-123', 'password-456'), /chưa trùng khớp/);
assert.match(describeTeacherAccountError({ code: 'auth/email-already-in-use' }), /đã có tài khoản/);
assert.match(describeTeacherAccountError({ code: 'auth/operation-not-allowed' }), /Email\/Mật khẩu/);

console.info('SmartClass 13-application ecosystem and Question Studio integration: 36 checks passed.');
