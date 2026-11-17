# AITHEROVA Smart Timetable AI — repository instructions

## Preserve the working ecosystem

This is an existing **React 19 + Vite + TypeScript** application (Hệ sinh thái 4.0). Do not replace it wholesale with Next.js, remove existing tools, alter Firebase rules, or delete unrelated components. The timetable route is already registered through `SmartTimetableEntry`. The app runs offline-first and is deployed as static files to GitHub Pages; a backend must live separately.

## Timetable architecture

- `src/components/SmartTimetable.tsx`: existing workspace, import/export, scheduling UI.
- `src/components/TimetableAgentPanel.tsx`: Vietnamese command panel and approval workflow.
- `src/lib/smartTimetable.ts`: browser Web Worker heuristic for offline availability.
- `src/lib/timetableAgent.ts`: **deterministic** Vietnamese command planner. Preview only; no silent writes.
- `src/lib/smartTimetableAudit.ts`: independent result audit; do not call the solver's own validator.
- `services/timetable-solver/app.py`: separately deployable OR-Tools CP-SAT service.

## Mandatory safety rules

1. No double-booked teacher/class/room. All required lessons exactly once when a solution is marked complete.
2. Never claim OPTIMAL from heuristic output or from a CP-SAT FEASIBLE status.
3. No auto-publish, silent hard-constraint relaxation, fabricated test outcomes, or inaccessible demo-only buttons.
4. Never put server API keys or Firebase Admin credentials in Vite public variables or GitHub Pages output.
5. Preserve existing local-first persistence, owner-scoped Firebase data, and backward-compatible scenario JSON.
6. Use feature branches and PRs. Run automated checks before merging.

## Validation

```bash
npm ci --legacy-peer-deps --ignore-scripts
npm run test:smart-timetable
npm run test:timetable-agent
npm run lint
npm run build:static
cd services/timetable-solver && pip install -r requirements.txt && pytest -q
```

Service-side CP-SAT is not available on GitHub Pages until deployed behind an authenticated backend proxy. PostgreSQL, Redis, and the authorization-protected publication workflow are future migrations; never describe them as complete.
