import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import { teacherAdminAppOptions } from './teacherAdminCredentials.js';
import { SchoolError, createTimetableSchoolsApp, type TimetableSchool, type TimetableSchoolIdentity, type TimetableSchoolMembership, type TimetableSchoolInvite, type TimetableSchoolWorkspace, type TimetableSchoolReview, type TimetableSchoolPublicRecord, type TimetableSchoolAudit, type TimetableSchoolsStore } from './timetableSchools.js';

function firebaseApp() {
  return getApps().find(x => x.name === 'timetable-schools') || initializeApp(teacherAdminAppOptions(), 'timetable-schools');
}
function firestore(): Firestore { return getFirestore(firebaseApp(), firebaseConfig.firestoreDatabaseId); }
const schools = () => firestore().collection('timetable_saas_schools');
const memberRef = (id: string, uid: string) => schools().doc(id).collection('members').doc(uid);
const userRef = (uid: string, id: string) => firestore().collection('timetable_saas_users').doc(uid).collection('schools').doc(id);
const auditRef = (id: string) => schools().doc(id).collection('activity').doc();

class FirebaseSchoolStore implements TimetableSchoolsStore {
  async list(uid: string): Promise<TimetableSchool[]> {
    const membership = await firestore().collection('timetable_saas_users').doc(uid).collection('schools').limit(30).get();
    const docs = await Promise.all(membership.docs.map(x => schools().doc(x.id).get()));
    return docs.filter(x => x.exists).map(x => x.data() as TimetableSchool);
  }
  async create(school: TimetableSchool, actor: TimetableSchoolIdentity): Promise<void> {
    const membership: TimetableSchoolMembership = { uid: actor.uid, email: actor.email.toLowerCase(), role: 'owner', joinedAt: school.createdAt };
    const batch = firestore().batch();
    batch.create(schools().doc(school.id), school);
    batch.create(memberRef(school.id, actor.uid), membership);
    batch.create(userRef(actor.uid, school.id), { joinedAt: school.createdAt, role: 'owner' });
    batch.create(auditRef(school.id), { actor: actor.uid, action: 'school-created', at: school.createdAt });
    await batch.commit();
  }
  async school(id: string): Promise<TimetableSchool | null> {
    const snap = await schools().doc(id).get();
    return snap.exists ? snap.data() as TimetableSchool : null;
  }
  async member(id: string, uid: string): Promise<TimetableSchoolMembership | null> {
    const snap = await memberRef(id, uid).get();
    return snap.exists ? snap.data() as TimetableSchoolMembership : null;
  }
  async members(id: string): Promise<TimetableSchoolMembership[]> {
    const snap = await schools().doc(id).collection('members').limit(100).get();
    return snap.docs.map(x => x.data() as TimetableSchoolMembership);
  }
  async invite(id: string, invite: TimetableSchoolInvite): Promise<void> {
    await schools().doc(id).collection('invites').doc(invite.codeHash).create(invite);
  }
  async updateMember(id: string, targetUid: string, role: Exclude<TimetableSchoolMembership['role'], 'owner'> | null, actorUid: string): Promise<void> {
    const reference = memberRef(id, targetUid), index = userRef(targetUid, id);
    await firestore().runTransaction(async tx => {
      const memberSnap = await tx.get(reference);
      if (!memberSnap.exists || memberSnap.data()?.role === 'owner') throw new SchoolError(409, 'Không được thay đổi chủ trường hoặc thành viên đã bị xóa.');
      const now = new Date().toISOString();
      if (role === null) { tx.delete(reference); tx.delete(index); }
      else { tx.update(reference, { role }); tx.update(index, { role }); }
      tx.create(auditRef(id), { actor: actorUid, action: role ? 'member-role-changed' : 'member-removed', at: now, detail: targetUid.slice(0, 12) });
    });
  }
  async join(id: string, hash: string, actor: TimetableSchoolIdentity): Promise<TimetableSchoolMembership> {
    const school = schools().doc(id), inv = school.collection('invites').doc(hash), member = memberRef(id, actor.uid), userIndex = userRef(actor.uid, id);
    return firestore().runTransaction(async tx => {
      const [schoolSnap, invSnap, memberSnap, members] = await Promise.all([
        tx.get(school), tx.get(inv), tx.get(member), tx.get(school.collection('members')),
      ]);
      if (!schoolSnap.exists || !invSnap.exists) throw new SchoolError(404, 'Lời mời không tồn tại.');
      const invitation = invSnap.data() as TimetableSchoolInvite;
      const config = schoolSnap.data() as TimetableSchool;
      if (invitation.usedBy || invitation.expiresAt < new Date().toISOString()) throw new SchoolError(409, 'Lời mời đã hết hạn hoặc đã sử dụng.');
      if (invitation.email !== actor.email.toLowerCase()) throw new SchoolError(403, 'Lời mời chỉ dành cho địa chỉ email đã được xác minh.');
      if (memberSnap.exists) throw new SchoolError(409, 'Bạn đã là thành viên của trường.');
      if (members.size >= config.seatLimit) throw new SchoolError(409, 'Trường đã hết chỗ trong gói thí điểm.');
      const membership: TimetableSchoolMembership = { uid: actor.uid, email: actor.email.toLowerCase(), role: invitation.role, joinedAt: new Date().toISOString() };
      tx.create(member, membership);
      tx.create(userIndex, { joinedAt: membership.joinedAt, role: membership.role });
      tx.update(inv, { usedBy: actor.uid });
      tx.create(auditRef(id), { actor: actor.uid, action: 'invitation-redeemed', at: membership.joinedAt, detail: invitation.role });
      return membership;
    });
  }
  async readWorkspace(id: string): Promise<TimetableSchoolWorkspace | null> {
    const snap = await schools().doc(id).collection('data').doc('current').get();
    return snap.exists ? snap.data() as TimetableSchoolWorkspace : null;
  }
  async saveWorkspace(id: string, data: Omit<TimetableSchoolWorkspace, 'revision'>, expectedRevision: number): Promise<number> {
    const ref = schools().doc(id).collection('data').doc('current');
    return firestore().runTransaction(async tx => {
      const snap = await tx.get(ref), revision = snap.exists ? Number(snap.data()?.revision || 0) : 0;
      if (revision !== expectedRevision) throw new SchoolError(409, 'Một tài khoản khác đã sửa dữ liệu trường. Hãy tải lại dữ liệu nhóm trước khi ghi.');
      tx.set(ref, { ...data, revision: revision + 1 });
      tx.create(auditRef(id), { actor: data.updatedBy, action: 'workspace-saved', at: data.updatedAt, detail: 'revision:' + (revision + 1) });
      return revision + 1;
    });
  }
  async createReview(id: string, review: TimetableSchoolReview): Promise<void> {
    const batch = firestore().batch();
    batch.create(schools().doc(id).collection('reviews').doc(review.id), review);
    batch.create(auditRef(id), { actor: review.submittedBy, action: 'review-submitted', at: review.submittedAt, detail: review.id });
    await batch.commit();
  }
  async reviews(id: string): Promise<Omit<TimetableSchoolReview, 'scenario' | 'solution'>[]> {
    const snap = await schools().doc(id).collection('reviews').orderBy('submittedAt', 'desc').limit(30).get();
    return snap.docs.map(x => { const y = x.data() as TimetableSchoolReview; return {
      id: y.id, sourceRevision: y.sourceRevision, options: y.options, status: y.status, submittedAt: y.submittedAt, submittedBy: y.submittedBy, decidedBy: y.decidedBy, decidedAt: y.decidedAt, reason: y.reason,
    }; });
  }
  async review(id: string, reviewId: string): Promise<TimetableSchoolReview | null> {
    const snap = await schools().doc(id).collection('reviews').doc(reviewId).get();
    return snap.exists ? snap.data() as TimetableSchoolReview : null;
  }
  async decide(id: string, reviewId: string, status: 'approved' | 'rejected', actor: string, reason: string): Promise<void> {
    const ref = schools().doc(id).collection('reviews').doc(reviewId);
    await firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new SchoolError(404, 'Phiếu duyệt không tồn tại.');
      const review = snap.data() as TimetableSchoolReview;
      if (review.status !== 'pending' || review.submittedBy === actor) throw new SchoolError(409, 'Phiếu đã xử lý hoặc người gửi đang tự duyệt.');
      const now = new Date().toISOString();
      tx.update(ref, { status, decidedBy: actor, decidedAt: now, reason });
      tx.create(auditRef(id), { actor, action: 'review-' + status, at: now, detail: reviewId });
    });
  }
  async createPublication(id: string, publication: TimetableSchoolPublicRecord, actorUid: string): Promise<void> {
    const batch = firestore().batch();
    batch.create(schools().doc(id).collection('publications').doc(publication.id), publication);
    batch.create(auditRef(id), { actor: actorUid, action: 'timetable-published', at: publication.createdAt, detail: publication.approvedReviewId });
    await batch.commit();
  }
  async publication(id: string, publicId: string): Promise<TimetableSchoolPublicRecord | null> {
    const snap = await schools().doc(id).collection('publications').doc(publicId).get();
    return snap.exists ? snap.data() as TimetableSchoolPublicRecord : null;
  }
  async publications(id: string): Promise<Omit<TimetableSchoolPublicRecord, 'snapshot'>[]> {
    const snap = await schools().doc(id).collection('publications').orderBy('createdAt', 'desc').limit(30).get();
    return snap.docs.map(x => {
      const item = x.data() as TimetableSchoolPublicRecord;
      return { id: item.id, schoolId: item.schoolId, status: item.status, approvedReviewId: item.approvedReviewId, createdAt: item.createdAt };
    });
  }
  async revoke(id: string, publicId: string, actor: string): Promise<void> {
    const ref = schools().doc(id).collection('publications').doc(publicId);
    await firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new SchoolError(404, 'Liên kết không tồn tại.');
      const now = new Date().toISOString();
      tx.update(ref, { status: 'revoked', revokedAt: now, revokedBy: actor });
      tx.create(auditRef(id), { actor, action: 'timetable-revoked', at: now, detail: publicId });
    });
  }
  async activity(id: string): Promise<TimetableSchoolAudit[]> {
    const snap = await schools().doc(id).collection('activity').orderBy('at', 'desc').limit(50).get();
    return snap.docs.map(x => x.data() as TimetableSchoolAudit);
  }
  async audit(id: string, event: TimetableSchoolAudit): Promise<void> { await auditRef(id).create(event); }
}

