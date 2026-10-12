// Hand-written row types matching supabase/migrations. Money is integer kobo.
export type Role = 'assembly_admin' | 'church_secretary' | 'finance_officer' | 'superintendent' | 'usher' | 'department_head' | 'member';
export type AgeGroup = 'child' | 'youth' | 'adult';

export interface Assembly {
  id: string; slug: string; name: string; denomination: string; district: string | null; address: string | null;
  city: string | null; state: string | null; country: string; timezone: string; currency: string;
  contact_phone: string | null; contact_email: string | null; is_active: boolean;
}
export interface AssemblyLocation { id: string; assembly_id: string; name: string; latitude: number; longitude: number; radius_m: number; is_primary: boolean }
export interface Member {
  id: string; assembly_id: string; user_id: string | null; member_no: string | null; first_name: string; last_name: string;
  other_names: string | null; gender: 'male' | 'female' | null; date_of_birth: string | null; wedding_anniversary: string | null;
  age_group: AgeGroup; phone: string | null; email: string | null; address: string | null; status: string; join_date: string | null;
}
export interface UserRoleRow { id: string; assembly_id: string; user_id: string; role: Role }
export interface ClassStaffRow { id: string; assembly_id: string; class_id: string; member_id: string; staff_role: 'teacher' | 'secretary' | 'assistant'; is_active: boolean }

export interface SsQuarter { id: string; assembly_id: string; year: number; quarter_no: number; title: string | null; start_date: string; end_date: string; status: 'draft' | 'active' | 'closed' }
export interface SsClass { id: string; assembly_id: string; name: string; description: string | null; sort_order: number; is_active: boolean }
export interface SsEnrollment { id: string; assembly_id: string; quarter_id: string; class_id: string; member_id: string; status: 'enrolled' | 'withdrawn' }
export type SessionStatus = 'open' | 'submitted' | 'locked';
export interface SsSession {
  id: string; assembly_id: string; quarter_id: string; class_id: string; session_date: string; week_no: number | null;
  lesson_title: string | null; memory_verse_ref: string | null; status: SessionStatus;
}
export interface Criterion { id: string; code: string; label: string; source: 'attendance' | 'on_time' | 'manual'; max_points: number; sort_order: number; is_active: boolean }
export type AttStatus = 'present' | 'absent' | 'excused';
export interface SsAttendance { id: string; session_id: string; enrollment_id: string; status: AttStatus; is_on_time: boolean }
export interface SsScore { id: string; session_id: string; enrollment_id: string; criterion_id: string; points: number }
export interface SsVisitor { id: string; session_id: string; full_name: string; phone: string | null; is_returning: boolean; client_id: string | null }
export type MoneyStatus = 'recorded' | 'verified' | 'voided';
export interface SsOffering { id: string; session_id: string; amount_kobo: number; status: MoneyStatus; note: string | null; client_id: string | null; recorded_by: string; verified_by: string | null }
export interface SessionSummary {
  assembly_id: string; session_id: string; quarter_id: string; class_id: string; class_name: string; session_date: string; status: SessionStatus;
  present_count: number; absent_count: number; new_visitors: number; returning_visitors: number; offering_kobo: number;
}
export interface LeaderRow {
  enrollment_id: string; member_id: string; class_id: string; quarter_id: string; first_name: string; last_name: string;
  total_points: number; sessions_present: number; rank: number;
}

export interface Service {
  id: string; assembly_id: string; service_type: string; title: string | null; service_date: string; starts_at: string; ends_at: string | null;
  preacher_name: string | null; sermon_topic: string | null; text_used: string | null; status: 'scheduled' | 'open' | 'closed';
  checkin_opens_at: string | null; checkin_closes_at: string | null; location_id: string | null;
}
export interface HeadCount { id: string; service_id: string; men: number; women: number; youth_male: number; youth_female: number; children: number; total: number }
export interface Fund { id: string; name: string; kind: string; is_active: boolean }
export interface IncomeEntry {
  id: string; service_id: string; fund_id: string; amount_kobo: number; collector_name: string | null; status: MoneyStatus;
  recorded_by: string; verified_by: string | null; void_reason: string | null; note: string | null; created_at: string;
}
export interface Checkin {
  id: string; service_id: string; member_id: string; checked_in_at: string; method: string; status: 'verified' | 'flagged' | 'rejected';
  flag_reason: string | null; distance_m: number | null;
}
export interface EventRow { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; venue: string | null; is_public: boolean }
export interface SermonRow { id: string; title: string; preacher_name: string | null; text_used: string | null; summary: string | null; preached_on: string | null; audio_url: string | null; video_url: string | null; is_public: boolean }
export interface AnnouncementRow { id: string; title: string; body: string; is_public: boolean; publish_at: string }
export interface MemberInvite { id: string; member_id: string; code: string; claimed_at: string | null; expires_at: string }
