# AITHEROVA — CP-SAT solver service (optional)

The existing Hệ sinh thái 4.0 frontend is a Vite/React GitHub Pages application.
This directory introduces a real **server-side OR-Tools CP-SAT** optimizer without replacing that frontend.

## Local usage

```bash
cd services/timetable-solver
python -m venv .venv
source .venv/bin/activate    # On Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
export TIMETABLE_SOLVER_API_KEY=local-dev-secret
uvicorn app:app --host 127.0.0.1 --port 8080
pytest -q
```

POST `/solve` with header `X-Solver-Key: local-dev-secret` and JSON:
```json
{"scenario":{"name":"...","daysPerWeek":5,"periodsPerDay":7,"morningPeriods":5,
"teachers":[],"classes":[],"subjects":[],"rooms":[],"assignments":[]},"lockedEntries":[],"timeLimitSeconds":12}
```

Response contains the true solver status: `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `UNKNOWN`, or `MODEL_INVALID`. Every feasible solution is checked separately before returning.

## Security and deployment

- Deploy as a **separate authenticated Python service** (container or VM), not GitHub Pages or a browser bundle.
- Set `TIMETABLE_ENV=production` and a strong `TIMETABLE_SOLVER_API_KEY`. Never commit real credentials.
- Do **not** put the service key in a `VITE_*` variable: those values are public in browser bundles.
- A production frontend integration needs a server-side authenticated proxy that verifies the current user's rights to the timetable before forwarding the request.
- Restrict network ingress, apply rate limits and per-request resource quotas. The service is synchronous and intentionally has a 120-second upper bound.
- This version is stateless; it does **not** yet provide PostgreSQL, Redis queues, multi-tenant persistence, authorization by school, or publication workflow. Keep the existing Firestore workspace until those features are implemented.

The live GitHub Pages application continues using the tested browser Web Worker heuristic until the authenticated service is deployed and integrated. It does not imply that the CP-SAT service is already live.
