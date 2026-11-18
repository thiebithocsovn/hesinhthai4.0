"""AITHEROVA timetable CP-SAT service.

The current GitHub Pages application remains local-first. This optional server
performs *exact* constraint solving when deployed separately with authentication.
No LLM or external AI key is needed.
"""
from __future__ import annotations

import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from ortools.sat.python import cp_model
from pydantic import BaseModel, Field

app = FastAPI(title="AITHEROVA Timetable CP-SAT", version="0.1.0", docs_url=None, redoc_url=None)


class SolveRequest(BaseModel):
    scenario: dict[str, Any]
    lockedEntries: list[dict[str, Any]] = Field(default_factory=list)
    timeLimitSeconds: float = Field(default=12.0, ge=1.0, le=120.0)


def authorize(x_solver_key: str | None = Header(default=None)) -> None:
    configured_key = os.getenv("TIMETABLE_SOLVER_API_KEY")
    if configured_key and x_solver_key != configured_key:
        raise HTTPException(status_code=401, detail="Invalid solver key")
    if not configured_key and os.getenv("TIMETABLE_ENV", "development") == "production":
        raise HTTPException(status_code=503, detail="Solver API authentication is not configured")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "solver": "ortools-cp-sat"}


def slot_key(day: int, period: int) -> str:
    return str(day) + ":" + str(period)


def parse_slot(raw: str) -> tuple[int, int]:
    if not re.fullmatch(r"\d+:\d+", str(raw)):
        raise ValueError("Ô tiết không hợp lệ: " + str(raw))
    day, period = str(raw).split(":")
    return int(day), int(period)


