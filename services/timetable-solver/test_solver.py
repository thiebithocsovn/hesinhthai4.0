from copy import deepcopy
from app import SolveRequest, solve, verify

def example():
    return {
        "name": "Trường thử nghiệm",
        "daysPerWeek": 5, "periodsPerDay": 5, "morningPeriods": 3,
        "classes": [{"id": "6a", "name": "6A", "maxPeriodsPerDay": 3}],
        "teachers": [{"id": "gv1", "name": "Giáo viên 1", "maxPeriodsPerDay": 3, "maxConsecutivePeriods": 3}],
        "subjects": [{"id": "toan", "name": "Toán", "preferMorning": True}],
        "rooms": [],
        "assignments": [{"id": "a1", "classId": "6a", "teacherId": "gv1", "subjectId": "toan",
                         "periodsPerWeek": 2, "maxPerDay": 2, "blockSize": 2, "fixedStartSlots": ["0:1"]}],
    }

def test_feasible_block_and_fixed_slot():
    scenario = example()
    result = solve(SolveRequest(scenario=scenario, timeLimitSeconds=5))
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    entries = result["solution"]["entries"]
    assert {(e["dayIndex"], e["period"]) for e in entries} == {(0, 1), (0, 2)}
    assert result["verification"]["valid"]
    assert verify(scenario, entries) == []

def test_unavailable_teacher_is_infeasible():
    scenario = example()
    scenario["teachers"][0]["unavailableSlots"] = ["0:1", "0:2"]
    result = solve(SolveRequest(scenario=scenario, timeLimitSeconds=5))
    assert result["status"] == "INFEASIBLE"
    assert result["solution"] is None

def test_independent_validation_rejects_collision():
    scenario = example()
    result = solve(SolveRequest(scenario=scenario, timeLimitSeconds=5))
    entries = result["solution"]["entries"]
    assert any("Trùng" in e for e in verify(scenario, entries + [deepcopy(entries[0])]))

def test_locked_entry_is_retained():
    scenario = example()
    scenario["assignments"][0]["fixedStartSlots"] = []
    scenario["assignments"][0]["blockSize"] = 1
    scenario["assignments"][0]["periodsPerWeek"] = 1
    scenario["assignments"][0]["maxPerDay"] = 1
    locked = {"id": "locked1", "assignmentId": "a1", "classId": "6a",
              "teacherId": "gv1", "subjectId": "toan", "dayIndex": 1, "period": 2}
    result = solve(SolveRequest(scenario=scenario, lockedEntries=[locked], timeLimitSeconds=5))
    assert result["status"] in ("OPTIMAL", "FEASIBLE")
    assert result["solution"]["entries"][0]["dayIndex"] == 1
    assert result["solution"]["entries"][0]["period"] == 2
