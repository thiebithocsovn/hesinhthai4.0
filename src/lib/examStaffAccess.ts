import type { CouncilRole, CouncilPlan } from './examCouncil';
export const STAFF_KINDS: Record<CouncilRole, {kind:string; label:string; help:string}> = {
  'Chủ tịch':{kind:'decision',label:'Chỉ đạo hội đồng',help:'Ghi nhận tình trạng sẵn sàng, quyết định điều phối hoặc sự cố cần xử lý.'},
  'Phó chủ tịch':{kind:'coordination',label:'Điều phối hội đồng',help:'Báo cáo công tác phối hợp và nhiệm vụ được giao.'},
  'Thư ký':{kind:'minutes',label:'Biên bản hội đồng',help:'Báo cáo tình trạng lập và tổng hợp biên bản.'},
  'Trưởng ban coi thi':{kind:'supervision',label:'Điều hành coi thi',help:'Báo cáo tiến độ tổ chức và sự cố coi thi.'},
  'Giám thị':{kind:'room_report',label:'Báo cáo phòng thi',help:'Xác nhận phòng được giao sẵn sàng và báo cáo sự cố trong phòng.'},
  'Cán bộ chấm thi':{kind:'grading_report',label:'Báo cáo công tác chấm',help:'Báo cáo tiến độ chấm và vấn đề nghiệp vụ; không cấp quyền sửa điểm.'},
  'Kỹ thuật viên':{kind:'technical_report',label:'Báo cáo kỹ thuật',help:'Xác nhận thiết bị, mạng và sự cố kỹ thuật.'},
  'Hỗ trợ':{kind:'support_report',label:'Báo cáo hỗ trợ',help:'Báo cáo công tác hỗ trợ được phân công.'},
};
export type StaffState='pending'|'ready'|'issue'|'completed';
export const STAFF_STATES:Record<StaffState,string>={pending:'Chưa xác nhận',ready:'Sẵn sàng',issue:'Có sự cố',completed:'Hoàn thành'};
export interface StaffExam {id:string;title:string;teacherId?:string;status:'draft'|'published'|'closed';councilPlan?:CouncilPlan}
export interface StaffAssignment {
  id:string;examId:string;teacherId:string;staffUid:string;staffName:string;
  role:CouncilRole;kind:string;room:string;examTitle:string;schoolName:string;
  councilName:string;site:string;councilRevision:string;memberIndex:number;state:StaffState;report:string;active:boolean;
}
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
export function assignmentId(examId:string,staffUid:string,revision:string) {
  if(!validId(examId)||!validId(staffUid)||!revision||revision.length>64||!/^[0-9TZ:.-]+$/.test(revision))throw new Error('Mã kỳ thi hoặc tài khoản không hợp lệ.');
  return examId+'~'+staffUid+'~'+revision;
}
export function prepareAssignment(exam:StaffExam,index:number,issuer:string){
  const plan=exam.councilPlan;
  if(!plan||exam.status!=='draft'||!validId(exam.teacherId)||!validId(issuer))throw new Error('Chỉ cấp nhiệm vụ cho hội đồng đã lưu của kỳ thi nháp.');
  const m=plan.members[index];
  if(!m||!validId(m.teacherUid)||!STAFF_KINDS[m.role])throw new Error('Thành viên phải liên kết tài khoản giáo viên thật.');
  if(m.role==='Giám thị'&&!m.room)throw new Error('Giám thị phải có phòng thi.');
  if(m.role!=='Giám thị'&&m.room)throw new Error('Phòng thi chỉ được khai báo cho giám thị.');
  return {examId:exam.id,teacherId:exam.teacherId,staffUid:m.teacherUid,staffName:m.name,
    role:m.role,kind:STAFF_KINDS[m.role].kind,room:m.room,examTitle:exam.title,schoolName:plan.schoolName,
    councilName:plan.name,site:plan.site,councilRevision:plan.updatedAt,memberIndex:index,state:'pending' as const,report:'',active:true,grantedBy:issuer};
}