def session_units(scenario: dict[str, Any], locked_entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    assignment_by_id = {a["id"]: a for a in scenario["assignments"]}
    locked_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for entry in locked_entries:
        assignment = assignment_by_id.get(entry.get("assignmentId"))
        if not assignment:
            raise ValueError("Tiết khóa thiếu phân công: " + str(entry.get("assignmentId")))
        if any(entry.get(field) != assignment.get(key) for field, key in
               (("classId", "classId"), ("teacherId", "teacherId"), ("subjectId", "subjectId"))):
            raise ValueError("Tiết khóa không đúng phân công.")
        group = str(entry.get("blockId") or entry.get("id"))
        locked_groups[group].append(entry)

    by_assignment: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for group, members in locked_groups.items():
        first = members[0]
        if any(e.get("assignmentId") != first.get("assignmentId") or e.get("dayIndex") != first.get("dayIndex") for e in members):
            raise ValueError("Block khóa chứa nhiều phân công hoặc nhiều ngày: " + group)
        periods = sorted(int(e["period"]) for e in members)
        if len(set(periods)) != len(periods) or periods != list(range(periods[0], periods[0] + len(periods))):
            raise ValueError("Block khóa phải liên tiếp: " + group)
        by_assignment[first["assignmentId"]].append({
            "assignment": first["assignmentId"], "size": len(members), "fixed": (int(first["dayIndex"]), periods[0]),
            "locked": True, "id": group,
        })

    units: list[dict[str, Any]] = []
    for a in scenario["assignments"]:
        aid = a["id"]
        block = int(a.get("blockSize") or 1)
        if block not in (1, 2, 3):
            raise ValueError("BlockSize chỉ được là 1, 2 hoặc 3.")
        forced = list(by_assignment[aid])
        for fixed_index, raw in enumerate(a.get("fixedStartSlots") or []):
            fixed_day, fixed_period = parse_slot(raw)
            if any(u["fixed"] == (fixed_day, fixed_period) for u in forced):
                continue
            forced.append({"assignment": aid, "size": block, "fixed": (fixed_day, fixed_period),
                           "locked": True, "id": "fixed-" + aid + "-" + str(fixed_index)})
        required = int(a["periodsPerWeek"])
        remaining = required - sum(u["size"] for u in forced)
        if remaining < 0:
            raise ValueError("Số tiết khóa vượt số tiết/tuần: " + aid)
        units.extend(forced)
        ordinal = 0
        while remaining > 0:
            size = min(block, remaining)
            units.append({"assignment": aid, "size": size, "fixed": None,
                          "locked": False, "id": "cp-" + aid + "-" + str(ordinal)})
            remaining -= size
            ordinal += 1
    return units


def compute_gaps(entries: list[dict[str, Any]], resource_field: str) -> int:
    grouped: dict[tuple[str, int], set[int]] = defaultdict(set)
    for e in entries:
        grouped[e[resource_field], e["dayIndex"]].add(e["period"])
    return sum((max(periods) - min(periods) + 1 - len(periods)) for periods in grouped.values() if periods)


def verify(scenario: dict[str, Any], entries: list[dict[str, Any]]) -> list[str]:
    """Independent verifier. It does not call CP-SAT or rely on solver status."""
    issues: list[str] = []
    days = 6 if scenario.get("daysPerWeek") == 6 else 5
    periods = int(scenario["periodsPerDay"])
    morning = int(scenario.get("morningPeriods") or min(5, periods))
    teachers = {x["id"]: x for x in scenario["teachers"]}
    classes = {x["id"]: x for x in scenario["classes"]}
    rooms = {x["id"]: x for x in scenario["rooms"]}
    assignments = {x["id"]: x for x in scenario["assignments"]}
    occupied: set[tuple[str, str, int, int]] = set()
    by_assignment: dict[str, list[dict[str, Any]]] = defaultdict(list)
    daily: dict[tuple[str, str, int], int] = defaultdict(int)
    consecutive: dict[tuple[str, int], set[int]] = defaultdict(set)

    for e in entries:
        aid = e.get("assignmentId")
        a = assignments.get(aid)
        if not a:
            issues.append("Phân công không tồn tại " + str(aid))
            continue
        day, period = e["dayIndex"], e["period"]
        if day < 0 or day >= days or period < 1 or period > periods:
            issues.append("Tiết vượt khung: " + str(e.get("id")))
            continue
        slot = slot_key(day, period)
        if any(e.get(field) != a.get(field) for field in ("classId", "subjectId", "teacherId", "roomId")):
            issues.append("Tiết sai phân công: " + aid)
        for kind, rid in (("class", a["classId"]), ("teacher", a["teacherId"]), ("room", a.get("roomId"))):
            if not rid:
                continue
            key = (kind, rid, day, period)
            if key in occupied:
                issues.append("Trùng " + kind + " " + rid + " tại " + slot)
            occupied.add(key)
            res = (classes if kind == "class" else teachers if kind == "teacher" else rooms).get(rid)
            if not res:
                issues.append("Tài nguyên không tồn tại: " + rid)
            elif slot in (res.get("unavailableSlots") or []):
                issues.append("Tài nguyên " + rid + " không khả dụng: " + slot)
            daily[(kind, rid, day)] += 1
            if kind == "teacher":
                consecutive[(rid, day)].add(period)
        if slot in (a.get("forbiddenSlots") or []):
            issues.append("Phân công " + aid + " bị xếp vào tiết cấm.")
        if a.get("session") == "morning" and period > morning:
            issues.append("Phân công " + aid + " ngoài buổi sáng.")
        if a.get("session") == "afternoon" and period <= morning:
            issues.append("Phân công " + aid + " ngoài buổi chiều.")
        daily[("assignment", aid, day)] += 1
        by_assignment[aid].append(e)

    for aid, a in assignments.items():
        placed = by_assignment[aid]
        if len(placed) != int(a["periodsPerWeek"]):
            issues.append("Thiếu/thừa tiết: " + aid)
        for day in range(days):
            if daily["assignment", aid, day] > int(a.get("maxPerDay") or max(1, int(a.get("blockSize") or 1))):
                issues.append("Vượt số tiết/ngày: " + aid)
        for fixed_slot in a.get("fixedStartSlots") or []:
            fixed_day, fixed_period = parse_slot(fixed_slot)
            for offset in range(int(a.get("blockSize") or 1)):
                if not any(e["dayIndex"] == fixed_day and e["period"] == fixed_period + offset for e in placed):
                    issues.append("Thiếu tiết cố định: " + aid + " / " + fixed_slot)
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for e in placed:
            groups[str(e.get("blockId") or e["id"])].append(e)
        for group in groups.values():
            arranged = sorted(group, key=lambda e: e["period"])
            if any(e["dayIndex"] != arranged[0]["dayIndex"] for e in arranged) or any(
                arranged[i]["period"] != arranged[i - 1]["period"] + 1 for i in range(1, len(arranged))
            ):
                issues.append("Block không liên tiếp: " + aid)
            if arranged[0]["period"] <= morning < arranged[-1]["period"]:
                issues.append("Block vượt ranh giới buổi: " + aid)
            size = int(a.get("blockSize") or 1)
            if len(arranged) > size or (len(arranged) < size and int(a["periodsPerWeek"]) % size == 0):
                issues.append("Block sai độ dài: " + aid)

    for teacher in teachers.values():
        for day in range(days):
            limit = teacher.get("maxPeriodsPerDay")
            if limit and daily["teacher", teacher["id"], day] > int(limit):
                issues.append("Giáo viên vượt tối đa/ngày: " + teacher["id"])
            streak = 0
            previous = -100
            for period in sorted(consecutive[teacher["id"], day]):
                streak = streak + 1 if period == previous + 1 else 1
                if teacher.get("maxConsecutivePeriods") and streak > int(teacher["maxConsecutivePeriods"]):
                    issues.append("Giáo viên dạy liên tiếp quá giới hạn: " + teacher["id"])
                    break
                previous = period
    for classroom in classes.values():
        for day in range(days):
            if classroom.get("maxPeriodsPerDay") and daily["class", classroom["id"], day] > int(classroom["maxPeriodsPerDay"]):
                issues.append("Lớp vượt tối đa/ngày: " + classroom["id"])
    return sorted(set(issues))


def solve(data: SolveRequest) -> dict[str, Any]:
    scenario = data.scenario
    required_fields = ("teachers", "classes", "subjects", "rooms", "assignments", "periodsPerDay")
    for name in required_fields:
        if name not in scenario:
            raise ValueError("Thiếu trường dữ liệu: " + name)
    days = 6 if scenario.get("daysPerWeek") == 6 else 5
    periods = int(scenario["periodsPerDay"])
    morning = int(scenario.get("morningPeriods") or min(5, periods))
    if not (1 <= periods <= 12) or not (1 <= morning <= periods):
        raise ValueError("Khung ngày học không hợp lệ.")
    if scenario.get('studentGroups') or scenario.get('lessonGroups') or scenario.get('campuses') or any(a.get('additionalClassIds') or a.get('additionalTeacherIds') or a.get('studentGroupId') or a.get('additionalStudentGroupIds') or a.get('campusId') for a in scenario.get('assignments', [])) or any(s.get('maxConcurrentClasses') for s in scenario.get('subjects', [])) or any(t.get('maxTeachingDays') for t in scenario.get('teachers', [])) or any(r.get('capacity') for r in scenario.get('rooms', [])):
        from advanced import solve_advanced
        return solve_advanced(scenario, data.lockedEntries, data.timeLimitSeconds)
    teachers = {x["id"]: x for x in scenario["teachers"]}
    classes = {x["id"]: x for x in scenario["classes"]}
    rooms = {x["id"]: x for x in scenario["rooms"]}
    subjects = {x["id"]: x for x in scenario["subjects"]}
    assignments = {x["id"]: x for x in scenario["assignments"]}
    if any(a["classId"] not in classes or a["teacherId"] not in teachers or a["subjectId"] not in subjects or
           (a.get("roomId") and a["roomId"] not in rooms) for a in assignments.values()):
        raise ValueError("Phân công tham chiếu lớp/giáo viên/môn/phòng không tồn tại.")
    units = session_units(scenario, data.lockedEntries)
    model = cp_model.CpModel()
    occupied: dict[tuple[str, str, int, int], list[Any]] = defaultdict(list)
    daily: dict[tuple[str, str, int], list[Any]] = defaultdict(list)
    teacher_periods: dict[tuple[str, int, int], list[Any]] = defaultdict(list)
    choices: list[tuple[dict[str, Any], int, int, Any, int]] = []
    penalty_terms: list[Any] = []

    for unit_index, unit in enumerate(units):
        assignment = assignments[unit["assignment"]]
        teacher = teachers[assignment["teacherId"]]
        classroom = classes[assignment["classId"]]
        room = rooms.get(assignment.get("roomId"))
        subject = subjects[assignment["subjectId"]]
        size = unit["size"]
        vars_for_unit = []
        for day in range(days):
            for start in range(1, periods - size + 2):
                if unit["fixed"] is not None and unit["fixed"] != (day, start):
                    continue
                end = start + size - 1
                if start <= morning < end:
                    continue
                if assignment.get("session") == "morning" and end > morning:
                    continue
                if assignment.get("session") == "afternoon" and start <= morning:
                    continue
                slots = [slot_key(day, p) for p in range(start, end + 1)]
                if any(any(s in (obj.get("unavailableSlots") or []) for s in slots)
                       for obj in (teacher, classroom, room) if obj):
                    continue
                if any(s in (assignment.get("forbiddenSlots") or []) for s in slots):
                    continue
                x = model.NewBoolVar("u" + str(unit_index) + "_d" + str(day) + "_p" + str(start))
                vars_for_unit.append(x)
                choices.append((unit, day, start, x, size))
                for p in range(start, end + 1):
                    occupied["class", assignment["classId"], day, p].append(x)
                    occupied["teacher", assignment["teacherId"], day, p].append(x)
                    teacher_periods[assignment["teacherId"], day, p].append(x)
                    if room:
                        occupied["room", room["id"], day, p].append(x)
                for kind, rid in (("assignment", assignment["id"]), ("teacher", teacher["id"]), ("class", classroom["id"])):
                    daily[kind, rid, day].extend([x] * size)
                cost = 0
                if subject.get("preferMorning") and start > morning:
                    cost += 24
                if (subject.get("avoidLastPeriod") or assignment.get("avoidLastPeriod")) and end == periods:
                    cost += 16
                if assignment.get("preferredSlots") and not any(s in assignment["preferredSlots"] for s in slots):
                    cost += 6
                if teacher.get("preferredSlots") and not any(s in teacher["preferredSlots"] for s in slots):
                    cost += 4
                cost += start // 3
                if cost:
                    penalty_terms.append(cost * x)
        if not vars_for_unit:
            return {"status": "INFEASIBLE", "explanations": [
                "Không còn ô khả dụng cho " + unit["assignment"] + " (block " + str(size) + " tiết)."],
                "solution": None}
        model.AddExactlyOne(vars_for_unit)

    for key, vals in occupied.items():
        model.Add(sum(vals) <= 1)
    for (kind, rid, day), vals in daily.items():
        if kind == "assignment":
            a = assignments[rid]
            limit = int(a.get("maxPerDay") or max(1, int(a.get("blockSize") or 1)))
        elif kind == "teacher":
            limit = int(teachers[rid].get("maxPeriodsPerDay") or periods)
        else:
            limit = int(classes[rid].get("maxPeriodsPerDay") or periods)
        model.Add(sum(vals) <= limit)
    for teacher in teachers.values():
        maximum = teacher.get("maxConsecutivePeriods")
        if not maximum:
            continue
        maximum = int(maximum)
        for day in range(days):
            for start in range(1, periods - maximum + 1):
                model.Add(sum(sum(teacher_periods[teacher["id"], day, p]) for p in range(start, start + maximum + 1)) <= maximum)

    model.Minimize(sum(penalty_terms) if penalty_terms else 0)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = data.timeLimitSeconds
    solver.parameters.num_search_workers = 4
    solver.parameters.random_seed = 2026
    result = solver.Solve(model)
    names = {cp_model.OPTIMAL: "OPTIMAL", cp_model.FEASIBLE: "FEASIBLE",
             cp_model.INFEASIBLE: "INFEASIBLE", cp_model.MODEL_INVALID: "MODEL_INVALID",
             cp_model.UNKNOWN: "UNKNOWN"}
    status = names.get(result, "UNKNOWN")
    metadata = {"wallTimeSeconds": solver.WallTime(), "branches": solver.NumBranches(), "conflicts": solver.NumConflicts()}
    if status not in ("OPTIMAL", "FEASIBLE"):
        return {"status": status, "solution": None, "statistics": metadata,
                "explanations": ["Không có nghiệm." if status == "INFEASIBLE" else "Chưa có nghiệm trong giới hạn thời gian hoặc mô hình không hợp lệ."]}

    entries: list[dict[str, Any]] = []
    for unit, day, start, var, size in choices:
        if solver.BooleanValue(var):
            a = assignments[unit["assignment"]]
            for offset in range(size):
                entries.append({
                    "id": unit["id"] + "-" + str(offset + 1),
                    "assignmentId": a["id"], "classId": a["classId"], "subjectId": a["subjectId"],
                    "teacherId": a["teacherId"], "roomId": a.get("roomId"), "dayIndex": day,
                    "period": start + offset, "blockId": unit["id"],
                    "locked": bool(unit["locked"]), "fixed": unit["id"].startswith("fixed-"),
                })
    entries.sort(key=lambda e: (e["dayIndex"], e["period"], e["classId"]))
    independent_errors = verify(scenario, entries)
    if independent_errors:
        raise RuntimeError("Independent validator rejected output: " + "; ".join(independent_errors[:5]))
    teacher_gaps = compute_gaps(entries, "teacherId")
    class_gaps = compute_gaps(entries, "classId")
    objective = int(round(solver.ObjectiveValue()))
    metadata["bestObjectiveBound"] = solver.BestObjectiveBound()
    metadata["objectiveValue"] = solver.ObjectiveValue()
    return {
        "status": status,
        "statistics": metadata,
        "verification": {"valid": True, "complete": True, "checkedPeriods": len(entries)},
        "solution": {
            "entries": entries,
            "score": objective,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "diagnostics": {
                "hardConflicts": [], "warnings": [], "unscheduled": [], "teacherGaps": teacher_gaps,
                "quality": {"teacherGaps": teacher_gaps, "classGaps": class_gaps,
                            "lateCorePeriods": sum(
                                bool(subjects[e["subjectId"]].get("preferMorning")) and e["period"] > morning for e in entries),
                            "dailyImbalance": 0},
                "preflight": [],
            },
        },
    }


@app.post("/solve", dependencies=[Depends(authorize)])
def solve_endpoint(data: SolveRequest) -> dict[str, Any]:
    try:
        return solve(data)
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
