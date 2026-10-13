import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIVE_TEACHER_SESSION_KEY,
  synchronizeTeacherBrowserSession,
  type TeacherSessionStorage,
} from '../src/lib/teacherIsolation.ts';

let checks = 0;
const verify = (condition: unknown, description: string) => {
  assert.ok(condition, description);
  checks += 1;
};

class MemorySessionStorage implements TeacherSessionStorage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

const storage = new MemorySessionStorage();
storage.setItem(ACTIVE_TEACHER_SESSION_KEY, 'teacher-one');
storage.setItem('currentStudent', '{"name":"Riêng tư"}');
storage.setItem('activeExam', '{"correctAnswer":1}');
storage.setItem('examVersion', '9175038402');
storage.setItem('submitted_exam_student_exam::teacher-one', '1');
storage.setItem('unrelated::teacher-two', 'preserved');
storage.setItem('currentView', 'admin');

verify(synchronizeTeacherBrowserSession(storage, 'teacher-two'), 'Changing teacher accounts resets the active workspace.');
verify(storage.getItem(ACTIVE_TEACHER_SESSION_KEY) === 'teacher-two', 'The current session is bound to the new Firebase UID.');
for (const key of ['currentStudent', 'activeExam', 'examVersion', 'submitted_exam_student_exam::teacher-one']) {
  verify(storage.getItem(key) === null, `A previous teacher cannot leave ${key} visible to the next account.`);
}
verify(storage.getItem('unrelated::teacher-two') === 'preserved', 'The next teacher retains their own existing state.');
verify(storage.getItem('currentView') === 'admin', 'Switching teachers does not delete unrelated navigation preferences.');

storage.setItem('activeExam', 'teacher-two-exam');
verify(!synchronizeTeacherBrowserSession(storage, 'teacher-two'), 'Refreshing the same account does not reset an active session.');
verify(storage.getItem('activeExam') === 'teacher-two-exam', 'The same teacher can continue an existing browser session.');
verify(synchronizeTeacherBrowserSession(storage, null), 'Signing out clears the current teacher session.');
verify(storage.getItem(ACTIVE_TEACHER_SESSION_KEY) === null, 'Signing out removes the Firebase UID marker.');
verify(storage.getItem('activeExam') === null, 'Signing out removes decrypted exam content.');
assert.throws(() => synchronizeTeacherBrowserSession(storage, '../another-teacher'), RangeError);
checks += 1;

const studentStorage = new MemorySessionStorage();
studentStorage.setItem('activeExam', 'student-can-resume');
verify(!synchronizeTeacherBrowserSession(studentStorage, null), 'An existing guest student can refresh the exam page.');
verify(studentStorage.getItem('activeExam') === 'student-can-resume', 'Guest student refreshes preserve the in-progress exam.');
verify(synchronizeTeacherBrowserSession(studentStorage, 'teacher-three'), 'Signing in after a guest exam switches the account boundary.');
verify(studentStorage.getItem('activeExam') === null, 'Teacher sign-in clears any earlier student exam session.');

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
verify(rules.includes('function isActiveTeacher()'), 'Firestore checks the active status of every teacher account.');
verify(rules.includes(".data.status == 'active'"), 'Locked and pending teachers cannot query private workspaces.');
verify(rules.includes('return ownerField in data && isActiveTeacher() && isOwner(data[ownerField]);'),
  'Ownership alone never grants access to an inactive teacher.');
verify(rules.includes('function enrolledStudentBelongsToTeacher(studentId, teacherId)'),
  'Student operations are tied to the teacher that owns the enrollment record.');
verify(rules.includes('guestStudentIsSafe(studentId)'), 'Guest enrollment accepts only an explicit minimal data shape.');
verify(rules.includes('guestSessionIsSafe(sessionId)'), 'Guests cannot create arbitrary exam-session documents.');
verify(rules.includes('guestResultIsSafe(resultId)'), 'Guests cannot create arbitrary result documents.');
verify(rules.includes('incoming().score <= incoming().totalQuestions'), 'Results cannot claim a score above the number of exam questions.');
verify(rules.includes('incoming().totalQuestions <= 500'), 'Untrusted result payloads have a bounded question count.');
verify(rules.includes(".data.status == 'taking'"), 'A guest can submit results only from an active exam session.');
verify(rules.includes('examQuestionCountMatches(incoming().examId, incoming().totalQuestions)'),
  'A submitted result must use the question count from its original private exam.');
