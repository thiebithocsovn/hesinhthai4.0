import assert from 'node:assert/strict';
import type { KpiEntry, KpiEntryStatus, KpiMember } from '../src/lib/kpi';
import { kpiMonths, kpiOfficialScore, kpiMonthlyTrend, kpiTeamSummary, kpiPersonSummary, summarizeKpiRecords } from '../src/lib/kpiAnalytics';

const scores={ethics:10,skills:15,innovation:5,quantity:20,quality:30,timeliness:20};
function entry(uid:string,team:string,status:KpiEntryStatus,total:number|null):KpiEntry{
  return {uid,name:'GV '+uid,team,selfScores:scores,selfTotal:100,status,reviewScores:total===null?null:{...scores,quality:scores.quality-(100-total)},
    reviewTotal:total,note:'',reviewedBy:'',approvedBy:''};
}
const members:KpiMember[]=[
  {uid:'a',name:'Giáo viên A',team:'Tổ Toán',role:'teacher',status:'active'},
  {uid:'b',name:'Giáo viên B',team:'Tổ Toán',role:'teacher',status:'active'},
  {uid:'c',name:'Giáo viên C',team:'Tổ Văn',role:'teacher',status:'active'},
];
const data=[
  {month:'2026-09',entry:entry('a','Tổ Toán','approved',85)},
  {month:'2026-09',entry:entry('b','Tổ Toán','submitted',null)},
  {month:'2026-09',entry:entry('c','Tổ Văn','draft',null)},
  {month:'2026-10',entry:entry('a','Tổ Toán','approved',95)},
  {month:'2026-10',entry:entry('b','Tổ Toán','reviewed',100)},
  {month:'2026-10',entry:entry('c','Tổ Văn','returned',null)},
];
assert.deepEqual(kpiMonths(2026,'month','2026-10',4),['2026-10']);
assert.deepEqual(kpiMonths(2026,'quarter','2026-10',4),['2026-10','2026-11','2026-12']);
assert.deepEqual(kpiMonths(2026,'quarter','2026-07',3),['2026-07','2026-08','2026-09']);
assert.equal(kpiMonths(2026,'year','2026-10',4).length,12);
assert.equal(kpiOfficialScore(entry('b','Tổ Toán','reviewed',100)),null,'A team-reviewed score is not an official approved score.');
assert.equal(kpiOfficialScore(entry('a','Tổ Toán','approved',85)),85);
assert.equal(kpiOfficialScore(entry('x','Tổ Toán','approved',null)),null);
const summary=summarizeKpiRecords(data);
assert.equal(summary.submitted,5,'Drafts are not submitted.');
assert.equal(summary.approved,2);
assert.equal(summary.pending,2);
assert.equal(summary.returned,1);
assert.equal(summary.drafts,1);
assert.equal(summary.average,90,'Only 85 and 95 are averaged; 100 awaiting school approval is excluded.');
assert.equal(summary.approvedPeople,1,'Repeat months for the same person count as one approved person.');
const teams=kpiTeamSummary(data,members);
assert.equal(teams.length,2);
assert.equal(teams.find(x=>x.team==='Tổ Toán')?.average,90);
assert.equal(teams.find(x=>x.team==='Tổ Văn')?.average,null);
assert.equal(teams.find(x=>x.team==='Tổ Văn')?.people,1);
const people=kpiPersonSummary(data,members);
assert.equal(people.find(x=>x.uid==='a')?.approved,2);
assert.equal(people.find(x=>x.uid==='b')?.average,null);
assert.equal(kpiMonthlyTrend(data,['2026-08','2026-09','2026-10'])[0].average,null,'Months without approved records are missing, not 0.');
assert.equal(summarizeKpiRecords([]).average,null,'Empty scope is not a zero score.');
assert.equal(summarizeKpiRecords([]).approvedRate,null,'An empty denominator is not a 0 percent approval rate.');
console.info('EduKPI monthly, quarterly, yearly, team and individual aggregation: 20+ assertions passed.');
