export const KPI_KEYS = ['ethics','skills','innovation','quantity','quality','timeliness'] as const;
export type KpiKey = (typeof KPI_KEYS)[number];
export type KpiScores = Record<KpiKey, number>;
export type KpiRole = 'teacher' | 'reviewer';

export interface KpiCriterion {
  key: KpiKey;
  label: string;
  max: number;
  group: 'general' | 'results';
}

export const DEFAULT_KPI_CRITERIA: KpiCriterion[] = [
  { key: 'ethics', label: 'Phẩm chất chính trị, đạo đức, ý thức kỷ luật', max: 10, group: 'general' },
  { key: 'skills', label: 'Năng lực chuyên môn, trách nhiệm và phối hợp', max: 15, group: 'general' },
  { key: 'innovation', label: 'Đổi mới, sáng tạo và chủ động', max: 5, group: 'general' },
  { key: 'quantity', label: 'Số lượng nhiệm vụ hoàn thành', max: 20, group: 'results' },
  { key: 'quality', label: 'Chất lượng thực hiện nhiệm vụ', max: 30, group: 'results' },
  { key: 'timeliness', label: 'Tiến độ thực hiện nhiệm vụ', max: 20, group: 'results' },
];

export interface KpiSchool {
  name: string;
  ownerUid: string;
  criteria: KpiCriterion[];
}

export interface KpiMember {
  uid: string;
  name: string;
  team: string;
  role: KpiRole;
  status: 'active';
}

export interface KpiPeriod {
  month: string;
  status: 'open' | 'closed';
  criteria: KpiCriterion[];
}

export type KpiEntryStatus = 'draft' | 'submitted' | 'returned' | 'reviewed' | 'approved';
export interface KpiEntry {
  uid: string;
  name: string;
  team: string;
  selfScores: KpiScores;
  selfTotal: number;
  status: KpiEntryStatus;
  reviewScores: KpiScores | null;
  reviewTotal: number | null;
  note: string;
  reviewedBy: string;
  approvedBy: string;
}

export function emptyKpiInputs(): Record<KpiKey,string> {
  return { ethics:'',skills:'',innovation:'',quantity:'',quality:'',timeliness:'' };
}

export function validateKpiCriteria(criteria: KpiCriterion[]): string | null {
  if (criteria.length !== 6 || KPI_KEYS.some((key,index) => criteria[index]?.key !== key)) {
    return 'Bộ KPI phải có đúng 6 nhóm tiêu chí theo mẫu đang hỗ trợ.';
  }
  if (criteria.some(item => !item.label.trim() || item.label.length > 200 || !Number.isFinite(item.max) || item.max < 0 || item.max > 100)) {
    return 'Tên tiêu chí và điểm tối đa chưa hợp lệ.';
  }
  const total = criteria.reduce((sum,item)=>sum+item.max,0);
  if (Math.abs(total-100)>0.00001) return 'Tổng điểm tối đa phải bằng 100.';
  return null;
}

export function validateKpiScores(inputs: Record<KpiKey,string>, criteria: KpiCriterion[]): {scores:KpiScores,total:number} | {error:string} {
  const scores = {} as KpiScores;
  for (const item of criteria) {
    const raw=inputs[item.key].trim().replace(',', '.');
    if (!raw) return {error:'Vui lòng nhập điểm cho tất cả các tiêu chí.'};
    const value=Number(raw);
    if (!Number.isFinite(value) || value<0 || value>item.max || Math.round(value*2)!==value*2) {
      return {error:'Điểm "'+item.label+'" phải từ 0 đến '+item.max+' (bước 0,5 điểm).'};
    }
    scores[item.key]=value;
  }
  return {scores,total:calculateKpiTotal(scores)};
}

export function calculateKpiTotal(scores: KpiScores): number {
  return KPI_KEYS.reduce((total,key)=>total+scores[key],0);
}

// These thresholds mirror the supplied Excel example. An official assessment
// additionally requires the school's applicable legal and procedural checks.
export function provisionalKpiRating(total:number):string {
  if (total>=90) return 'Dự kiến: Xuất sắc';
  if (total>=70) return 'Dự kiến: Tốt';
  if (total>=50) return 'Dự kiến: Hoàn thành';
  return 'Dự kiến: Chưa hoàn thành';
}

export function kpiCsvSafe(value:unknown):string {
  const text=String(value??'');
  return /^[=+\-@\t\r]/.test(text)?"'"+text:text;
}
