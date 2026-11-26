import type { Teacher } from '../types';
import { isVietnamProvince } from './vietnamProvinces';
export type DirectoryStatus = 'all' | 'active' | 'inactive';
export type DirectorySort = 'name' | 'school' | 'province' | 'level' | 'status' | 'username';
export const foldDirectoryText = (value: unknown): string => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('vi').replace(/đ/g,'d').replace(/\s+/g,' ');
const label = (value: unknown) => String(value ?? '').trim().replace(/\s+/g,' ');
export const UNKNOWN_PROVINCE = '__unassigned_province__';
export const UNKNOWN_SCHOOL = '__unassigned_school__';
export const provinceKey = (t: Teacher) => isVietnamProvince(t.province) ? t.province : UNKNOWN_PROVINCE;
export const provinceLabel = (key: string) => key === UNKNOWN_PROVINCE ? 'Chưa xác định tỉnh' : key;
export const schoolKey = (t: Teacher) => JSON.stringify([provinceKey(t), foldDirectoryText(t.school) || UNKNOWN_SCHOOL]);
export function regionalGroups(teachers: Teacher[]) {
  const groups = new Map<string, { key:string; label:string; teachers:Teacher[]; schools:Map<string,{key:string;label:string;teachers:Teacher[]}> }>();
  for (const t of teachers) {
    const key = provinceKey(t);
    let group = groups.get(key);
    if (!group) { group={key,label:provinceLabel(key),teachers:[],schools:new Map()};groups.set(key,group); }
    group.teachers.push(t);
    const sk=schoolKey(t);
    let school=group.schools.get(sk);
    if (!school) {school={key:sk,label:label(t.school)||'Chưa khai báo trường',teachers:[]};group.schools.set(sk,school);}
    school.teachers.push(t);
  }
  return [...groups.values()].sort((a,b)=>a.key===UNKNOWN_PROVINCE?1:b.key===UNKNOWN_PROVINCE?-1:a.label.localeCompare(b.label,'vi')).map(g=>({key:g.key,label:g.label,total:g.teachers.length,active:g.teachers.filter(t=>t.status==='active').length,schools:[...g.schools.values()].sort((a,b)=>a.label.localeCompare(b.label,'vi')).map(s=>({key:s.key,label:s.label,total:s.teachers.length,active:s.teachers.filter(t=>t.status==='active').length}))}));
}
export function directoryOptions(teachers: Teacher[], field: 'school' | 'level') {
  const values = new Map<string,string>();
  for (const teacher of teachers) { const name = label(teacher[field]); const key = foldDirectoryText(name); if (key && !values.has(key)) values.set(key,name); }
  return [...values].map(([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label,'vi'));
}
export function directoryStats(teachers: Teacher[]) {
  const active = teachers.filter(t=>t.status==='active').length;
  return { total: teachers.length, active, inactive: teachers.length-active, schools: directoryOptions(teachers,'school').length };
}
export function filterDirectory(teachers: Teacher[], filters: { query: string; school: string; province?: string; regionalSchool?: string; level: string; status: DirectoryStatus; sort: DirectorySort; direction: 'asc'|'desc' }) {
  const words = foldDirectoryText(filters.query).split(' ').filter(Boolean);
  const result = teachers.filter(t=>{
    if (filters.status !== 'all' && (filters.status==='active' ? t.status!=='active' : t.status==='active')) return false;
    if (filters.province && provinceKey(t)!==filters.province) return false;
    if (filters.regionalSchool && schoolKey(t)!==filters.regionalSchool) return false;
    if (filters.school && foldDirectoryText(t.school)!==filters.school) return false;
    if (filters.level && foldDirectoryText(t.level)!==filters.level) return false;
    const haystack = foldDirectoryText([t.name,t.email,t.username,t.school,t.level,t.province].map(label).join(' '));
    return words.every(word=>haystack.includes(word));
  });
  return result.sort((a,b)=>{
    const compare = label(a[filters.sort]).localeCompare(label(b[filters.sort]),'vi',{sensitivity:'base',numeric:true});
    return (filters.direction==='asc'?compare:-compare) || label(a.name).localeCompare(label(b.name),'vi') || a.id.localeCompare(b.id);
  });
}
export function paginateDirectory<T>(items: T[], requestedPage: number, size: number) {
  const pageSize = Math.max(1,Math.floor(size)||20);
  const pages = Math.max(1,Math.ceil(items.length/pageSize));
  const page = Math.min(pages,Math.max(1,Math.floor(requestedPage)||1));
  const offset = (page-1)*pageSize;
  return { page,pages,from:items.length?offset+1:0,to:Math.min(offset+pageSize,items.length),items:items.slice(offset,offset+pageSize) };
}
export const directoryInitials = (name: string) => label(name).split(' ').filter(Boolean).slice(-2).map(word=>word[0]?.toLocaleUpperCase('vi')).join('') || 'GV';
