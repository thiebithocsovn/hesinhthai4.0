import { createTeacherPasswordApp } from '../../../server/teacherAdminApp';

// Vercel invokes the Express handler; this entry point must never open a listening port.
const app = createTeacherPasswordApp();
export default app;
