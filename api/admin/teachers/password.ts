import { createTeacherPasswordApp } from '../../../server/teacherAdminApp.js';

// Vercel invokes the Express handler; this entry point must never open a listening port.
const app = createTeacherPasswordApp();
export default app;
