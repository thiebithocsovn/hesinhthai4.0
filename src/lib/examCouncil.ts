export const COUNCIL_ROLES = ['Chủ tịch','Phó chủ tịch','Thư ký','Trưởng ban coi thi','Giám thị','Cán bộ chấm thi','Kỹ thuật viên','Hỗ trợ'] as const;
export type CouncilRole = typeof COUNCIL_ROLES[number];
export interface SchoolTeacher { id: string; name: string; school: string; status: string; level: string }
export interface CouncilMember { id: string; name: string; role: CouncilRole; room: string; teacherUid?: string }
export interface CouncilPlan { version: 1; name: string; schoolName: string; site: string; members: CouncilMember[]; updatedAt: string }
export function schoolKey(s: unknown): string { return String(s || '').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN'); }
export function groupSchools(teachers: readonly SchoolTeacher[]) {
  const groups = new Map<string,{key:string;name:string;teachers:SchoolTeacher[];active:number}>();
  for (const t of teachers) {
    const key=schoolKey(t.school);
    const group=groups.get(key)||{key,name:t.school.trim().replace(/\s+/g,' ')||'Chưa khai báo trường',teachers:[],active:0};
    group.teachers.push(t);
    if(t.status==='active')group.active++;
    groups.set(key,group);
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
export function validateCouncil(plan: CouncilPlan, validRooms: readonly string[]): string[] {
  const errors:string[]=[];
  if(!plan.name.trim()||plan.name.length>160)errors.push('Tên hội đồng phải có từ 1 đến 160 ký tự.');
  if(!plan.schoolName.trim()||plan.schoolName.length>160)errors.push('Tên trường phải có từ 1 đến 160 ký tự.');
  if(!plan.site.trim()||plan.site.length>160)errors.push('Điểm thi phải có từ 1 đến 160 ký tự.');
  if(!plan.members.length||plan.members.length>100)errors.push('Cần từ 1 đến 100 thành viên.');
  if(plan.members.filter(m=>m.role==='Chủ tịch').length!==1)errors.push('Phải có đúng một chủ tịch hội đồng.');
  if(!plan.members.some(m=>m.role==='Thư ký'))errors.push('Cần ít nhất một thư ký.');
  const seen=new Set<string>(),uids=new Set<string>(),names=new Set<string>();
  for(const m of plan.members) {
    if(!m.id||seen.has(m.id))errors.push('Mã thành viên thiếu hoặc trùng.');
    seen.add(m.id);
    const name=schoolKey(m.name);
    if(!name||m.name.length>160)errors.push('Họ tên thành viên thiếu hoặc quá dài.');
    if(names.has(name))errors.push('Trùng họ tên thành viên; mỗi người chỉ khai báo một lần.');
    names.add(name);
    if(!COUNCIL_ROLES.includes(m.role))errors.push('Vai trò không hợp lệ.');
    if(m.teacherUid){if(uids.has(m.teacherUid))errors.push('Trùng tài khoản giáo viên.');uids.add(m.teacherUid);}
    if(m.room && (m.role!=='Giám thị'||!validRooms.includes(m.room)))errors.push('Phân công phòng không hợp lệ: '+m.name);
  }
  return [...new Set(errors)];
}
