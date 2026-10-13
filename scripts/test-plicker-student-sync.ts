import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getPlickerOrphanedRosterChanges,
  mergePlickerCloudRosters,
  type PlickerLiveStudent,
} from '../src/lib/plickerLive';
import {
  assignPlickerCardIds,
  filterPlickerStudentsByClasses,
  removePlickerStudent,
  renamePlickerStudent,
} from '../src/lib/plickerStudents';
import {
  classifyPlickerSyncError,
  describePlickerSyncError,
  getPlickerSyncErrorCode,
} from '../src/lib/plickerSyncError';

let checks = 0;

assert.equal(getPlickerSyncErrorCode({ code: 'firestore/permission-denied' }), 'permission-denied');
assert.equal(getPlickerSyncErrorCode({ code: 'permission-denied' }), 'permission-denied');
assert.equal(classifyPlickerSyncError({ code: 'permission-denied' }, true).kind, 'permission-denied');
assert.match(describePlickerSyncError({ code: 'permission-denied' }, true), /permission-denied/u);
assert.equal(classifyPlickerSyncError({ code: 'failed-precondition' }, true).kind, 'failed-precondition');
assert.equal(classifyPlickerSyncError({ code: 'unavailable' }, true).kind, 'service-unavailable');
assert.equal(classifyPlickerSyncError({ code: 'unavailable' }, false).kind, 'network-offline');
assert.equal(classifyPlickerSyncError(new Error('Failed to fetch'), true).kind, 'network-error');
assert.equal(classifyPlickerSyncError({ code: 'unauthenticated' }, true).kind, 'unauthenticated');
assert.equal(classifyPlickerSyncError({ code: 'deadline-exceeded' }, true).kind, 'timeout');
assert.equal(classifyPlickerSyncError({ code: 'resource-exhausted' }, true).kind, 'retryable');
assert.match(describePlickerSyncError({ code: 'resource-exhausted' }, true), /60 giây/u);
checks += 12;

const orphanedStudents: PlickerLiveStudent[] = Array.from({ length: 89 }, (_, index) => ({
  id: `orphan-${index + 1}`,
  classId: `deleted-class-${Math.floor(index / 45) + 1}`,
  name: `Học sinh cũ ${index + 1}`,
  cardId: index % 45 + 1,
}));

assert.equal(orphanedStudents.length, 89);
assert.equal(filterPlickerStudentsByClasses(orphanedStudents, []).length, 0);
assert.equal(filterPlickerStudentsByClasses(orphanedStudents, [{ id: 'class-empty' }]).length, 0);
assert.equal(orphanedStudents.length, 89, 'Cleanup must not mutate the previous state.');
checks += 4;

const classA = { id: 'class-8a', title: '8A' };
const classB = { id: 'class-8b', title: '8B' };
const nestedClass = { id: 'folder-learning-wall', parentId: classA.id };
const rosterA: PlickerLiveStudent[] = [
  { id: 'student-an', classId: classA.id, name: 'An', cardId: 1 },
  { id: 'student-binh', classId: classA.id, name: 'Bình', cardId: 2 },
  { id: 'student-chau', classId: classA.id, name: 'Châu', cardId: 3 },
];
const rosterB: PlickerLiveStudent[] = [
  { id: 'student-dung', classId: classB.id, name: 'Dung', cardId: 1 },
  { id: 'student-em', classId: classB.id, name: 'Em', cardId: 2 },
];
const wallStudent: PlickerLiveStudent = {
  id: 'student-wall',
  classId: nestedClass.id,
  name: 'Học sinh tường học tập',
  cardId: 1,
};
const mixed = [...orphanedStudents, ...rosterA, ...rosterB, wallStudent];

assert.deepEqual(filterPlickerStudentsByClasses(mixed, [classA]).map(student => student.id), rosterA.map(student => student.id));
assert.deepEqual(filterPlickerStudentsByClasses(mixed, [classB]).map(student => student.id), rosterB.map(student => student.id));
assert.equal(filterPlickerStudentsByClasses(mixed, [classA, classB]).length, 5);
assert.equal(filterPlickerStudentsByClasses(mixed, [classA, classB, nestedClass]).length, 6);
assert.equal(filterPlickerStudentsByClasses(mixed, [nestedClass])[0]?.id, wallStudent.id);
assert.deepEqual(filterPlickerStudentsByClasses(rosterA, [classA]).map(student => student.cardId), [1, 2, 3]);
assert.strictEqual(filterPlickerStudentsByClasses(rosterA, [classA]), rosterA);
assert.deepEqual(filterPlickerStudentsByClasses([], [classA]), []);
checks += 8;

const afterDeletingA = filterPlickerStudentsByClasses([...rosterA, ...rosterB], [classB]);
assert.deepEqual(afterDeletingA.map(student => student.id), rosterB.map(student => student.id));
assert.equal(filterPlickerStudentsByClasses(afterDeletingA, []).length, 0);
const renamed = renamePlickerStudent([...rosterA], 'student-binh', 'Bình Minh');
assert.equal(filterPlickerStudentsByClasses(renamed, [classA]).length, 3);
assert.equal(filterPlickerStudentsByClasses(renamed, [classA]).find(student => student.id === 'student-binh')?.name, 'Bình Minh');
const afterDeletingStudent = removePlickerStudent(renamed, 'student-binh');
assert.equal(filterPlickerStudentsByClasses(afterDeletingStudent, [classA]).length, 2);
assert.deepEqual(afterDeletingStudent.map(student => student.cardId), [1, 3]);
checks += 6;

