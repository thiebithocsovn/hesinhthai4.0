"""Multi-resource CP-SAT model plus a separate output verifier for AITHEROVA."""
from collections import defaultdict
from datetime import datetime, timezone
from itertools import combinations
from ortools.sat.python import cp_model


def class_ids(a):
    return list(dict.fromkeys([a['classId']] + (a.get('additionalClassIds') or [])))


def teacher_ids(a):
    return list(dict.fromkeys([a['teacherId']] + (a.get('additionalTeacherIds') or [])))


def student_group_ids(a):
    return list(dict.fromkeys(([a['studentGroupId']] if a.get('studentGroupId') else []) + (a.get('additionalStudentGroupIds') or [])))


def valid_group_owners(s, a):
    selected = student_group_ids(a)
    groups = {g['id']: g for g in s.get('studentGroups', [])}
    return not selected or all(gid in groups for gid in selected) and {groups[gid]['classId'] for gid in selected} == set(class_ids(a))


def class_atoms(s, a):
    selected = student_group_ids(a)
    if selected:
        groups = {g['id']: g for g in s.get('studentGroups', [])}
        return [(groups.get(gid) or {}).get('classId', a['classId']) + '#' + gid for gid in selected]
    atoms = []
    for cid in class_ids(a):
        groups = [g for g in s.get('studentGroups', []) if g['classId'] == cid]
        atoms.extend([cid + '#' + g['id'] for g in groups] or [cid])
    return atoms


def campus(s, a):
    room = next((r for r in s['rooms'] if r['id'] == a.get('roomId')), {})
    classroom = next((c for c in s['classes'] if c['id'] == a['classId']), {})
    return a.get('campusId') or room.get('campusId') or classroom.get('campusId') or ''


def participants(s, a):
    if student_group_ids(a):
        return sum(g.get('studentCount') or 0 for g in s.get('studentGroups', []) if g['id'] in student_group_ids(a))
    return sum(c.get('studentCount') or 0 for c in s['classes'] if c['id'] in class_ids(a))


def dimensions(s, a):
    return [('class', x) for x in class_atoms(s, a)] + [('teacher', x) for x in teacher_ids(a)] + ([('room', a['roomId'])] if a.get('roomId') else [])


