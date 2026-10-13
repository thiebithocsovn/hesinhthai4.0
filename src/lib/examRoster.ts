import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { createPrivateStudentRosterDirectory, isValidTeacherUid, type PrivateStudentRosterSource } from './teacherIsolation';

/** Fetch metadata independently of whichever teacher tab is currently loaded. */
export async function loadExamRosterMetadata(db: Firestore, teacherId: string, examId: string) {
  if (!isValidTeacherUid(teacherId)) throw new Error('Không xác định được giáo viên của kỳ thi.');
  const [students, classes] = await Promise.all([
    getDocs(query(collection(db, 'students'), where('teacherId', '==', teacherId))),
    getDocs(query(collection(db, 'classes'), where('teacherId', '==', teacherId))),
  ]);
  return {
    studentDirectory: await createPrivateStudentRosterDirectory(teacherId, examId,
      students.docs.map(item => ({ ...item.data(), id: item.id } as PrivateStudentRosterSource))),
    classNames: Object.fromEntries(classes.docs.map(item => [item.id, String(item.data().name || '')])),
  };
}
