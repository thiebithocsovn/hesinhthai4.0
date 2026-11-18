import React from 'react';
import { createRoot } from 'react-dom/client';
import SmartTimetable from '../../src/components/SmartTimetable';
import { normalizeTimetableScenario } from '../../src/lib/smartTimetable';
import '../../src/index.css';

const scenario = normalizeTimetableScenario({ name: 'Trường KIỂM THỬ AITHEROVA', daysPerWeek: 5, periodsPerDay: 7, morningPeriods: 5,
  teachers: [{ id: 't1', name: 'Thầy Toán', level: 'THCS' }, { id: 't2', name: 'Cô Anh', level: 'THCS' }],
  classes: [{ id: '6a', name: '6A', level: 'THCS', studentCount: 30 }, { id: '6b', name: '6B', level: 'THCS', studentCount: 30 }],
  subjects: [{ id: 'math', name: 'Toán' }, { id: 'eng', name: 'Tiếng Anh' }], rooms: [{ id: 'r1', name: 'Phòng lớn', capacity: 80 }, { id: 'r2', name: 'Phòng nhóm', capacity: 20 }],
  assignments: [{ id: 'a', classId: '6a', teacherId: 't1', subjectId: 'math', roomId: 'r1', periodsPerWeek: 2, maxPerDay: 1 }, { id: 'b', classId: '6b', teacherId: 't1', subjectId: 'math', roomId: 'r1', periodsPerWeek: 2, maxPerDay: 1 }, { id: 'c', classId: '6a', teacherId: 't2', subjectId: 'eng', roomId: 'r1', periodsPerWeek: 2, maxPerDay: 1 }, { id: 'd', classId: '6b', teacherId: 't2', subjectId: 'eng', roomId: 'r1', periodsPerWeek: 2, maxPerDay: 1 }],
});
const storageKey = 'qa-aitherova-timetable-complete';
localStorage.setItem(storageKey, JSON.stringify({ scenario, solution: null, versions: [] }));
createRoot(document.getElementById('root')!).render(<SmartTimetable storageKey={storageKey} onBack={() => undefined} />);
