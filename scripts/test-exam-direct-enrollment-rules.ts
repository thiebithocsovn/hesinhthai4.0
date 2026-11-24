import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,writeBatch} from 'firebase/firestore';
import {createExamGuestStudentId} from '../src/lib/teacherIsolation';
import {withExamStudentClass} from '../src/lib/examStudentClasses';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Emulator only');
const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env=await initializeTestEnvironment({projectId:'demo-learning-wall',firestore:{host,port:Number(port),rules:readFileSync('firestore.rules','utf8')}});
try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const id of ['owner','other'])await setDoc(doc(db,'teachers',id),{id,status:'active'});
    for(const [id,teacherId] of [['open-class','owner'],['strict-class','owner'],['foreign-class','other']])await setDoc(doc(db,'classes',id),{id,teacherId,name:id});
    await setDoc(doc(db,'exams','exam-a'),{teacherId:'owner',status:'published',classNames:{'open-class':'4A','strict-class':'4B','foreign-class':'Foreign'},selfEnrollmentClassIds:['open-class','foreign-class'],questions:[{id:'q1'}]});
  });
  const guest=env.unauthenticatedContext().firestore(),owner=env.authenticatedContext('owner').firestore();
  const other=env.authenticatedContext('other').firestore();
  const make=async(name:string,classId:string)=>{
    const id=await createExamGuestStudentId('owner','exam-a',name,classId);
    const student={id,teacherId:'owner',name,code:'123456',examId:'exam-a',classId,selfEnrolled:true};
    const timestamp='2026-11-24T08:00:00Z';
    const session={id:id+'_exam-a',teacherId:'owner',examId:'exam-a',studentId:id,status:'taking',startTime:timestamp,lastActive:timestamp,examVersion:'Gốc',draftAnswers:withExamStudentClass({},classId)};
    return {student,session};
  };
  const commit=(pair:Awaited<ReturnType<typeof make>>)=>{
    const batch=writeBatch(guest);
    batch.set(doc(guest,'students',pair.student.id),pair.student);
    batch.set(doc(guest,'exam_sessions',pair.session.id),pair.session);
    return batch.commit();
  };
  const good=await make('Nguyễn Văn An','open-class');
  await assertFails(setDoc(doc(guest,'students',good.student.id),good.student));
  await assertFails(setDoc(doc(guest,'exam_sessions',good.session.id),good.session));
  await assertFails(commit(await make('Lê Thị Mai','strict-class')));
  await assertFails(commit(await make('Lê Thị Lan','foreign-class')));
  await assertFails(commit(await make('Lê Thị Hoa','missing-class')));
  const wrong=await make('Lê Văn B','open-class');
  await assertFails(commit({...wrong,session:{...wrong.session,draftAnswers:withExamStudentClass({},'strict-class')}}));
  await assertFails(commit({...wrong,student:{...wrong.student,selfEnrolled:false}}));
  await assertSucceeds(commit(good));
  const saved=(await assertSucceeds(getDoc(doc(owner,'students',good.student.id)))).data()!;
  assert.equal(saved.classId,'open-class');assert.equal(saved.selfEnrolled,true);
  await assertFails(getDoc(doc(guest,'students',good.student.id)));
  await assertFails(getDocs(collection(guest,'students')));
  await assertFails(getDoc(doc(other,'students',good.student.id)));
  await assertFails(updateDoc(doc(guest,'students',good.student.id),{classId:'strict-class'}));
  await assertFails(commit(good));
  await assertSucceeds(updateDoc(doc(guest,'exam_sessions',good.session.id),{lastActive:'2026-11-24T08:01:00Z',draftAnswers:withExamStudentClass({q1:1},'open-class')}));
  await assertSucceeds(updateDoc(doc(owner,'exams','exam-a'),{status:'closed'}));
  await assertFails(commit(await make('Trần Văn C','open-class')));
  console.log('Direct enrollment emulator: atomic student/session, open class, owner isolation, read denial, no guest updates, repeat and closed exam protection passed.');
}finally{await env.cleanup();}
