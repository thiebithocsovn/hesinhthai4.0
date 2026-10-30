import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { DEFAULT_KPI_CRITERIA, calculateKpiTotal, type KpiScores } from '../src/lib/kpi';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run KPI Firestore tests in the emulator only.');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const environment = await initializeTestEnvironment({
  projectId:'demo-learning-wall',
  firestore: {host,port:Number(port),rules:readFileSync('firestore.rules','utf8')},
});
const ids = {
  schoolA:'school-alpha-001',
  schoolB:'school-beta-002',
  ownerA:'owner-alpha-001',
  ownerB:'owner-bravo-002',
  reviewer:'reviewer-toan-001',
  math:'teacher-toan-001',
  english:'teacher-anh-002',
  outsider:'outsider-003',
};
const scores:KpiScores={ethics:10,skills:15,innovation:5,quantity:20,quality:30,timeliness:20};
const ownerDoc=(school:string)=>doc(environment.authenticatedContext(ids.ownerA).firestore(),'kpiSchools',school);
const memberPath=(school:string,uid:string)=>['kpiSchools',school,'members',uid] as const;
const periodPath=(school:string,month:string)=>['kpiSchools',school,'periods',month] as const;
const entryPath=(school:string,month:string,uid:string)=>['kpiSchools',school,'periods',month,'entries',uid] as const;
const month='2026-10';
try {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context=>{
    for (const uid of Object.values(ids).filter(v=>!v.startsWith('school-'))) {
      await setDoc(doc(context.firestore(),'teachers',uid),{id:uid,status:'active'});
    }
  });
  const ownerA=environment.authenticatedContext(ids.ownerA).firestore();
  const ownerB=environment.authenticatedContext(ids.ownerB).firestore();
  const reviewer=environment.authenticatedContext(ids.reviewer).firestore();
  const math=environment.authenticatedContext(ids.math).firestore();
  const english=environment.authenticatedContext(ids.english).firestore();
  const outsider=environment.authenticatedContext(ids.outsider).firestore();
  const anonymous=environment.unauthenticatedContext().firestore();

  const base=(name:string,ownerUid:string)=>({name,ownerUid,criteria:DEFAULT_KPI_CRITERIA,createdAt:serverTimestamp()});
  await assertSucceeds(setDoc(doc(ownerA,'kpiSchools',ids.schoolA),base('THCS A',ids.ownerA)));
  await assertSucceeds(setDoc(doc(ownerB,'kpiSchools',ids.schoolB),base('THCS B',ids.ownerB)));
  await assertSucceeds(getDoc(ownerDoc(ids.schoolA)));
  await assertFails(getDoc(doc(anonymous,'kpiSchools',ids.schoolA)));
  await assertFails(getDoc(doc(outsider,'kpiSchools',ids.schoolA)));
  await assertFails(getDoc(doc(ownerA,'kpiSchools',ids.schoolB)));
  await assertFails(updateDoc(doc(outsider,'kpiSchools',ids.schoolA),{name:'Chiếm quyền'}));

  const addMember=async (uid:string,name:string,team:string,role:'teacher'|'reviewer')=>{
    await assertSucceeds(setDoc(doc(ownerA,...memberPath(ids.schoolA,uid)),{
      uid,name,team,role,status:'active',
    }));
  };
  await addMember(ids.reviewer,'Tổ trưởng Toán','Toán','reviewer');
  await addMember(ids.math,'Giáo viên Toán','Toán','teacher');
  await addMember(ids.english,'Giáo viên Anh','Tiếng Anh','teacher');
  await assertFails(setDoc(doc(reviewer,...memberPath(ids.schoolA,ids.outsider)),{
    uid:ids.outsider,name:'Lạ',team:'Toán',role:'reviewer',status:'active',
  }));
  await assertSucceeds(getDoc(doc(math,'kpiSchools',ids.schoolA)));
  await assertSucceeds(getDoc(doc(math,...memberPath(ids.schoolA,ids.math))));
  await assertFails(getDoc(doc(math,...memberPath(ids.schoolA,ids.english))));
  await assertFails(getDocs(collection(math,'kpiSchools',ids.schoolA,'members')));
  const mathTeam=await assertSucceeds(getDocs(query(
    collection(reviewer,'kpiSchools',ids.schoolA,'members'),where('team','==','Toán')
  )));
  assert.equal(mathTeam.docs.length,2);
  await assertFails(getDocs(collection(reviewer,'kpiSchools',ids.schoolA,'members')));
  await assertFails(getDoc(doc(reviewer,...memberPath(ids.schoolA,ids.english))));

  await assertSucceeds(setDoc(doc(ownerA,...periodPath(ids.schoolA,month)),{
    month,status:'open',criteria:DEFAULT_KPI_CRITERIA,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
  }));
  await assertFails(setDoc(doc(math,...periodPath(ids.schoolA,'2026-11')),{
    month:'2026-11',status:'open',criteria:DEFAULT_KPI_CRITERIA,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
  }));
  const myEntry=(uid:string,name:string,team:string)=>({
    uid,name,team,selfScores:scores,selfTotal:calculateKpiTotal(scores),
    status:'submitted',reviewScores:null,reviewTotal:null,note:'',reviewedBy:'',approvedBy:'',
    createdAt:serverTimestamp(),updatedAt:serverTimestamp(),
  });
  await assertSucceeds(setDoc(doc(math,...entryPath(ids.schoolA,month,ids.math)),myEntry(ids.math,'Giáo viên Toán','Toán')));
  await assertSucceeds(setDoc(doc(english,...entryPath(ids.schoolA,month,ids.english)),myEntry(ids.english,'Giáo viên Anh','Tiếng Anh')));
  await assertSucceeds(getDoc(doc(math,...entryPath(ids.schoolA,month,ids.math))));
  await assertFails(getDoc(doc(math,...entryPath(ids.schoolA,month,ids.english))));
  await assertFails(getDoc(doc(anonymous,...entryPath(ids.schoolA,month,ids.math))));
  await assertFails(getDocs(collection(math,'kpiSchools',ids.schoolA,'periods',month,'entries')));
  const reviewedTeam=await assertSucceeds(getDocs(query(
    collection(reviewer,'kpiSchools',ids.schoolA,'periods',month,'entries'),where('team','==','Toán')
  )));
  assert.equal(reviewedTeam.docs.length,1);
  await assertFails(getDocs(collection(reviewer,'kpiSchools',ids.schoolA,'periods',month,'entries')));
  await assertFails(getDoc(doc(reviewer,...entryPath(ids.schoolA,month,ids.english))));

  const mathEntry=doc(math,...entryPath(ids.schoolA,month,ids.math));
  const reviewerEntry=doc(reviewer,...entryPath(ids.schoolA,month,ids.math));
  const bad={...scores,quality:99};
  await assertFails(updateDoc(mathEntry,{selfScores:bad,selfTotal:169,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(mathEntry,{status:'approved',approvedBy:ids.math,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(reviewerEntry,{
    status:'returned',reviewScores:scores,reviewTotal:100,reviewedBy:ids.reviewer,updatedAt:serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(reviewerEntry,{
    status:'returned',reviewScores:scores,reviewTotal:100,reviewedBy:ids.reviewer,
    note:'Bổ sung căn cứ đánh giá',updatedAt:serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(mathEntry,{
    selfScores:scores,selfTotal:100,status:'submitted',updatedAt:serverTimestamp(),
    reviewScores:null,reviewTotal:null,note:'',reviewedBy:'',
  }));
  await assertSucceeds(updateDoc(reviewerEntry,{
    status:'reviewed',reviewScores:scores,reviewTotal:100,reviewedBy:ids.reviewer,
    note:'Đã xác minh',updatedAt:serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(reviewer,...entryPath(ids.schoolA,month,ids.english)),{
    status:'reviewed',reviewScores:scores,reviewTotal:100,reviewedBy:ids.reviewer,updatedAt:serverTimestamp(),
  }));
  await assertFails(updateDoc(reviewerEntry,{
    status:'approved',approvedBy:ids.reviewer,updatedAt:serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(ownerA,...entryPath(ids.schoolA,month,ids.math)),{
    status:'approved',approvedBy:ids.ownerA,updatedAt:serverTimestamp(),
  }));
  await assertFails(updateDoc(mathEntry,{selfTotal:50,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(ownerA,...periodPath(ids.schoolA,month)),{
    status:'closed',updatedAt:serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(ownerA,...entryPath(ids.schoolA,month,ids.english)),{
    status:'approved',approvedBy:ids.ownerA,updatedAt:serverTimestamp(),
  }));
  console.info('EduKPI Firestore: two-school isolation, team roles, score integrity, submission/review/approval and period lock passed.');
} finally {
  await environment.cleanup();
}