def verify_advanced(s, entries):
    """Recounts resources and constraints from output records without consulting the CP model."""
    errors, occupied, ids = [], set(), set()
    days, periods, morning = (6 if s.get('daysPerWeek') == 6 else 5), int(s['periodsPerDay']), int(s.get('morningPeriods') or min(5, int(s['periodsPerDay'])))
    assignments = {a['id']: a for a in s['assignments']}
    teachers = {t['id']: t for t in s['teachers']}
    classes, rooms = {c['id']: c for c in s['classes']}, {r['id']: r for r in s['rooms']}
    by_assignment, daily, locations, subject_classes = defaultdict(list), defaultdict(set), defaultdict(list), defaultdict(set)
    for e in entries:
        if e['id'] in ids:
            errors.append('Mã tiết trùng.')
        ids.add(e['id'])
        a = assignments.get(e['assignmentId'])
        if not a:
            errors.append('Phân công không tồn tại.'); continue
        if any(e.get(k) != a.get(k) for k in ['classId', 'teacherId', 'subjectId', 'roomId', 'studentGroupId']) or set(class_ids(e)) != set(class_ids(a)) or set(teacher_ids(e)) != set(teacher_ids(a)) or set(student_group_ids(e)) != set(student_group_ids(a)) or e.get('campusId', '') != campus(s, a):
            errors.append('Tiết không khớp tài nguyên phân công.')
        d, p = e['dayIndex'], e['period']
        if not isinstance(d, int) or not isinstance(p, int) or not 0 <= d < days or not 1 <= p <= periods:
            errors.append('Tiết ngoài khung.'); continue
        if not valid_group_owners(s, a):
            errors.append('Nhóm học không thuộc đúng các lớp tham gia.')
        slot = f'{d}:{p}'
        objects = [teachers.get(x) for x in teacher_ids(a)] + [classes.get(x) for x in class_ids(a)] + ([rooms.get(a['roomId'])] if a.get('roomId') else [])
        if any(x is None for x in objects):
            errors.append('Thiếu tài nguyên.')
        if any(slot in (x.get('unavailableSlots') or []) for x in objects if x):
            errors.append('Xếp vào giờ bận.')
        for kind, rid in dimensions(s, a):
            point = (kind, rid, d, p)
            if point in occupied:
                errors.append('Trùng tài nguyên ' + rid)
            occupied.add(point)
            if kind != 'room':
                for other_p, other_campus in locations[kind, rid, d]:
                    if campus(s, a) and other_campus and campus(s, a) != other_campus and abs(other_p - p) - 1 < int(s.get('campusTravelPeriods', 1)):
                        errors.append('Thiếu thời gian chuyển cơ sở.')
                locations[kind, rid, d].append((p, campus(s, a)))
        if slot in (a.get('forbiddenSlots') or []):
            errors.append('Xếp vào tiết cấm.')
        if a.get('session') == 'morning' and p > morning or a.get('session') == 'afternoon' and p <= morning:
            errors.append('Sai buổi học.')
        room = rooms.get(a.get('roomId'), {})
        if room.get('capacity') and participants(s, a) > room['capacity']:
            errors.append('Vượt sức chứa phòng.')
        for kind, values in [('teacher', teacher_ids(a)), ('class', class_ids(a)), ('assignment', [a['id']])]:
            for rid in values:
                daily[kind, rid, d].add(p)
        subject_classes[a['subjectId'], d, p].update(class_ids(a))
        by_assignment[a['id']].append(e)
    for a in s['assignments']:
        placed = by_assignment[a['id']]
        if len(placed) != a['periodsPerWeek']:
            errors.append('Thiếu/thừa tiết: ' + a['id'])
        groups = defaultdict(list)
        for e in placed:
            if not e.get('blockId') and a.get('blockSize', 1) > 1:
                errors.append('Thiếu mã block.')
            groups[e.get('blockId') or e['id']].append(e)
        block = int(a.get('blockSize') or 1)
        expected_sizes = [min(block, a['periodsPerWeek'] - offset) for offset in range(0, a['periodsPerWeek'], block)]
        if sorted(map(len, groups.values())) != sorted(expected_sizes):
            errors.append('Số lượng hoặc độ dài block không khớp.')
        for group in groups.values():
            ordered = sorted(group, key=lambda x: x['period'])
            block = int(a.get('blockSize') or 1)
            if len(ordered) > block or len(ordered) < block and a['periodsPerWeek'] % block == 0:
                errors.append('Độ dài block không đúng.')
            if any(e['dayIndex'] != ordered[0]['dayIndex'] or e['period'] != ordered[0]['period'] + i for i, e in enumerate(ordered)):
                errors.append('Block không liên tiếp.')
            if ordered[0]['period'] <= morning < ordered[-1]['period']:
                errors.append('Block vượt ranh giới buổi.')
        for raw in a.get('fixedStartSlots') or []:
            d, p = map(int, raw.split(':'))
            if any(not any(e['dayIndex'] == d and e['period'] == p + offset for e in placed) for offset in range(int(a.get('blockSize') or 1))):
                errors.append('Thiếu tiết cố định.')
        for d in range(days):
            if len(daily['assignment', a['id'], d]) > int(a.get('maxPerDay') or a.get('blockSize') or 1):
                errors.append('Phân công vượt tối đa/ngày.')
    for t in s['teachers']:
        if t.get('maxTeachingDays') and sum(bool(daily['teacher', t['id'], d]) for d in range(days)) > t['maxTeachingDays']:
            errors.append('Giáo viên vượt số ngày dạy.')
        for d in range(days):
            values = sorted(daily['teacher', t['id'], d])
            if t.get('maxPeriodsPerDay') and len(values) > t['maxPeriodsPerDay']:
                errors.append('Giáo viên vượt tối đa/ngày.')
            streak, previous = 0, -10
            for p in values:
                streak = streak + 1 if p == previous + 1 else 1
                if t.get('maxConsecutivePeriods') and streak > t['maxConsecutivePeriods']:
                    errors.append('Giáo viên vượt tiết liên tục.')
                previous = p
    for c in s['classes']:
        for d in range(days):
            if c.get('maxPeriodsPerDay') and len(daily['class', c['id'], d]) > c['maxPeriodsPerDay']:
                errors.append('Lớp vượt tối đa/ngày.')
    for subject in s['subjects']:
        if subject.get('maxConcurrentClasses') and any(len(values) > subject['maxConcurrentClasses'] for (sid, _, _), values in subject_classes.items() if sid == subject['id']):
            errors.append('Vượt số lớp đồng thời của môn.')
    for group in s.get('lessonGroups', []):
        meetings = [by_assignment[aid] for aid in group['assignmentIds']]
        expected = max((e.get('meetingIndex', -1) for entries in meetings for e in entries), default=-1) + 1
        for index in range(expected):
            signatures = []
            for rows in meetings:
                records = [e for e in rows if e.get('meetingIndex') == index]
                if not records:
                    errors.append('Nhóm thiếu buổi tương ứng.'); continue
                signatures.append(tuple(sorted((e['dayIndex'], e['period']) for e in records)) if group['kind'] == 'parallel' else tuple(sorted(set((e['dayIndex'], e['period'] <= morning) for e in records))))
            if len(set(signatures)) > 1 or group['kind'] == 'same-session' and any(len(x) != 1 for x in signatures):
                errors.append('Nhóm không đồng bộ lịch.')
    return sorted(set(errors))