export function createFirebaseTimetableSchoolsApp() {
  const serviceEnabled = () => process.env.TIMETABLE_SAAS_ENABLED === 'true';
  const ready = () => {
    if (!serviceEnabled()) return false;
    try { return Boolean(firebaseApp().options.credential); } catch { return false; }
  };
  const solverUrl = process.env.TIMETABLE_SOLVER_URL?.trim();
  const solverKey = process.env.TIMETABLE_SOLVER_API_KEY?.trim();
  const solver = solverUrl && /^https:\/\//.test(solverUrl) && solverKey
    ? async (scenario: Parameters<NonNullable<Parameters<typeof createTimetableSchoolsApp>[0]['solver']>>[0], locked: unknown[], seconds: number): Promise<unknown> => {
      const response = await fetch(solverUrl.replace(/\/$/, '') + '/solve', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Solver-Key': solverKey },
        body: JSON.stringify({ scenario, lockedEntries: locked, timeLimitSeconds: seconds }),
        signal: AbortSignal.timeout(28000), redirect: 'error' });
      if (!response.ok) throw new SchoolError(502, 'Dịch vụ CP-SAT chưa xử lý được yêu cầu.');
      return response.json();
    } : undefined;
  return createTimetableSchoolsApp({
    ready,
    async verify(token) {
      const user = await getAuth(firebaseApp()).verifyIdToken(token, true);
      if (user.firebase?.sign_in_provider === 'anonymous' || !user.email || !user.email_verified) throw new Error('Unverified identity');
      return { uid: user.uid, email: user.email, emailVerified: true };
    },
    store: new FirebaseSchoolStore(),
    canCreateSchool(actor) { const allowlist = (process.env.TIMETABLE_SAAS_CREATORS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean); return allowlist.includes(actor.email.toLowerCase()); },
    solver,
  }, new Set((process.env.ALLOWED_ORIGINS || 'https://thiebithocsovn.github.io,https://hesinhthai4-0.vercel.app,https://hesinhthai4-0-thietbihocso.vercel.app').split(',').map(x => x.trim()).filter(Boolean)));
}
