import { getSubmittedExamClassId } from './examStudentClasses';
export interface ClassRosterRecord { id:string; teacherId?:string; name:string; classId?:string; examId?:string; selfEnrolled?:boolean; enrollmentExcluded?:boolean }
export interface ClassRosterExam { id:string; teacherId?:string; title:string; classNames?:Record<string,string> }
export interface ClassRosterSession { id:string; teacherId?:string; examId:string; studentId:string; status:string; lastActive:string; draftAnswers?:Record<string,unknown> }
export interface ClassRosterResult { id:string; teacherId?:string; examId:string; studentId:string; submittedAt:string; answers?:Record<string,unknown> }
export interface ClassExamAttendance { key:string; studentId:string; name:string; examId:string; examTitle:string; status:'taking'|'submitted' }
export function collectClassExamAttendance(owner:string,classId:string,students:readonly ClassRosterRecord[],exams:readonly ClassRosterExam[],sessions:readonly ClassRosterSession[],results:readonly ClassRosterResult[]):ClassExamAttendance[] {
  if(!owner||!classId)return [];
  const people=new Map(students.filter(s=>s.teacherId===owner).map(s=>[s.id,s]));
  const papers=new Map(exams.filter(e=>e.teacherId===owner).map(e=>[e.id,e]));
  type Evidence={examId:string;studentId:string;classId?:string;status:'taking'|'submitted';at:number};
  const evidence=new Map<string,Evidence>();
  const key=(examId:string,studentId:string)=>JSON.stringify([examId,studentId]);
  for(const session of sessions){
    if(session.teacherId!==owner||!papers.has(session.examId)||!people.has(session.studentId)||!['taking','submitted'].includes(session.status))continue;
    const id=key(session.examId,session.studentId);
    const at=Date.parse(session.lastActive)||0;
    const existing=evidence.get(id);
    if(!existing||at>existing.at) evidence.set(id,{examId:session.examId,studentId:session.studentId,classId:getSubmittedExamClassId(papers.get(session.examId)!,{answers:session.draftAnswers}),status:session.status==='submitted'?'submitted':'taking',at});
  }
  const latestResults=new Map<string,ClassRosterResult>();
  for(const result of results){
    if(result.teacherId!==owner||!papers.has(result.examId)||!people.has(result.studentId))continue;
    const id=key(result.examId,result.studentId);
    const existing=latestResults.get(id);
    if(!existing||(Date.parse(result.submittedAt)||0)>=(Date.parse(existing.submittedAt)||0))latestResults.set(id,result);
  }
  for(const [id,result] of latestResults){
    const old=evidence.get(id);
    // A submitted class takes precedence over the draft. Older results without
    // enrollment metadata may fall back to the matching session, not a guessed class.
    evidence.set(id,{examId:result.examId,studentId:result.studentId,classId:getSubmittedExamClassId(papers.get(result.examId)!,result)||old?.classId,status:'submitted',at:Date.parse(result.submittedAt)||0});
  }
  const rows:ClassExamAttendance[]=[];
  for(const [id,item] of evidence){
    const student=people.get(item.studentId)!;
    if(item.classId!==classId||student.classId===classId||(student.examId&&student.examId!==item.examId))continue;
    rows.push({key:id,studentId:student.id,name:student.name,examId:item.examId,examTitle:papers.get(item.examId)!.title,status:item.status});
  }
  return rows.sort((a,b)=>a.name.localeCompare(b.name,'vi')||a.examTitle.localeCompare(b.examTitle,'vi')||a.key.localeCompare(b.key));
}
