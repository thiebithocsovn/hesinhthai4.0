import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ECOSYSTEM_APPLICATIONS } from '../src/ecosystem';

let checks = 0;

function verify(condition: unknown, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
  checks += 1;
}

const expectedIds = [
  'gesture-class',
  'question-studio',
  'lucky-draw',
  'lucky-draw-cards',
  'plicker',
  'learning-wall',
  'head-shake-game',
  'chatbot',
  'exam-manager',
  'secret-box',
  'drag-drop-game',
  'excel-merger',
  'pdf-merger',
];

equal(ECOSYSTEM_APPLICATIONS.length, 13, 'The ecosystem displays exactly thirteen applications.');
equal(ECOSYSTEM_APPLICATIONS.map(application => application.id), expectedIds, 'The supported applications remain available in their expected order.');
equal(new Set(ECOSYSTEM_APPLICATIONS.map(application => application.id)).size, 13, 'Application identifiers remain unique.');
verify(ECOSYSTEM_APPLICATIONS.every(application => application.name !== 'GestureCore Edu'), 'The removed application cannot appear in the public catalog.');

const application = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/components/PlatformBootstrap.tsx', import.meta.url), 'utf8');
const fastLanding = readFileSync(new URL('../src/components/FastLandingPage.tsx', import.meta.url), 'utf8');
const questionStudio = readFileSync(new URL('../src/components/QuestionStudio.tsx', import.meta.url), 'utf8');
const questionStudioApp = readFileSync(new URL('../src/components/QuestionStudioApp.tsx', import.meta.url), 'utf8');
const questionStudioPortal = readFileSync(new URL('../src/components/QuestionStudioLibraryPortal.tsx', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../src/components/PlatformFooter.tsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const packageManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

verify(!/GestureCoreEdu|gesture-core/.test(application), 'The authenticated runtime does not load or route to the removed application.');
verify(!/GestureCoreEdu|gesture-core/.test(fastLanding), 'The fast public homepage does not display the removed application.');
verify(!/GestureCoreEdu|gesture-core/.test(dashboard), 'The teacher library does not load or display the removed application.');
verify(!/gesture-core/.test(footer), 'The homepage footer never links to the removed application.');
verify(fastLanding.includes('ECOSYSTEM_APPLICATIONS.map(application =>'), 'Every catalog application is shown on the fast public homepage.');
verify(main.includes('<PlatformBootstrap />'), 'The production entry mounts the lightweight platform bootstrap.');
verify(!main.includes('<QuestionStudioLibraryPortal />'), 'The production entry does not eagerly mount teacher-library runtime code.');
verify(bootstrap.includes("lazy(() => import('./ProductTrialController'))"), 'The full product/auth runtime is lazy-loaded from the fast bootstrap.');
verify(bootstrap.includes("lazy(() => import('./QuestionStudioLibraryPortal'))"), 'The teacher library portal loads only with the full runtime.');
verify(!fastLanding.includes("from '../firebase'"), 'The fast landing page does not import Firebase.');
verify(!fastLanding.includes("firebase/auth"), 'The fast landing page does not import Firebase Auth.');
verify(application.includes("const QuestionStudioApp = lazy(() => import('./components/QuestionStudioApp'))"), 'The standalone Question Studio route remains lazy-loaded inside the full runtime.');
verify(application.includes("if (currentView === 'question-studio')"), 'Question Studio has a dedicated application route.');
verify(application.includes('isAvailableApplication'), 'Obsolete browser sessions return safely to the homepage.');
verify(dashboard.includes("lazy(() => import('./GestureClass'))"), 'GestureClass continues to load independently.');
verify(dashboard.includes('>GestureClass</h3>'), 'GestureClass remains visible in the teacher library.');
verify(bootstrap.includes('<QuestionStudioLibraryPortal />'), 'The teacher runtime still mounts the standalone Question Studio library card.');
verify(questionStudioPortal.includes('Thư viện tương tác'), 'The Question Studio portal targets the teacher interactive library only.');
verify(questionStudioPortal.includes('Trắc nghiệm 10 dạng'), 'The teacher library card identifies Question Studio clearly.');
verify(questionStudioApp.includes('<QuestionStudio />'), 'The standalone application shell renders the shared Question Studio editor.');
verify(questionStudio.includes('onAuthStateChanged'), 'Question Studio follows the authenticated teacher after a library-page reload.');
verify(questionStudio.includes('question_studio_v1:'), 'Question Studio keeps browser data namespaced per account.');
verify(footer.includes("onOpenProduct('gesture-class')"), 'The footer promotes the supported GestureClass application.');
verify(readme.includes('Danh mục 13 ứng dụng'), 'Project documentation reports thirteen available applications.');
verify(!readme.includes('GestureCore Edu'), 'Project documentation does not advertise the removed application.');
verify(serviceWorker.includes('${CACHE_PREFIX}v23'), 'Existing installations refresh the Plicker camera-stability assets.');
verify(!existsSync(new URL('../src/components/GestureCoreEdu.tsx', import.meta.url)), 'The removed application source is no longer distributed.');
verify(!packageManifest.scripts['test:gesture'], 'Package scripts no longer point to deleted GestureCore-only tests.');
verify(packageManifest.scripts['test:catalog'] === 'node --import tsx scripts/test-application-catalog.ts', 'The application catalog has a dedicated regression suite.');
verify(ECOSYSTEM_APPLICATIONS.some(application => application.name === 'Trắc nghiệm 10 dạng'), 'The standalone Question Studio application is registered.');
verify(ECOSYSTEM_APPLICATIONS.some(application => application.name === 'Tách, gộp file PDF'), 'The existing PDF split-and-merge tool remains available.');
verify(ECOSYSTEM_APPLICATIONS.some(application => application.name === 'Tương tác thẻ Plicker'), 'Plicker remains available.');

console.info(`Thirteen-application catalog with fast bootstrap: ${checks} checks passed.`);