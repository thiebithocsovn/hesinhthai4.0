const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const PROJECT = 'gen-lang-client-0870957273';
const NUMBER = '154715124810';
const POOL = 'hesinhthai-teacher-password';
const PROVIDER = `projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/vercel-production`;
const ACCOUNT = `teacher-password-api@${PROJECT}.iam.gserviceaccount.com`;
const ROLE = `projects/${PROJECT}/roles/teacherPasswordApiRuntime`;
const PERMISSIONS = ['datastore.entities.get', 'firebaseauth.users.get', 'firebaseauth.users.update'];
const SUBJECT = 'owner:thietbihocso:project:hesinhthai4-0:environment:production';
const MEMBER = `principal://iam.googleapis.com/projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/${SUBJECT}`;
const PROVIDER_CONFIG = {
  displayName: 'Teacher password Production',
  oidc: { issuerUri: 'https://oidc.vercel.com/thietbihocso', allowedAudiences: ['https://vercel.com/thietbihocso'] },
  attributeMapping: { 'google.subject': 'assertion.sub' },
  attributeCondition: "assertion.owner_id == 'team_Wj2PlJf7oclNGPVrOnzoNssi' && assertion.project_id == 'prj_5bfktYdbgtBlF49H2RwVN6u8QYu5' && assertion.environment == 'production'",
};

function mergeBinding(policy, role, member) {
  const result = structuredClone(policy);
  result.bindings ||= [];
  let binding = result.bindings.find(item => item.role === role && !item.condition);
  if (!binding) { binding = { role, members: [] }; result.bindings.push(binding); }
  if (!binding.members.includes(member)) binding.members.push(member);
  return result;
}

function validateRole(role) {
  assert.deepEqual([...role.includedPermissions].sort(), PERMISSIONS);
  assert.ok(!role.deleted && role.stage !== 'DISABLED', 'The runtime role must be active.');
}

function validateProvider(provider) {
  assert.ok(provider.disabled !== true, 'The identity provider must be enabled.');
  assert.equal(provider.oidc.issuerUri, PROVIDER_CONFIG.oidc.issuerUri);
  assert.deepEqual(provider.oidc.allowedAudiences, PROVIDER_CONFIG.oidc.allowedAudiences);
  assert.deepEqual(provider.attributeMapping, PROVIDER_CONFIG.attributeMapping);
  assert.equal(provider.attributeCondition, PROVIDER_CONFIG.attributeCondition);
}