verify(rules.includes('activeSessionBelongsToStudent(resultId, incoming().studentId,'),
  'A submitted result must match the active session student, exam and teacher.');
verify(rules.includes("affectedKeys().hasOnly(['lastActive', 'status'])"),
  'Guest heartbeats cannot change ownership, student identity or exam identity.');

const firebaseSource = readFileSync(new URL('../src/firebase.ts', import.meta.url), 'utf8');
verify(firebaseSource.includes("VITE_FIRESTORE_CACHE_MODE === 'persistent'"),
  'Persistent student-data storage is disabled unless a trusted teacher explicitly opts in.');
verify(firebaseSource.includes('memoryLocalCache()'), 'Shared school devices use an in-memory Firestore cache.');

const environmentExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
verify(environmentExample.includes('VITE_FIRESTORE_CACHE_MODE="memory"'),
  'Sample configurations default to memory-only student-data storage.');

const application = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
verify(application.includes('synchronizeTeacherBrowserSession(sessionStorage, firebaseUser?.uid)'),
  'Every Firebase identity transition clears stale private account state.');
verify(application.includes('synchronizeTeacherBrowserSession(sessionStorage, null)'),
  'Explicit sign-out clears the previous teacher workspace.');
verify(application.includes("onSnapshot(doc(db, 'teachers', signedInUid)"),
  'The website watches account status while a teacher is signed in.');
verify(application.includes("profile.data().status === 'active'"),
  'A locked teacher is disconnected as soon as the administrator disables the account.');

const firebaseSettings = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')) as {
  firestore: { database: string; rules: string }[];
};
const appSettings = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8')) as {
  projectId: string;
  firestoreDatabaseId: string;
};
verify(firebaseSettings.firestore.length === 1, 'Rules deployment targets only the application database.');
verify(firebaseSettings.firestore[0].database === appSettings.firestoreDatabaseId,
  'Rules deployment targets the same named Firestore database as the production website.');
verify(firebaseSettings.firestore[0].rules === 'firestore.rules', 'Deployment publishes the audited ownership rules.');

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};
verify(packageJson.scripts['deploy:firestore'].includes(appSettings.projectId),
  'Rules deployment is pinned to the existing Firebase project.');
verify(packageJson.scripts['deploy:firestore'].includes('firebase-tools@^15.17.0'),
  'Named-database deployment uses a Firebase CLI version with the multi-database rules fix.');
verify(packageJson.scripts['test:hardening'].includes('test-ecosystem-hardening.ts'),
  'The existing ecosystem hardening test remains enabled after merging concurrent work.');

const workflow = readFileSync(new URL('../.github/workflows/main.yml', import.meta.url), 'utf8');
verify(workflow.includes('FIREBASE_SERVICE_ACCOUNT_JSON'),
  'GitHub Pages can publish server-side rules when a Firebase deployment secret is configured.');
verify(workflow.includes('npm run deploy:firestore'), 'Rules are published during the GitHub deployment when credentials exist.');
verify(workflow.includes('npm run test:plicker-student-sync'),
  'GitHub deployments verify that Plicker student synchronization stays account-scoped.');
verify(workflow.includes('npm run test:hardening'),
  'GitHub deployments preserve the existing OMR, learning-wall and public-statistics checks.');
verify(workflow.includes("vars.VITE_FIRESTORE_CACHE_MODE || 'memory'"),
  'GitHub Pages builds use memory-only Firestore storage unless an owner explicitly opts in.');

const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
verify(/CACHE_PREFIX\}v\d+/u.test(worker), 'The service worker uses a numbered cache invalidation key.');
for (const file of ['test-plicker-mobile.ts', 'test-plicker-reports.ts', 'test-plicker-student-sync.ts']) {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  verify(source.includes('CACHE_PREFIX\\}v\\d+'), `${file} accepts the current service-worker cache version.`);
}

console.info(`Teacher account hardening, shared-device privacy and guarded submissions: ${checks} checks passed.`);
