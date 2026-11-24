import { collectClassExamAttendance, type ClassExamAttendance, type ClassRosterRecord, type ClassRosterExam, type ClassRosterSession, type ClassRosterResult } from './examClassAttendance';
import { formatStudentName,isFullStudentName } from './studentNameNormalization';
import { normalizeStudentRosterName } from './teacherIsolation';

export function planClassEnrollment(owner:string,classId:string,students:readonly ClassRosterRecord[],exams:readonly ClassRosterExam[],sessions:readonly ClassRosterSession[],results:readonly ClassRosterResult[]){
  const rows=collectClassExamAttendance(owner,classId,students,exams,sessions,results);
  const owned=students.filter(s=>s.teacherId===owner);
  const byId=new Map(owned.map(s=>[s.id,s]));
  const names=new Map<string,Set<string>>();
  for(const s of [...owned.filter(s=>s.classId===classId),...rows.map(row=>byId.get(row.studentId)!).filter(Boolean)]){
    const key=normalizeStudentRosterName(s.name);
    const ids=names.get(key)||new Set<string>();
    ids.add(s.id);names.set(key,ids);
  }
  const eligible:ClassExamAttendance[]=[];
  const review:{row:ClassExamAttendance;reason:string}[]=[];
  for(const row of rows){
    const student=byId.get(row.studentId)!;
    let reason='';
    if(student.classId)reason='Đã thuộc lớp khác';
    else if(!student.examId||student.examId!==row.examId)reason='Chưa xác minh được hồ sơ đăng ký thi';
    else if(!isFullStudentName(student.name))reason='Cần kiểm tra họ tên đầy đủ';
    else if((names.get(normalizeStudentRosterName(student.name))?.size||0)>1)reason='Trùng họ tên – cần giáo viên xác minh';
    if(reason)review.push({row,reason});
    else eligible.push({...row,name:formatStudentName(row.name)});
  }
  return {eligible,review};
}