function firebaseLibrary() {
  const index = process.argv.indexOf('--firebase-tools-lib');
  if (index >= 0) return path.resolve(process.argv[index + 1]);
  try { return path.dirname(require.resolve('firebase-tools/lib/auth.js')); } catch {}
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const bin = path.join(directory, 'firebase');
    if (fs.existsSync(bin)) return path.resolve(path.dirname(fs.realpathSync(bin)), '..');
  }
  throw new Error('Run with Firebase CLI installed, or provide --firebase-tools-lib.');
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.info(JSON.stringify({ project: PROJECT, serviceAccount: ACCOUNT, permissions: PERMISSIONS,
      provider: PROVIDER, issuer: PROVIDER_CONFIG.oidc.issuerUri, condition: PROVIDER_CONFIG.attributeCondition,
      privateKeysCreated: false, enablesBilling: false }, null, 2));
    return;
  }
  const lib = firebaseLibrary();
  const auth = require(path.join(lib, 'auth.js'));
  const account = auth.getGlobalDefaultAccount();
  if (!account) throw new Error('Sign in with the official Firebase CLI first.');
  await require(path.join(lib, 'requireAuth.js')).requireAuth({ project: PROJECT, user: account.user, tokens: account.tokens });
  const { Client } = require(path.join(lib, 'apiv2.js'));
  const client = host => new Client({ urlPrefix: 'https://' + host, apiVersion: 'v1' });
  const iam = client('iam.googleapis.com');
  const usage = client('serviceusage.googleapis.com');
  const manager = client('cloudresourcemanager.googleapis.com');
  const waitOperation = async (api, operation) => {
    for (let attempt = 0; attempt < 45; attempt++) {
      if (operation.done) {
        if (operation.error) throw new Error('Google operation failed: ' + operation.error.code);
        return operation.response;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      operation = (await api.get('/' + operation.name)).body;
    }
    throw new Error('Google operation is pending. Re-run to inspect existing resources.');
  };
  const getIfExists = async (api, resource) => {
    const response = await api.get('/' + resource, { resolveOnHTTPError: true });
    if (response.status === 404) return null;
    if (response.status !== 200) throw new Error('Cannot inspect resource (HTTP ' + response.status + '): ' + resource);
    return response.body;
  };

  const project = (await manager.get('/projects/' + PROJECT)).body;
  assert.equal(String(project.projectNumber), NUMBER);
  assert.equal(project.projectId, PROJECT);
  for (const service of ['iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com']) {
    const resource = `projects/${NUMBER}/services/${service}`;
    const state = (await usage.get('/' + resource)).body;
    if (state.state !== 'ENABLED') {
      console.info('Enabling identity API: ' + service);
      await waitOperation(usage, (await usage.post('/' + resource + ':enable', {})).body);
    }
  }

  console.info('Configuring the limited teacher-password runtime identity.');
  let role = await getIfExists(iam, ROLE);
  if (!role) role = (await iam.post(`/projects/${PROJECT}/roles`, { roleId: 'teacherPasswordApiRuntime',
    role: { title: 'Teacher password API runtime', description: 'Read teacher/admin identities and update Firebase Auth passwords.',
      stage: 'GA', includedPermissions: PERMISSIONS } })).body;
  validateRole(role);
  const accountResource = `projects/${PROJECT}/serviceAccounts/${ACCOUNT}`;
  const existingAccount = await getIfExists(iam, accountResource);
  if (!existingAccount) await iam.post(`/projects/${PROJECT}/serviceAccounts`, { accountId: 'teacher-password-api',
    serviceAccount: { displayName: 'Teacher password API', description: 'Keyless identity for the Hesinhthai teacher password Production API.' } });
  else assert.ok(!existingAccount.disabled, 'The existing runtime identity is disabled.');

  const projectPolicy = (await manager.post(`/projects/${PROJECT}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } })).body;
  for (const binding of projectPolicy.bindings || []) {
    if (binding.members?.includes('serviceAccount:' + ACCOUNT)) assert.equal(binding.role, ROLE, 'The runtime identity has an unexpected project role.');
  }
  const updatedProjectPolicy = mergeBinding(projectPolicy, ROLE, 'serviceAccount:' + ACCOUNT);
  if (JSON.stringify(projectPolicy) !== JSON.stringify(updatedProjectPolicy)) {
    await manager.post(`/projects/${PROJECT}:setIamPolicy`, { policy: updatedProjectPolicy });
  }

  const poolResource = `projects/${NUMBER}/locations/global/workloadIdentityPools/${POOL}`;
  let pool = await getIfExists(iam, poolResource);
  if (!pool) {
    await waitOperation(iam, (await iam.post(`/projects/${NUMBER}/locations/global/workloadIdentityPools`,
      { displayName: 'Hesinhthai teacher passwords', description: 'Only this application Production runtime.', disabled: false },
      { queryParams: { workloadIdentityPoolId: POOL } })).body);
    pool = await getIfExists(iam, poolResource);
  }
  assert.equal(pool.state, 'ACTIVE');
  const providers = (await iam.get('/' + poolResource + '/providers')).body.workloadIdentityPoolProviders || [];
  assert.ok(providers.every(provider => provider.name === PROVIDER), 'The pool contains an unexpected provider.');
  let provider = await getIfExists(iam, PROVIDER);
  if (!provider) {
    await waitOperation(iam, (await iam.post('/' + poolResource + '/providers', PROVIDER_CONFIG,
      { queryParams: { workloadIdentityPoolProviderId: 'vercel-production' } })).body);
    provider = await getIfExists(iam, PROVIDER);
  }
  validateProvider(provider);
  const policy = (await iam.post('/' + accountResource + ':getIamPolicy', {}, { queryParams: { 'options.requestedPolicyVersion': 3 } })).body;
  assert.ok((policy.bindings || []).every(binding => binding.role === 'roles/iam.workloadIdentityUser' &&
    !binding.condition && binding.members.every(member => member === MEMBER)), 'The runtime identity has an unexpected impersonation grant.');
  const updated = mergeBinding(policy, 'roles/iam.workloadIdentityUser', MEMBER);
  if (JSON.stringify(policy) !== JSON.stringify(updated)) await iam.post('/' + accountResource + ':setIamPolicy', { policy: updated });
  console.info(JSON.stringify({ configured: true, TEACHER_ADMIN_WIF_PROVIDER: PROVIDER, TEACHER_ADMIN_SERVICE_ACCOUNT: ACCOUNT,
    privateKeysCreated: false, enablesBilling: false }, null, 2));
}

module.exports = { mergeBinding, validateRole, validateProvider, PERMISSIONS, PROVIDER_CONFIG, MEMBER };
if (require.main === module) main().catch(error => { console.error('Teacher password identity setup failed: ' + error.message); process.exitCode = 1; });
