import { collection,doc,getDocsFromServer,query,runTransaction,where,type Firestore } from 'firebase/firestore';
import { planClassEnrollment } from './examEnrollmentPlan';
import { formatStudentName } from './studentNameNormalization';
import { type ClassRosterRecord,type ClassRosterExam,type ClassRosterSession,type ClassRosterResult } from './examClassAttendance';

/** Runs with the signed-in teacher's existing rules. Never rewrites results or session IDs. */
export async function reconcileClassEnrollment(db:Firestore,owner:string,classId:string){
  const fetchOwned=async<T>(name:string):Promise<T[]>=>{
    const snap=await getDocsFromServer(query(collection(db,name),where('teacherId','==',owner)));
    return snap.docs.map(d=>({...d.data(),id:d.id} as T));
  };
  const [students,exams,sessions,results]=await Promise.all([
    fetchOwned<ClassRosterRecord>('students'),fetchOwned<ClassRosterExam>('exams'),
    fetchOwned<ClassRosterSession>('exam_sessions'),fetchOwned<ClassRosterResult>('results')
  ]);
  const plan=planClassEnrollment(owner,classId,students,exams,sessions,results);
  // Limit a single pass and run sequentially to avoid a large burst of writes.
  let added=0;
  for(const row of plan.eligible.slice(0,100)){
    const original=students.find(s=>s.id===row.studentId)!;
    const resultIds=results.filter(s=>s.studentId===row.studentId&&s.examId===row.examId).map(s=>s.id);
    const sessionIds=sessions.filter(s=>s.studentId===row.studentId&&s.examId===row.examId).map(s=>s.id);
    const changed=await runTransaction(db,async tx=>{
      const ref=doc(db,'students',row.studentId);
      const [c,s,e,...evidence]=await Promise.all([
        tx.get(doc(db,'classes',classId)),tx.get(ref),tx.get(doc(db,'exams',row.examId)),
        ...sessionIds.map(id=>tx.get(doc(db,'exam_sessions',id))),...resultIds.map(id=>tx.get(doc(db,'results',id)))
      ]);
      if(!c.exists()||c.data().teacherId!==owner||!s.exists()||s.data().teacherId!==owner||s.data().classId||
        s.data().examId!==row.examId||s.data().name!==original.name||!e.exists()||e.data().teacherId!==owner)return false;
      const current={...s.data(),id:s.id} as ClassRosterRecord;
      const freshExam={...e.data(),id:e.id} as ClassRosterExam;
      const freshSessions=evidence.slice(0,sessionIds.length).filter(d=>d.exists()).map(d=>({...d.data(),id:d.id} as ClassRosterSession));
      const freshResults=evidence.slice(sessionIds.length).filter(d=>d.exists()).map(d=>({...d.data(),id:d.id} as ClassRosterResult));
      if(!planClassEnrollment(owner,classId,[current],[freshExam],freshSessions,freshResults).eligible.length)return false;
      tx.update(ref,{classId,name:formatStudentName(current.name),selfEnrolled:true});
      return true;
    });
    if(changed)added++;
  }
  return {added,review:plan.review.length};
}
