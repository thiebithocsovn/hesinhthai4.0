import { encryptExamResume, decryptExamResume, matchesExamResume, remainingExamSeconds, type ExamResumeState } from './examResume';
import { getSubmittedExamClassId, getExamStudentClasses, withExamStudentClass } from './examStudentClasses';
import { normalizeStudentRosterName, isValidTeacherUid } from './teacherIsolation';
import { formatStudentName } from './studentNameNormalization';
export const RECOVERY_VALID_MS=10*60*1000;
type ExamRef={id:string;teacherId?:string;durationMinutes:number;status:string;classNames?:Record<string,string>;shuffledVersions?:{code:string}[]};
type StudentRef={id:string;teacherId?:string;name:string;classId?:string};
type SessionRef={id:string;examId:string;studentId:string;teacherId?:string;status:string;startTime:string;examVersion?:string;draftAnswers?:Record<string,unknown>;draftCheatEvents?:ExamResumeState['cheatEvents']};
export interface TeacherRecovery extends ExamResumeState<{id:string;teacherId:string;durationMinutes:number},{id:string;name:string;classId?:string;teacherId:string}> { issuedAt:number; teacherRecovery:true }
export function buildTeacherRecovery(exam:ExamRef,student:StudentRef,session:SessionRef,hasResult:boolean,now=Date.now()):TeacherRecovery {
  const owner=exam.teacherId;
  if(!isValidTeacherUid(owner)||exam.status!=='published'||student.teacherId!==owner||session.teacherId!==owner||
     session.examId!==exam.id||session.studentId!==student.id||session.id!==student.id+'_'+exam.id||session.status!=='taking'||hasResult)
    throw Error('Chỉ khôi phục phiên đang làm bài, chưa có kết quả, thuộc đúng giáo viên.');
  if(!session.draftAnswers)throw Error('Không có bản nháp trên máy chủ để khôi phục.');
  if(!remainingExamSeconds(session.startTime,exam.durationMinutes,now))throw Error('Đã hết thời gian làm bài. Hãy thu bài đã lưu, không đặt lại đồng hồ.');
  const classId=getSubmittedExamClassId(exam,{answers:session.draftAnswers})||student.classId;
  if(getExamStudentClasses(exam).length&&!getExamStudentClasses(exam).some(c=>c.id===classId))throw Error('Chưa xác minh được lớp của lượt thi.');
  const version=session.examVersion||'Gốc';
  if(version!=='Gốc'&&!exam.shuffledVersions?.some(v=>v.code===version))throw Error('Không còn mã đề gốc của phiên thi.');
  return {version:1,teacherRecovery:true,issuedAt:now,teacherId:owner,examId:exam.id,studentId:student.id,
    startedAt:session.startTime,exam:{id:exam.id,teacherId:owner,durationMinutes:exam.durationMinutes},
    student:{id:student.id,name:formatStudentName(student.name),teacherId:owner,...(classId?{classId}:{})},
    examVersion:version,answers:withExamStudentClass(session.draftAnswers),
    cheatEvents:session.draftCheatEvents||{rightClicks:0,tabChanges:0,windowResizes:0}};
}
export async function encryptTeacherRecovery(state:TeacherRecovery) {
  const code=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  return {code,encrypted:await encryptExamResume(state,code)};
}
export async function readTeacherRecovery(raw:string,code:string,exam:ExamRef,name:string,classId?:string,now=Date.now()):Promise<TeacherRecovery> {
  const decoded=await decryptExamResume(raw,code.trim()) as TeacherRecovery|null;
  if(!decoded||decoded.teacherRecovery!==true||!matchesExamResume(decoded,exam.teacherId||'',exam.id,decoded.studentId)||
     !Number.isFinite(decoded.issuedAt)||decoded.issuedAt>now+60_000||now-decoded.issuedAt>RECOVERY_VALID_MS||
     decoded.exam.durationMinutes!==exam.durationMinutes||
     normalizeStudentRosterName(decoded.student.name)!==normalizeStudentRosterName(name)||
     decoded.student.classId!==classId||!remainingExamSeconds(decoded.startedAt,exam.durationMinutes,now))
    throw Error('Gói khôi phục không khớp họ tên, lớp, kỳ thi hoặc đã hết hạn. Hãy liên hệ giáo viên.');
  return decoded;
}
