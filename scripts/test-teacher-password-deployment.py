import importlib.util
import json
import subprocess
from pathlib import Path
from unittest.mock import patch
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('teacher_deploy', ROOT / 'scripts/deploy-teacher-password-api.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
assert set(deploy.PERMISSIONS) == {'firebaseauth.users.get', 'firebaseauth.users.update', 'datastore.entities.get'}

calls = []
def missing_service(*args, **options):
    calls.append(args)
    return subprocess.CompletedProcess(args, 1, b'', b'')

with patch.object(deploy, 'cloud', side_effect=missing_service):
    try:
        deploy.deploy('admin@example.edu')
        raise AssertionError('A missing service was created implicitly')
    except RuntimeError as error:
        assert 'no new service or billing' in str(error)
assert len(calls) == 1

calls.clear()
runtime = 'wall-ai-runtime@' + deploy.PROJECT + '.iam.gserviceaccount.com'
def simulated_cloud(*args, **options):
    calls.append(args)
    if args[:3] == ('run', 'services', 'describe'):
        result = (b'https://teacher-test.a.run.app\n' if '--format=value(status.url)' in args else
                  json.dumps({'spec': {'template': {'spec': {'serviceAccountName': runtime}}}}).encode())
    elif args[:3] == ('billing', 'projects', 'describe'):
        result = b'{"billingEnabled":true}'
    elif args[:3] == ('iam', 'roles', 'describe'):
        return subprocess.CompletedProcess(args, 1, b'', b'')
    else:
        result = b''
    return subprocess.CompletedProcess(args, 0, result, b'')

with patch.object(deploy, 'cloud', side_effect=simulated_cloud), patch.object(deploy.urllib.request, 'urlopen',
        side_effect=urllib.error.HTTPError('https://teacher-test.a.run.app', 401, 'Unauthorized', {}, None)):
    assert deploy.deploy('admin@example.edu') == 'https://teacher-test.a.run.app'
run = next(call for call in calls if call[:2] == ('run', 'deploy'))
assert '--update-env-vars=TEACHER_ADMIN_EMAILS=admin@example.edu' in run
assert not any('secrets' in arg or arg.startswith('--set-env-vars') or 'allow-unauthenticated' in arg for arg in run)
assert not any(call[:2] == ('services', 'enable') or call[:2] == ('billing', 'enable') for call in calls)
assert any(call[:3] == ('iam', 'roles', 'create') and '--permissions=' + ','.join(deploy.PERMISSIONS) in call for call in calls)

for name in ['.dockerignore', '.gcloudignore']:
    content = (ROOT / name).read_text()
    assert '!server/teacherAdmin.ts' in content
    assert '!server/teacherAdminFirebase.ts' in content
    assert '!server/teacherAdminCredentials.ts' in content
    assert '**/.env*' in content
vercel = json.loads((ROOT / 'vercel.json').read_text())
assert vercel['framework'] == 'vite'
assert vercel['buildCommand'] == 'npm run build:static'
assert vercel['env']['NODE_OPTIONS'] == '--experimental-require-module'
assert vercel['functions']['api/admin/teachers/password.ts']['maxDuration'] == 30
assert '**/.env*' in (ROOT / '.vercelignore').read_text()
print('Teacher password deployment passed: existing-service preflight, limited IAM role, retained provider secrets/configuration and private-source packaging.')
