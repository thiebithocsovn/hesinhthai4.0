// The Google account operating the personal timetable during the pilot.
const OWNER_EMAIL = 'tuyenthcskimhy@gmail.com';

export function isTimetableOwner(email: string | null | undefined, verified: boolean): boolean {
  return verified && email?.trim().toLowerCase() === OWNER_EMAIL;
}
