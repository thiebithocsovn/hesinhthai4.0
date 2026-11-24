import { formatStudentName, isFullStudentName } from './studentNameNormalization';
import { createStudentRosterLookupKey, normalizeStudentRosterName, type PrivateStudentRosterEntry } from './teacherIsolation';

export function inspectStudentName(raw:string) {
  const name=formatStudentName(raw);
  const full=isFullStudentName(name);
  return {name,full,changed:name!==raw,hasVietnameseMarks:/[\p{M}đ]/iu.test(name.normalize('NFD'))};
}
export async function checkStudentNameAgainstRoster(name:string,owner:string,examId:string,classId:string,directory:Record<string,PrivateStudentRosterEntry>) {
  if(!classId||!name.trim())return 'unavailable' as const;
  const key=await createStudentRosterLookupKey(owner,examId,name,classId);
  const entry=directory[key];
  if(entry?.classId===classId)return entry.ambiguous?'ambiguous' as const:'matched' as const;
  return Object.values(directory).some(item=>item.classId===classId&&!item.selfEnrolled)?'unmatched' as const:'open' as const;
}
export interface NameAgentRecord {id:string;name:string;teacherId?:string;classId?:string;selfEnrolled?:boolean}
export type NameFinding={kind:'duplicate'|'incomplete'|'possible-spelling'|'format'|'check-diacritics';suggestion?:string};
function foldName(name:string) {
  return normalizeStudentRosterName(name).normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/g,'d');
}
/** Teacher-only review, scoped to the current class. A spelling match is a hint,
 * never proof of identity. Never automatically merge, rename or move a record. */
export function auditClassNames(owner:string,classId:string,official:readonly NameAgentRecord[],visible:readonly NameAgentRecord[]):Map<string,NameFinding>{
  const rows=visible.filter(s=>s.teacherId===owner&&(!s.classId||s.classId===classId));
  const references=official.filter(s=>s.teacherId===owner&&s.classId===classId&&!s.selfEnrolled);
  const counts=new Map<string,Set<string>>();
  for(const s of rows){const key=normalizeStudentRosterName(s.name);const ids=counts.get(key)||new Set<string>();ids.add(s.id);counts.set(key,ids);}
  const out=new Map<string,NameFinding>();
  for(const s of rows){
    const check=inspectStudentName(s.name);
    if((counts.get(normalizeStudentRosterName(s.name))?.size||0)>1){out.set(s.id,{kind:'duplicate'});continue;}
    if(!check.full){out.set(s.id,{kind:'incomplete'});continue;}
    const candidates=references.filter(ref=>ref.id!==s.id&&foldName(ref.name)===foldName(s.name));
    if(candidates.length===1&&normalizeStudentRosterName(candidates[0].name)!==normalizeStudentRosterName(s.name)){out.set(s.id,{kind:'possible-spelling',suggestion:formatStudentName(candidates[0].name)});continue;}
    if(candidates.length>1){out.set(s.id,{kind:'duplicate'});continue;}
    if(check.changed){out.set(s.id,{kind:'format',suggestion:check.name});continue;}
    if(!check.hasVietnameseMarks)out.set(s.id,{kind:'check-diacritics'});
  }
  return out;
}
