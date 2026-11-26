import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Teacher } from '../src/types';
import { VIETNAM_PROVINCES,isVietnamProvince } from '../src/lib/vietnamProvinces';
import { directoryStats,directoryOptions,filterDirectory,foldDirectoryText,paginateDirectory,regionalGroups,schoolKey,UNKNOWN_PROVINCE } from '../src/lib/teacherDirectory';
const teachers:Teacher[]=[
{id:'a',name:'Nguyễn Văn An',email:'an@example.test',username:'an',school:'Trường THCS A',level:'THCS',status:'active'},
{id:'b',name:'Đỗ Thị Bình',email:'binh@example.test',username:'binh',school:' trường  THCS A ',level:'THCS',status:'inactive'},
{id:'c',name:'Lê Thị Chi',email:'chi@example.test',username:'chi',school:'Trường Tiểu học B',level:'Tiểu học',status:'active'}];
const defaults={query:'',school:'',level:'',status:'all' as const,sort:'name' as const,direction:'asc' as const};
assert.deepEqual(directoryStats(teachers),{total:3,active:2,inactive:1,schools:2});
assert.equal(directoryOptions(teachers,'school').length,2);
assert.equal(filterDirectory(teachers,{...defaults,query:'do thi binh'})[0].id,'b');
assert.equal(filterDirectory(teachers,{...defaults,query:'binh thcs'})[0].id,'b');
assert.equal(filterDirectory(teachers,{...defaults,query:'nguyen an',status:'inactive'}).length,0);
assert.equal(filterDirectory(teachers,{...defaults,school:foldDirectoryText('Trường THCS A')}).length,2);
assert.equal(filterDirectory(teachers,{...defaults,level:foldDirectoryText('Tiểu học')})[0].id,'c');
assert.equal(filterDirectory(teachers,{...defaults,query:'khong ton tai'}).length,0);
assert.equal(paginateDirectory(teachers,99,2).page,2);
assert.deepEqual(paginateDirectory([],1,20),{page:1,pages:1,from:0,to:0,items:[]});
assert.deepEqual(teachers.map(t=>t.id),['a','b','c']);
const admin=readFileSync(new URL('../src/components/AdminDashboard.tsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/TeacherDirectory.tsx',import.meta.url),'utf8');
assert.ok(admin.includes("accessScope.role === 'administrator' ? <TeacherDirectory"));
assert.ok(admin.includes('onPassword={handleResetPassword}'));
assert.ok(admin.includes('onToggle={handleToggleStatus}'));
assert.ok(admin.includes('onDelete={handleDeleteTeacher}'));
assert.ok(!ui.includes('firebase/firestore'));
assert.ok(ui.includes('Chờ duyệt hoặc bị khóa'));
console.log('Teacher directory: search, filters, pagination and administrator boundary checks passed.');

assert.equal(VIETNAM_PROVINCES.length,34);
assert.equal(new Set(VIETNAM_PROVINCES).size,34);
assert.equal(isVietnamProvince('Thái Nguyên'),true);
assert.equal(isVietnamProvince('Bắc Kạn'),false);
const regional:Teacher[]=[{...teachers[0],province:'Thái Nguyên'},{...teachers[1],province:'Hà Nội'},teachers[2]];
assert.equal(regionalGroups(regional).length,3);
assert.equal(regionalGroups(regional).find(g=>g.key===UNKNOWN_PROVINCE)?.total,1);
assert.notEqual(schoolKey(regional[0]),schoolKey(regional[1]));
assert.equal(filterDirectory(regional,{...defaults,province:'Thái Nguyên'})[0].id,'a');
assert.equal(filterDirectory(regional,{...defaults,regionalSchool:schoolKey(regional[1])})[0].id,'b');
assert.equal(filterDirectory(regional,{...defaults,province:UNKNOWN_PROVINCE})[0].id,'c');
assert.equal(filterDirectory(regional,{...defaults,query:'thai nguyen'})[0].id,'a');
assert.ok(ui.includes('Lọc tỉnh/thành phố'));
assert.ok(admin.includes('isVietnamProvince(newTeacher.province)'));
console.log('Regional directory and legacy account compatibility checks passed.');
