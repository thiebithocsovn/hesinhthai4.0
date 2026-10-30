const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

// Reproduce Vercel's separate-file ESM output without tsx's extension resolution.
const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(root, '.teacher-password-native-'));
try {
  const modules = ['api/admin/teachers/password.ts', 'server/teacherAdminApp.ts', 'server/teacherAdmin.ts',
    'server/teacherAdminFirebase.ts', 'server/teacherAdminCredentials.ts', 'server/teacherAdminFederation.ts',
    'server/teacherAdminDocuments.ts'];
  for (const file of modules) {
    const output = path.join(directory, file.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, fileName: file,
    }).outputText);
  }
  fs.copyFileSync(path.join(root, 'firebase-applet-config.json'), path.join(directory, 'firebase-applet-config.json'));
  fs.writeFileSync(path.join(directory, 'package.json'), '{"type":"module"}');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: directory, encoding: 'utf8', timeout: 25_000,
    env: { ...process.env, VERCEL: '1', ALLOWED_ORIGINS: 'https://thiebithocsovn.github.io' },
    input: `
      import assert from 'node:assert/strict';
      const { default: app } = await import('./api/admin/teachers/password.js');
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/teachers/password';
      try {
        const origin = 'https://thiebithocsovn.github.io';
        const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin } });
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
        assert.equal((await fetch(url, { method: 'POST', headers: { Origin: origin } })).status, 401);
        assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403);
      } finally { await new Promise(resolve => server.close(resolve)); }
    `,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  console.info('Native Node ESM password API passed: separate-file imports, JSON import attributes, CORS and unauthenticated denial.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
