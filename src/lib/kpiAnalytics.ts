import type { KpiEntry, KpiEntryStatus, KpiMember } from './kpi';

export type KpiPeriodScope = 'month' | 'quarter' | 'year';
export type KpiRecord = { month: string; entry: KpiEntry };
export type KpiSummary = {
  submitted: number;
  approved: number;
  pending: number;
  returned: number;
  drafts: number;
  average: number | null;
  approvedRate: number | null;
  approvedPeople: number;
};

export function kpiMonths(year: number, scope: KpiPeriodScope, month: string, quarter: number): string[] {
  if (scope === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? [month] : [];
  const start = scope === 'quarter' ? (Math.max(1, Math.min(4, Math.floor(quarter))) - 1) * 3 + 1 : 1;
  const end = scope === 'quarter' ? start + 2 : 12;
  return Array.from({ length: end - start + 1 }, (_, i) =>
    String(year) + '-' + String(start + i).padStart(2, '0'));
}

export function kpiOfficialScore(entry: KpiEntry): number | null {
  if (entry.status !== 'approved' || typeof entry.reviewTotal !== 'number' ||
      !Number.isFinite(entry.reviewTotal) || entry.reviewTotal < 0 || entry.reviewTotal > 100) return null;
  return entry.reviewTotal;
}

export function summarizeKpiRecords(records: KpiRecord[]): KpiSummary {
  const submitted = records.filter(({entry}) => entry.status !== 'draft');
  const approved = records.map(({entry}) => ({uid:entry.uid,score:kpiOfficialScore(entry)}))
    .filter((item): item is {uid:string;score:number}=>item.score!==null);
  const average = approved.length === 0 ? null :
    Math.round(approved.reduce((sum,item)=>sum+item.score,0)*100/approved.length)/100;
  return {
    submitted:submitted.length,
    approved:approved.length,
    pending:records.filter(({entry}) => entry.status==='submitted' || entry.status==='reviewed').length,
    returned:records.filter(({entry}) => entry.status==='returned').length,
    drafts:records.filter(({entry}) => entry.status==='draft').length,
    average,
    approvedRate:submitted.length===0?null:Math.round(approved.length/submitted.length*100),
    approvedPeople:new Set(approved.map(item=>item.uid)).size,
  };
}

export function kpiMonthlyTrend(records: KpiRecord[], months: string[]) {
  return months.map(month => {
    const summary=summarizeKpiRecords(records.filter(item=>item.month===month));
    return {month, ...summary};
  });
}

export function kpiTeamSummary(records: KpiRecord[], members: KpiMember[]) {
  const teams=new Set([...members.map(x=>x.team||'Chưa phân tổ'),...records.map(x=>x.entry.team||'Chưa phân tổ')]);
  return [...teams].sort((a,b)=>a.localeCompare(b,'vi')).map(team => {
    const teamRecords=records.filter(item=>(item.entry.team||'Chưa phân tổ')===team);
    const people=members.filter(item=>(item.team||'Chưa phân tổ')===team).length;
    return {team,people,...summarizeKpiRecords(teamRecords)};
  });
}

export function kpiPersonSummary(records: KpiRecord[], members: KpiMember[]) {
  const indexed=new Map<string,{uid:string;name:string;team:string;role:string}>();
  for(const item of members) indexed.set(item.uid,{uid:item.uid,name:item.name,team:item.team,role:item.role});
  for(const item of records) {
    if(!indexed.has(item.entry.uid)) indexed.set(item.entry.uid,{
      uid:item.entry.uid,name:item.entry.name,team:item.entry.team,role:'teacher',
    });
  }
  return [...indexed.values()].map(person=>{
    const own=records.filter(r=>r.entry.uid===person.uid);
    return {...person,...summarizeKpiRecords(own)};
  }).sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}

export const KpiStatusLabel: Record<KpiEntryStatus,string> = {
  draft:'Bản nháp',submitted:'Chờ tổ duyệt',returned:'Cần bổ sung',
  reviewed:'Chờ trường phê duyệt',approved:'Đã phê duyệt',
};

export function kpiPeriodLabel(scope:KpiPeriodScope,year:number,month:string,quarter:number):string {
  if(scope==='month') return 'Tháng '+Number(month.slice(-2))+'/'+month.slice(0,4);
  if(scope==='quarter') return 'Quý '+quarter+'/'+year;
  return 'Năm '+year;
}
