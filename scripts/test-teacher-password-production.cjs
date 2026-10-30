const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const firebase = require('../firebase-applet-config.json');

// Manual, explicitly authorized integration check. Never part of the default test suite.
async function main() {
  if (!process.argv.includes('--run')) {
    console.info('Use --run --firebase-tools-lib /path/to/firebase-tools/lib after authenticating the Firebase CLI. Only temporary QA identities are created.');
    return;
  }
  const index = process.argv.indexOf('--firebase-tools-lib');
  assert.ok(index >= 0 && process.argv[index + 1], 'Firebase CLI library path is required.');
  const lib = path.resolve(process.argv[index + 1]);
  const cliAuth = require(path.join(lib, 'auth.js'));
  const account = cliAuth.getGlobalDefaultAccount();
  assert.ok(account, 'Authenticate the official Firebase CLI first.');
  await require(path.join(lib, 'requireAuth.js')).requireAuth({ project: firebase.projectId, user: account.user, tokens: account.tokens });
  const { Client } = require(path.join(lib, 'apiv2.js'));
  const identity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1' });
  const publicIdentity = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1', auth: false });
  const database = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  // Firebase CLI mutates request options, so never share them across authenticated/public clients.
  const quiet = () => ({ skipLog: { body: true, resBody: true, queryParams: true }, retryCodes: [], timeout: 30_000 });
  const cliRequire = createRequire(path.join(lib, 'apiv2.js'));
  const { fetch, ProxyAgent } = cliRequire('undici');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  const nonce = crypto.randomBytes(14).toString('hex');
  const adminUid = 'qa-password-admin-' + nonce;
  const teacherUid = 'qa-password-teacher-' + nonce;
  const adminEmail = adminUid + '@example.invalid';
  const teacherEmail = teacherUid + '@example.invalid';
  const initial = 'Qa-Initial!' + crypto.randomBytes(20).toString('hex');
  const replacement = 'Qa-Replacement!' + crypto.randomBytes(20).toString('hex');
  const profile = `/projects/${firebase.projectId}/databases/${firebase.firestoreDatabaseId}/documents/teachers/${teacherUid}`;
  const authPath = '/projects/' + firebase.projectId;
  const created = [];
  let profileAttempted = false;
  let stage = 'create QA identities';
  let passed = false;
  const cleanupFailures = [];
  const signIn = (email, password, allowFailure = false) => publicIdentity.post('/accounts:signInWithPassword',
    { email, password, returnSecureToken: true }, { ...quiet(), queryParams: { key: firebase.apiKey }, resolveOnHTTPError: allowFailure });
  const passwordRequest = async token => {
    const response = await fetch('https://hesinhthai4-0-thietbihocso.vercel.app/api/admin/teachers/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://thiebithocsovn.github.io', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ teacherId: teacherUid, email: teacherEmail, newPassword: replacement }),
      redirect: 'error', signal: AbortSignal.timeout(30_000), ...(dispatcher ? { dispatcher } : {}),
    });
    return { status: response.status, cors: response.headers.get('access-control-allow-origin'), data: await response.json() };
  };
  const readOwnProfile = async token => {
    const response = await fetch('https://firestore.googleapis.com/v1' + profile, {
      headers: { Authorization: 'Bearer ' + token, Origin: 'https://thiebithocsovn.github.io' },
      redirect: 'error', signal: AbortSignal.timeout(30_000), ...(dispatcher ? { dispatcher } : {}),
    });
    assert.equal(response.status, 200, 'The signed-in teacher cannot read their own profile.');
    const result = await response.json();
    assert.equal(result.fields?.id?.stringValue, teacherUid);
    assert.equal(result.fields?.status?.stringValue, 'active');
  };
  try {
    for (const [localId, email] of [[adminUid, adminEmail], [teacherUid, teacherEmail]]) {
      created.push(localId);
      const response = await identity.post(authPath + '/accounts', { localId, email, password: initial, emailVerified: localId === adminUid,
        displayName: 'QA temporary teacher password check' }, quiet());
      assert.equal(response.body.localId, localId);
    }
    await identity.post(authPath + '/accounts:update', { localId: adminUid, customAttributes: JSON.stringify({ admin: true }) }, quiet());
    profileAttempted = true;
    await database.patch(profile, { fields: { id: { stringValue: teacherUid }, email: { stringValue: teacherEmail },
      username: { stringValue: teacherEmail }, name: { stringValue: 'QA temporary teacher' }, school: { stringValue: 'QA temporary school' },
      level: { stringValue: 'THCS' }, status: { stringValue: 'active' } } }, quiet());
    const admin = await signIn(adminEmail, initial);
    const teacher = await signIn(teacherEmail, initial);
    stage = 'read teacher profile through live Firestore security rules';
    await readOwnProfile(teacher.body.idToken);
    stage = 'deny teacher password administration';
    assert.equal((await passwordRequest(teacher.body.idToken)).status, 403);
    stage = 'change QA teacher password through Production API';
    const changed = await passwordRequest(admin.body.idToken);
    assert.equal(changed.status, 200, 'Production password API failed: ' + JSON.stringify(changed.data));
    assert.equal(changed.cors, 'https://thiebithocsovn.github.io');
    assert.deepEqual(changed.data, { updated: true, teacherId: teacherUid });
    stage = 'verify new password and reject old password';
    const oldLogin = await signIn(teacherEmail, initial, true);
    assert.equal(oldLogin.status, 400);
    assert.match(oldLogin.body.error?.message || '', /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/);
    const signedInAgain = await signIn(teacherEmail, replacement);
    assert.equal(signedInAgain.body.localId, teacherUid);
    await readOwnProfile(signedInAgain.body.idToken);
    passed = true;
  } catch (error) {
    console.error('Production teacher password check failed at ' + stage + ': ' + error.message);
  } finally {
    if (profileAttempted) {
      try { const result = await database.delete(profile, { ...quiet(), resolveOnHTTPError: true }); assert.ok([200, 404].includes(result.status)); }
      catch { cleanupFailures.push('temporary teacher profile'); }
    }
    for (const localId of created.reverse()) {
      try {
        const result = await identity.post(authPath + '/accounts:delete', { localId }, { ...quiet(), resolveOnHTTPError: true });
        assert.ok(result.status === 200 || /USER_NOT_FOUND/.test(result.body.error?.message || ''));
      } catch { cleanupFailures.push('temporary identity ' + localId); }
    }
    if (dispatcher) await dispatcher.close();
  }
  console.info(JSON.stringify({ passed, temporaryIdentitiesCleaned: created.length - cleanupFailures.filter(item => item.startsWith('temporary identity')).length,
    teacherProfileCleaned: profileAttempted && !cleanupFailures.includes('temporary teacher profile'), cleanupFailures,
    fixtureId: cleanupFailures.length ? teacherUid : undefined, realTeacherPasswordsChanged: false }));
  if (!passed || cleanupFailures.length) process.exitCode = 1;
}

main().catch(() => { console.error('Production teacher password check could not start.'); process.exitCode = 1; });
