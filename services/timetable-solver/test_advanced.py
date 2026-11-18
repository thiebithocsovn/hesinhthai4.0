from copy import deepcopy
import pytest
from app import SolveRequest, solve
from advanced import verify_advanced


def base():
    return {'name': 'Advanced school', 'daysPerWeek': 5, 'periodsPerDay': 4, 'morningPeriods': 2,
            'teachers': [{'id': 't1', 'name': 'A', 'level': 'THCS'}, {'id': 't2', 'name': 'B', 'level': 'THCS'}],
            'classes': [{'id': 'c1', 'name': '6A', 'level': 'THCS', 'studentCount': 30}, {'id': 'c2', 'name': '6B', 'level': 'THCS', 'studentCount': 25}],
            'subjects': [{'id': 's', 'name': 'Toán'}], 'rooms': [{'id': 'r1', 'name': 'P1', 'capacity': 70}, {'id': 'r2', 'name': 'P2', 'capacity': 20}],
            'assignments': [{'id': 'a', 'classId': 'c1', 'teacherId': 't1', 'subjectId': 's', 'periodsPerWeek': 2, 'blockSize': 1, 'maxPerDay': 1},
                            {'id': 'b', 'classId': 'c2', 'teacherId': 't2', 'subjectId': 's', 'periodsPerWeek': 2, 'blockSize': 1, 'maxPerDay': 1}]}


def checked(s):
    result = solve(SolveRequest(scenario=s, timeLimitSeconds=3))
    assert result['status'] in ('FEASIBLE', 'OPTIMAL'), result
    assert result['verification']['valid']
    assert verify_advanced(s, result['solution']['entries']) == []
    return result['solution']['entries']


def test_merged_classes_and_coteachers():
    s = base()
    s['assignments'] = [dict(s['assignments'][0], additionalClassIds=['c2'], additionalTeacherIds=['t2'], roomId='r1')]
    entries = checked(s)
    assert len(entries) == 2 and all(e['additionalClassIds'] == ['c2'] and e['additionalTeacherIds'] == ['t2'] for e in entries)
    forged = deepcopy(entries); forged[0]['additionalTeacherIds'] = []
    assert verify_advanced(s, forged)
    s['rooms'][0]['capacity'] = 40
    assert solve(SolveRequest(scenario=s))['status'] == 'INFEASIBLE'


def test_parallel_groups_and_room_reservations():
    s = base()
    s['studentGroups'] = [{'id': 'g1', 'classId': 'c1', 'name': 'N1', 'studentCount': 15}, {'id': 'g2', 'classId': 'c1', 'name': 'N2', 'studentCount': 15}]
    s['assignments'][0].update(studentGroupId='g1', roomId='r1')
    s['assignments'][1].update(classId='c1', studentGroupId='g2', roomId='r2')
    s['lessonGroups'] = [{'id': 'parallel', 'name': 'Song song', 'kind': 'parallel', 'assignmentIds': ['a', 'b']}]
    entries = checked(s)
    assert len(set((e['dayIndex'], e['period']) for e in entries)) == 2
    s['assignments'][1]['roomId'] = 'r1'
    assert solve(SolveRequest(scenario=s))['status'] == 'INFEASIBLE'


def test_subject_concurrency_and_same_session():
    s = base()
    s['subjects'][0]['maxConcurrentClasses'] = 1
    s['lessonGroups'] = [{'id': 'same', 'name': 'Cùng buổi', 'kind': 'same-session', 'assignmentIds': ['a', 'b']}]
    entries = checked(s)
    assert len(set((e['dayIndex'], e['period']) for e in entries)) == len(entries)
    for index in range(2):
        assert len(set((e['dayIndex'], e['period'] <= 2) for e in entries if e['meetingIndex'] == index)) == 1


def test_travel_and_teaching_days():
    s = base()
    s['campuses'] = [{'id': 'one', 'name': 'CS1'}, {'id': 'two', 'name': 'CS2'}]
    s['campusTravelPeriods'] = 1
    for i, a in enumerate(s['assignments']):
        a.update(teacherId='t1', periodsPerWeek=1, campusId=['one', 'two'][i], fixedStartSlots=[f'0:{i + 1}'])
    assert solve(SolveRequest(scenario=s))['status'] == 'INFEASIBLE'
    s['assignments'][1]['fixedStartSlots'] = ['0:3']
    checked(s)
    s['teachers'][0]['maxTeachingDays'] = 1
    s['assignments'][1]['fixedStartSlots'] = ['1:3']
    assert solve(SolveRequest(scenario=s))['status'] == 'INFEASIBLE'


def test_cross_class_subgroups_and_lock_identity():
    s = base()
    s['studentGroups'] = [{'id': 'a1', 'classId': 'c1', 'name': 'A1', 'studentCount': 15}, {'id': 'a2', 'classId': 'c1', 'name': 'A2', 'studentCount': 15},
                          {'id': 'b1', 'classId': 'c2', 'name': 'B1', 'studentCount': 10}, {'id': 'b2', 'classId': 'c2', 'name': 'B2', 'studentCount': 15}]
    s['assignments'] = [dict(s['assignments'][0], studentGroupId='a1', additionalStudentGroupIds=['b1'], additionalClassIds=['c2'], roomId='r1')]
    entries = checked(s)
    forged = deepcopy(entries); forged[0]['additionalStudentGroupIds'] = []
    assert verify_advanced(s, forged)
    with pytest.raises(ValueError, match='khóa không khớp'):
        solve(SolveRequest(scenario=s, lockedEntries=[forged[0]]))
    s['assignments'][0]['roomId'] = 'r2'
    assert solve(SolveRequest(scenario=s))['status'] == 'INFEASIBLE'


def test_audit_rejects_fragmented_odd_blocks():
    s = base(); s['assignments'] = [dict(s['assignments'][0], periodsPerWeek=3, blockSize=2, maxPerDay=2)]
    entries = checked(s)
    forged = deepcopy(entries)
    for i, e in enumerate(forged):
        e['blockId'] = f'fragment-{i}'
    assert verify_advanced(s, forged)
