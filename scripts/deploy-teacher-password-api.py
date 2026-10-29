#!/usr/bin/env python3
"""Update the existing private API with teacher password management; no password input."""
import argparse
import json
import re
import subprocess
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROJECT = json.loads((ROOT / 'firebase-applet-config.json').read_text())['projectId']
REGION = 'asia-southeast1'
SERVICE = 'learning-wall-ai'
ROLE_ID = 'teacherPasswordManager'
PERMISSIONS = ['firebaseauth.users.get', 'firebaseauth.users.update', 'datastore.entities.get']
ORIGIN = 'https://thiebithocsovn.github.io'


def cloud(*args, optional=False):
    result = subprocess.run(['gcloud', *args, '--quiet', '--project=' + PROJECT], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode and not optional:
        # Do not echo raw deployment errors: a provider can include credential/configuration data.
        raise RuntimeError('Google Cloud operation failed: ' + ' '.join(args[:3]) +
                           '. Check this deployment account has Cloud Run, Cloud Build and IAM deployment permissions.')
    return result


def deploy(administrator_email):
    existing = cloud('run', 'services', 'describe', SERVICE, '--region=' + REGION, '--format=json', optional=True)
    if existing.returncode:
        raise RuntimeError('Existing learning-wall-ai service is unavailable. Deploy the private API first; no new service or billing was created.')
    service = json.loads(existing.stdout)
    runtime = service.get('spec', {}).get('template', {}).get('spec', {}).get('serviceAccountName', '')
    if not re.fullmatch(r'[A-Za-z0-9_-]+@' + re.escape(PROJECT) + r'\.iam\.gserviceaccount\.com', runtime):
        raise RuntimeError('The existing API must use a dedicated service account in this Firebase project.')
    billing = json.loads(cloud('billing', 'projects', 'describe', PROJECT, '--format=json').stdout)
    if billing.get('billingEnabled') is not True:
        raise RuntimeError('Existing Google Cloud billing is not enabled. No billing was activated.')
    role_name = 'projects/' + PROJECT + '/roles/' + ROLE_ID
    role = cloud('iam', 'roles', 'describe', ROLE_ID, '--format=json', optional=True)
    if role.returncode:
        cloud('iam', 'roles', 'create', ROLE_ID, '--title=Teacher password management',
              '--permissions=' + ','.join(PERMISSIONS), '--stage=GA', '--format=none')
    elif set(json.loads(role.stdout).get('includedPermissions', [])) != set(PERMISSIONS):
        raise RuntimeError('Existing teacherPasswordManager IAM role differs from the expected limited permissions. Review it before deployment.')
    cloud('projects', 'add-iam-policy-binding', PROJECT, '--member=serviceAccount:' + runtime,
          '--role=' + role_name, '--condition=None', '--format=none')
    builder = 'wall-ai-builder@' + PROJECT + '.iam.gserviceaccount.com'
    cloud('run', 'deploy', SERVICE, '--region=' + REGION, '--source=.',
          '--service-account=' + runtime,
          '--build-service-account=projects/' + PROJECT + '/serviceAccounts/' + builder,
          '--update-env-vars=TEACHER_ADMIN_EMAILS=' + administrator_email, '--format=none')
    url = cloud('run', 'services', 'describe', SERVICE, '--region=' + REGION, '--format=value(status.url)').stdout.decode().strip()
    if not re.fullmatch(r'https://[A-Za-z0-9.-]+\.run\.app', url):
        raise RuntimeError('The API deployment returned an unexpected URL.')
    request = urllib.request.Request(url + '/api/admin/teachers/password', data=b'{}',
                                     headers={'Content-Type': 'application/json', 'Origin': ORIGIN})
    try:
        urllib.request.urlopen(request, timeout=30).read()
        raise RuntimeError('The password endpoint accepted an unauthenticated request.')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError('The deployed password route did not pass its authentication check.') from None
    return url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--admin-email', default='tuyenthcskimhy@gmail.com')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--github-output', type=Path)
    args = parser.parse_args()
    email = args.admin_email.strip().lower()
    if not re.fullmatch(r'[^\s,=<>|]+@[^\s,=<>|]+\.[^\s,=<>|]+', email):
        parser.error('Administrator email is invalid.')
    if not args.apply:
        print(json.dumps({'project': PROJECT, 'service': SERVICE, 'permissions': PERMISSIONS,
                          'administratorEmail': email, 'applyRequested': False}))
        return
    url = deploy(email)
    if args.github_output:
        with args.github_output.open('a') as output:
            output.write('url=' + url + '\n')
    print(json.dumps({'deployed': True, 'url': url, 'unauthenticatedRequestDenied': True}))


if __name__ == '__main__':
    main()