def solve_advanced(s, locked, time_limit):
    days, periods = (6 if s.get('daysPerWeek') == 6 else 5), int(s['periodsPerDay'])
    morning = int(s.get('morningPeriods') or min(5, periods))
    teachers, classes, subjects, rooms = ({x['id']: x for x in s[name]} for name in ['teachers', 'classes', 'subjects', 'rooms'])
    assignments = {a['id']: a for a in s['assignments']}
    for name in ['teachers', 'classes', 'subjects', 'rooms', 'campuses', 'studentGroups', 'lessonGroups']:
        values = s.get(name, [])
        if any(not x.get('id') for x in values) or len({x['id'] for x in values}) != len(values):
            raise ValueError('Mã tài nguyên trống hoặc trùng: ' + name)
    campus_ids = {x['id'] for x in s.get('campuses', [])}
    for x in s['classes'] + s['rooms'] + s['assignments']:
        if x.get('campusId') and x['campusId'] not in campus_ids:
            raise ValueError('Cơ sở không tồn tại.')
    for collection, field in [('teachers', 'maxTeachingDays'), ('classes', 'studentCount'), ('rooms', 'capacity'), ('studentGroups', 'studentCount'), ('subjects', 'maxConcurrentClasses')]:
        for x in s.get(collection, []):
            if x.get(field) is not None and (not isinstance(x[field], int) or x[field] < 1):
                raise ValueError('Giới hạn phải là số nguyên dương: ' + field)
    for c in s['classes']:
        groups = [g for g in s.get('studentGroups', []) if g['classId'] == c['id']]
        if len(groups) == 1 or groups and c.get('studentCount') and all(g.get('studentCount') for g in groups) and sum(g['studentCount'] for g in groups) != c['studentCount']:
            raise ValueError('Nhóm học hoặc sĩ số nhóm không khớp lớp.')
    if any(g['classId'] not in classes for g in s.get('studentGroups', [])):
        raise ValueError('Nhóm học thiếu lớp.')
    if not isinstance(s.get('campusTravelPeriods', 1), int) or s.get('campusTravelPeriods', 1) < 0:
        raise ValueError('Thời gian chuyển cơ sở không hợp lệ.')
    if len(assignments) != len(s['assignments']):
        raise ValueError('Mã phân công trùng.')
    units = []
    for a in s['assignments']:
        if any(cid not in classes for cid in class_ids(a)) or any(tid not in teachers for tid in teacher_ids(a)) or a['subjectId'] not in subjects or a.get('roomId') and a['roomId'] not in rooms:
            raise ValueError('Phân công thiếu tài nguyên.')
        if not valid_group_owners(s, a):
            raise ValueError('Nhóm học không hợp lệ.')
        room = rooms.get(a.get('roomId'), {})
        if room.get('campusId') and a.get('campusId') and room['campusId'] != a['campusId']:
            raise ValueError('Phòng và phân công khác cơ sở.')
        block = int(a.get('blockSize') or 1)
        if block not in [1, 2, 3] or int(a['periodsPerWeek']) < 1:
            raise ValueError('Số tiết hoặc block không hợp lệ.')
        remaining, index = int(a['periodsPerWeek']), 0
        while remaining:
            size = min(block, remaining)
            fixed = tuple(map(int, a['fixedStartSlots'][index].split(':'))) if len(a.get('fixedStartSlots') or []) > index else None
            units.append({'a': a, 'index': index, 'size': size, 'fixed': fixed, 'locked': None})
            index += 1; remaining -= size
        if len(a.get('fixedStartSlots') or []) * block > a['periodsPerWeek']:
            raise ValueError('Số tiết cố định vượt số tiết/tuần.')
    grouped_locked = defaultdict(list)
    for e in locked:
        grouped_locked[e['assignmentId'], e.get('blockId') or e['id']].append(e)
    for (aid, _), entries in grouped_locked.items():
        ordered = sorted(entries, key=lambda x: x['period'])
        first = ordered[0]
        assignment = assignments.get(aid)
        if not assignment or any(any(e.get(k) != assignment.get(k) for k in ['classId', 'teacherId', 'subjectId', 'roomId']) or set(class_ids(e)) != set(class_ids(assignment)) or set(teacher_ids(e)) != set(teacher_ids(assignment)) or set(student_group_ids(e)) != set(student_group_ids(assignment)) or e.get('campusId', '') != campus(s, assignment) for e in ordered):
            raise ValueError('Tiết khóa không khớp phân công.')
        matching = next((u for u in units if u['a']['id'] == aid and u['locked'] is None and u['size'] == len(entries) and (first.get('meetingIndex') is None or first['meetingIndex'] == u['index']) and (u['fixed'] is None or u['fixed'] == (first['dayIndex'], first['period']))), None)
        if matching is None or any(e['dayIndex'] != first['dayIndex'] or e['period'] != first['period'] + i for i, e in enumerate(ordered)):
            raise ValueError('Block khóa không hợp lệ.')
        matching['fixed'], matching['locked'] = (first['dayIndex'], first['period']), ordered
    if len(units) > 1500:
        raise ValueError('Bài toán vượt quy mô một lượt CP-SAT; dùng bộ xếp trên thiết bị hoặc chia kịch bản.')
    model, choices, occupancy, class_clock, subject_clock, teacher_clock, daily_asg = cp_model.CpModel(), [], defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    positions, sessions, travel = {}, {}, defaultdict(list)
    for ui, u in enumerate(units):
        a, size = u['a'], u['size']
        pvar = model.NewIntVar(0, days * periods, f'position-{ui}'); svar = model.NewIntVar(0, days * 2, f'session-{ui}')
        positions[a['id'], u['index']], sessions[a['id'], u['index']] = pvar, svar
        vars_for_unit = []
        objects = [teachers[x] for x in teacher_ids(a)] + [classes[x] for x in class_ids(a)] + ([rooms[a['roomId']]] if a.get('roomId') else [])
        for day in range(days):
            for start in range(1, periods - size + 2):
                end = start + size - 1
                if u['fixed'] is not None and u['fixed'] != (day, start) or start <= morning < end or a.get('session') == 'morning' and end > morning or a.get('session') == 'afternoon' and start <= morning:
                    continue
                slots = [f'{day}:{p}' for p in range(start, end + 1)]
                if any(any(slot in (obj.get('unavailableSlots') or []) for slot in slots) for obj in objects) or any(slot in (a.get('forbiddenSlots') or []) for slot in slots):
                    continue
                room = rooms.get(a.get('roomId'), {})
                if room.get('capacity') and participants(s, a) > room['capacity']:
                    continue
                x = model.NewBoolVar(f'u{ui}-d{day}-p{start}'); vars_for_unit.append(x); choices.append((ui, u, day, start, x))
                model.Add(pvar == day * periods + start).OnlyEnforceIf(x); model.Add(svar == day * 2 + (start > morning)).OnlyEnforceIf(x)
                for kind, rid in dimensions(s, a):
                    for p in range(start, end + 1): occupancy[kind, rid, day, p].append(x)
                    if kind != 'room': travel[kind, rid, day].append((ui, start, size, campus(s, a), x))
                for p in range(start, end + 1):
                    for cid in class_ids(a): class_clock[cid, day, p].append(x); subject_clock[a['subjectId'], cid, day, p].append(x)
                    for tid in teacher_ids(a): teacher_clock[tid, day, p].append(x)
                daily_asg[a['id'], day].extend([x] * size)
        if not vars_for_unit:
            return {'status': 'INFEASIBLE', 'solution': None, 'explanations': ['Không còn vị trí cho ' + a['id']]}
        model.AddExactlyOne(vars_for_unit)
    for values in occupancy.values(): model.Add(sum(values) <= 1)
    def occupied_bool(values, name):
        out = model.NewBoolVar(name); model.AddMaxEquality(out, values); return out
    for cid, c in classes.items():
        for d in range(days):
            values = [occupied_bool(class_clock[cid, d, p], f'class-{cid}-{d}-{p}') for p in range(1, periods + 1) if class_clock[cid, d, p]]
            model.Add(sum(values) <= int(c.get('maxPeriodsPerDay') or periods))
    for tid, t in teachers.items():
        teaching_days = []
        for d in range(days):
            clock = {p: occupied_bool(teacher_clock[tid, d, p], f'teacher-{tid}-{d}-{p}') for p in range(1, periods + 1) if teacher_clock[tid, d, p]}
            model.Add(sum(clock.values()) <= int(t.get('maxPeriodsPerDay') or periods))
            if clock: teaching_days.append(occupied_bool(list(clock.values()), f'day-{tid}-{d}'))
            maximum = int(t.get('maxConsecutivePeriods') or periods)
            for start in range(1, periods - maximum + 1): model.Add(sum(clock.get(p, 0) for p in range(start, start + maximum + 1)) <= maximum)
        if t.get('maxTeachingDays'): model.Add(sum(teaching_days) <= int(t['maxTeachingDays']))
    for (aid, _), values in daily_asg.items(): model.Add(sum(values) <= int(assignments[aid].get('maxPerDay') or assignments[aid].get('blockSize') or 1))
    for subject in subjects.values():
        if not subject.get('maxConcurrentClasses'): continue
        for d in range(days):
            for p in range(1, periods + 1):
                values = [occupied_bool(subject_clock[subject['id'], cid, d, p], f'subj-{subject["id"]}-{cid}-{d}-{p}') for cid in classes if subject_clock[subject['id'], cid, d, p]]
                model.Add(sum(values) <= int(subject['maxConcurrentClasses']))
    for group in s.get('lessonGroups', []):
        members = [a for a in group['assignmentIds'] if a in assignments]
        counts = [sum(u['a']['id'] == aid for u in units) for aid in members]
        if len(members) < 2 or len(members) != len(group['assignmentIds']) or len(set(counts)) != 1:
            raise ValueError('Nhóm cần phân công có cùng số buổi.')
        for index in range(counts[0]):
            variables = positions if group['kind'] == 'parallel' else sessions
            for aid in members[1:]: model.Add(variables[members[0], index] == variables[aid, index])
            if group['kind'] == 'parallel' and len({(assignments[aid]['periodsPerWeek'], assignments[aid].get('blockSize') or 1) for aid in members}) != 1:
                raise ValueError('Nhóm song song phải có cùng độ dài block.')
    for values in travel.values():
        for a, b in combinations(values, 2):
            if a[0] == b[0] or not a[3] or not b[3] or a[3] == b[3]: continue
            gap = max(a[1] - (b[1] + b[2]), b[1] - (a[1] + a[2]))
            if gap < int(s.get('campusTravelPeriods', 1)): model.Add(a[4] + b[4] <= 1)
    costs = []
    for _, u, _, start, x in choices:
        a = u['a']; cost = start // 3
        if subjects[a['subjectId']].get('preferMorning') and start > morning: cost += 24
        if (subjects[a['subjectId']].get('avoidLastPeriod') or a.get('avoidLastPeriod')) and start + u['size'] - 1 == periods: cost += 16
        costs.append(cost * x)
    model.Minimize(sum(costs))
    solver = cp_model.CpSolver(); solver.parameters.max_time_in_seconds = time_limit; solver.parameters.num_search_workers = 4
    status_code = solver.Solve(model); status = solver.StatusName(status_code)
    stats = {'wallTimeSeconds': solver.WallTime(), 'branches': solver.NumBranches(), 'conflicts': solver.NumConflicts()}
    if status_code not in [cp_model.OPTIMAL, cp_model.FEASIBLE]: return {'status': status, 'solution': None, 'statistics': stats, 'explanations': ['Không có nghiệm trong giới hạn hiện tại.']}
    entries = []
    parallel = {aid: g['id'] for g in s.get('lessonGroups', []) if g['kind'] == 'parallel' for aid in g['assignmentIds']}
    for _, u, d, start, x in choices:
        if not solver.BooleanValue(x): continue
        a = u['a']; block_id = (u['locked'][0].get('blockId') if u['locked'] else None) or f'cp-{a["id"]}-{u["index"]}'
        for offset in range(u['size']):
            entries.append({'id': u['locked'][offset]['id'] if u['locked'] else block_id + '-' + str(offset + 1), 'assignmentId': a['id'], 'classId': a['classId'], 'teacherId': a['teacherId'], 'subjectId': a['subjectId'], 'roomId': a.get('roomId'), 'additionalClassIds': a.get('additionalClassIds') or [], 'additionalTeacherIds': a.get('additionalTeacherIds') or [], 'studentGroupId': a.get('studentGroupId'), 'additionalStudentGroupIds': a.get('additionalStudentGroupIds') or [], 'campusId': campus(s, a), 'meetingIndex': u['index'], 'parallelEventId': f'{parallel[a["id"]]}:{u["index"]}' if a['id'] in parallel else None, 'dayIndex': d, 'period': start + offset, 'blockId': block_id, 'fixed': len(a.get('fixedStartSlots') or []) > u['index'], 'locked': bool(u['locked']) or len(a.get('fixedStartSlots') or []) > u['index']})
    errors = verify_advanced(s, entries)
    if errors: raise RuntimeError('Independent advanced audit rejected output: ' + '; '.join(errors))
    def gaps(kind):
        groups = defaultdict(set)
        for e in entries:
            for rid in teacher_ids(e) if kind == 'teacher' else class_ids(e): groups[rid, e['dayIndex']].add(e['period'])
        return sum(max(p) - min(p) + 1 - len(p) for p in groups.values())
    quality = {'teacherGaps': gaps('teacher'), 'classGaps': gaps('class'), 'lateCorePeriods': sum(bool(subjects[e['subjectId']].get('preferMorning')) and e['period'] > morning for e in entries), 'dailyImbalance': 0}
    stats.update({'bestObjectiveBound': solver.BestObjectiveBound(), 'objectiveValue': solver.ObjectiveValue()})
    return {'status': status, 'statistics': stats, 'verification': {'valid': True, 'complete': True, 'checkedPeriods': len(entries)}, 'solution': {'entries': entries, 'score': int(round(solver.ObjectiveValue())), 'generatedAt': datetime.now(timezone.utc).isoformat(), 'diagnostics': {'hardConflicts': [], 'warnings': [], 'unscheduled': [], 'teacherGaps': quality['teacherGaps'], 'quality': quality, 'preflight': []}}}
