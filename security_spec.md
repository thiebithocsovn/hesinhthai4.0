# Security Specification — Teacher Workspaces

## Trust boundaries

1. Firebase Authentication identifies every teacher by an immutable UID.
2. Only an approved teacher whose Firestore profile is `active` can access that teacher's workspace.
3. The verified administrator or a Firebase-issued administrator claim can inspect every workspace.
4. Categories, learning-wall posts, exams, classes, students, scores and sessions must preserve their original owner.
5. Guests never list or read private teacher documents, student rosters, answer keys or reports.
6. Public schedules contain metadata only; an exam code unlocks one AES-256-GCM encrypted payload.
7. Guest enrollment and submissions are accepted only for the matching published exam and enrolled student.
8. A guest may update only `lastActive` and `status` on an existing, active exam session.
9. Scores must be non-negative, cannot exceed the real question count and require an active matching session.
10. Browser storage is namespaced by Firebase UID; account changes remove decrypted exam and previous-session state.
11. Firestore uses volatile memory by default. Persistent IndexedDB requires an explicit opt-in on a trusted device.
12. `firebase.json` binds production rules to the same named database used by the application.

## Required negative checks

- Teacher A cannot list, read, modify or delete teacher B's classes, students, posts, exams, answers or reports.
- A pending or locked teacher cannot use direct Firebase calls to bypass the disabled interface.
- A guest cannot list `teachers`, `categories`, `wall_posts`, `exams`, `classes`, `students`, `results` or `exam_sessions`.
- A guest cannot list encrypted exam payloads, add unexpected enrollment fields, forge ownership or submit out-of-range scores.
- A guest cannot create a result without a real student record and an active session for the correct teacher and exam.
- A guest cannot rewrite a session's teacher UID, student ID, exam ID, start time or exam version.
- Switching accounts on a shared browser must remove the previous decrypted exam and previous teacher session markers.
- An administrator retains read access across all 5,000 simulated teacher workspaces.

## Verification

```bash
npm run lint:firestore
npm run test:teacher-isolation
npm run test:exam-privacy
npm run test:security-hardening
```

GitHub Pages publishes Firebase rules automatically only when the repository secret
`FIREBASE_SERVICE_ACCOUNT_JSON` is configured. Otherwise, a Firebase administrator
must publish `firestore.rules` in the console or run `npm run deploy:firestore`.