const cloudRosters: Record<string, PlickerLiveStudent[]> = {
  [classA.id]: [rosterA[0], rosterA[2]],
  [classB.id]: rosterB,
  'deleted-class-1': orphanedStudents.slice(0, 45),
  'deleted-class-2': orphanedStudents.slice(45),
};
const onlyMine = mergePlickerCloudRosters(rosterA, cloudRosters, [classA.id]);
assert.deepEqual(onlyMine.map(student => student.id), ['student-an', 'student-chau']);
assert.equal(onlyMine.some(student => student.classId === classB.id), false);
assert.equal(onlyMine.some(student => student.classId.startsWith('deleted-class')), false);

const noClasses = mergePlickerCloudRosters([], cloudRosters, []);
assert.deepEqual(noClasses, []);
assert.equal(noClasses.length, 0, 'No existing classes must always mean zero synchronized students.');

const keepAnotherApplication = mergePlickerCloudRosters(
  [...rosterA, wallStudent],
  { [classA.id]: [rosterA[0]], 'deleted-class-1': orphanedStudents.slice(0, 10) },
  [classA.id],
);
assert.deepEqual(keepAnotherApplication.map(student => student.id), [wallStudent.id, 'student-an']);
assert.equal(keepAnotherApplication.find(student => student.id === wallStudent.id)?.name, wallStudent.name);
assert.strictEqual(mergePlickerCloudRosters(rosterA, {}, [classA.id]), rosterA);
assert.deepEqual(mergePlickerCloudRosters(rosterA, { [classA.id]: [] }, [classA.id]), []);
checks += 9;

const withInvalidCloudStudent = mergePlickerCloudRosters([], {
  [classA.id]: [rosterA[0], { ...rosterB[0], id: 'mismatched-class' }],
}, [classA.id]);
assert.deepEqual(withInvalidCloudStudent, [rosterA[0]]);
assert.deepEqual(mergePlickerCloudRosters([], { [classA.id]: rosterA }), rosterA, 'Existing callers retain backwards compatibility.');
checks += 2;

assert.deepEqual(getPlickerOrphanedRosterChanges(cloudRosters, [classA.id, classB.id]), {
  'deleted-class-1': [],
  'deleted-class-2': [],
});
assert.deepEqual(getPlickerOrphanedRosterChanges(cloudRosters, [classA.id]), {
  [classB.id]: [],
  'deleted-class-1': [],
  'deleted-class-2': [],
});
assert.deepEqual(getPlickerOrphanedRosterChanges({ [classA.id]: [] }, []), {});
assert.deepEqual(getPlickerOrphanedRosterChanges({ [classA.id]: rosterA }, []), { [classA.id]: [] });
assert.deepEqual(getPlickerOrphanedRosterChanges({}, [classA.id]), {});
assert.deepEqual(getPlickerOrphanedRosterChanges({ [classA.id]: rosterA }, new Set([classA.id])), {});
checks += 6;

let persisted = [...mixed];
persisted = filterPlickerStudentsByClasses(persisted, [classA, classB, nestedClass]);
assert.equal(persisted.length, 6);
const teacherAStudents = filterPlickerStudentsByClasses(persisted, [classA]);
assert.equal(teacherAStudents.length, 3);
const scopedCloudStudents = mergePlickerCloudRosters(persisted, cloudRosters, [classA.id]);
assert.equal(filterPlickerStudentsByClasses(scopedCloudStudents, [classA]).length, 2);
assert.equal(filterPlickerStudentsByClasses(scopedCloudStudents, [classB]).length, 2);
assert.equal(scopedCloudStudents.some(student => student.classId.startsWith('deleted-class')), false);
persisted = filterPlickerStudentsByClasses(scopedCloudStudents, []);
assert.equal(persisted.length, 0);
assert.equal(JSON.stringify(persisted), '[]');
assert.deepEqual(assignPlickerCardIds(persisted), []);
checks += 8;

const dashboard = readFileSync(new URL('../src/components/AdminDashboard.tsx', import.meta.url), 'utf8');
const classroom = readFileSync(new URL('../src/components/PlickerClassroom.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

for (const feature of [
  'const [categoriesReady, setCategoriesReady] = useState(false)',
  'setCategoriesReady(true)',
  'filterPlickerStudentsByClasses(',
  'administratorCloudStudents',
  'if (!categoriesReady) return',
  'filterPlickerStudentsByClasses(previous, categories)',
  'categories={plickerCategories}',
  'categoriesReady={categoriesReady}',
  'allStudents={plickerStudents}',
  'plickerCategories.map(classroom => classroom.id)',
]) {
  assert.equal(dashboard.includes(feature), true, `Missing account/class synchronization safeguard: ${feature}`);
  checks += 1;
}

for (const feature of [
  'filterPlickerStudentsByClasses(allStudents, categories)',
  'value={registeredStudents.length}',
  'categoryIdsRef.current.has(classId)',
  'categoryIdsRef.current.has(normalizedRoom.activeSession.classId)',
  'getPlickerOrphanedRosterChanges(',
  'cloudRostersRef.current',
]) {
  assert.equal(classroom.includes(feature), true, `Missing stale-roster synchronization safeguard: ${feature}`);
  checks += 1;
}
assert.doesNotMatch(classroom, /title="Học sinh" value=\{allStudents\.length\}/u);
assert.match(worker, /CACHE_PREFIX\}v\d+/u);
checks += 2;

console.info(`Plicker student counts, orphan cleanup and Firebase class synchronization: ${checks} checks passed.`);
