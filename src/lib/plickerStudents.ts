import { PLICKER_CARD_LIMIT } from './plickerVision';

export interface PlickerStudentRecord {
  id: string;
  classId: string;
  name: string;
  cardId?: number;
}

export function filterPlickerStudentsByClasses<T extends PlickerStudentRecord>(
  students: T[],
  classes: ReadonlyArray<{ id: string }>,
): T[] {
  const classIds = new Set(classes.map(classroom => classroom.id));
  const filtered = students.filter(student => classIds.has(student.classId));
  return filtered.length === students.length ? students : filtered;
}

function isValidCardId(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= PLICKER_CARD_LIMIT;
}

export function assignPlickerCardIds<T extends PlickerStudentRecord>(students: T[]): (T & { cardId?: number })[] {
  const reservedByClass = new Map<string, Set<number>>();

  for (const student of students) {
    if (!isValidCardId(student.cardId)) continue;
    const reserved = reservedByClass.get(student.classId) || new Set<number>();
    reserved.add(student.cardId);
    reservedByClass.set(student.classId, reserved);
  }

  const assignedByClass = new Map<string, Set<number>>();

  return students.map(student => {
    const assigned = assignedByClass.get(student.classId) || new Set<number>();
    const reserved = reservedByClass.get(student.classId) || new Set<number>();
    let cardId = isValidCardId(student.cardId) && !assigned.has(student.cardId)
      ? student.cardId
      : undefined;

    if (cardId === undefined) {
      for (let candidate = 1; candidate <= PLICKER_CARD_LIMIT; candidate += 1) {
        if (!assigned.has(candidate) && !reserved.has(candidate)) {
          cardId = candidate;
          break;
        }
      }
    }

    if (cardId === undefined) return student;
    assigned.add(cardId);
    assignedByClass.set(student.classId, assigned);
    return student.cardId === cardId ? student : { ...student, cardId };
  });
}

export function renamePlickerStudent<T extends PlickerStudentRecord>(
  students: T[],
  studentId: string,
  nextName: string,
): T[] {
  const name = nextName.trim();
  if (!name) throw new RangeError('Họ và tên học sinh không được để trống.');
  return students.map(student => student.id === studentId ? { ...student, name } : student);
}

export function removePlickerStudent<T extends PlickerStudentRecord>(
  students: T[],
  studentId: string,
): T[] {
  return students.filter(student => student.id !== studentId);
}
