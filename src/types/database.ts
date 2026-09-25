/**
 * Hand-written mirror of the Supabase schema (supabase/migrations/*.sql).
 * Once a real Supabase project exists, regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 * and reconcile any drift with this file's domain-level Zod schemas.
 */

export type TenantRole = 'nursery_owner' | 'nursery_admin' | 'nursery_staff';
export type TenantStatus = 'active' | 'suspended' | 'closed';
/** A "family" tenant is an individual parent/guardian account — see
 * docs/DECISIONS.md "Phase 4: families are tenants". */
export type TenantType = 'nursery' | 'family';
export type GiftStatus = 'pending_payment' | 'paid' | 'redeemed' | 'expired' | 'canceled';
export type Pronoun = 'she' | 'he' | 'they';
export type AppLocale = 'en' | 'ar';
export type ConsentStatus = 'not_requested' | 'pending' | 'granted' | 'declined' | 'withdrawn';
export type NativeReviewStatus = 'draft' | 'reviewed';
export type StoryStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'GENERATING'
  | 'GENERATED'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED';
export type PageImageStatus = 'PENDING' | 'QUEUED' | 'GENERATING' | 'GENERATED' | 'FAILED';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type JobType = 'GENERATE_PAGE_IMAGE' | 'RENDER_PDF';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';

export interface AvatarConfig {
  hair: string;
  skinTone: string;
  outfitColor: string;
  accessory: string;
}

export interface Profile {
  id: string;
  full_name: string;
  is_platform_owner: boolean;
  mfa_enrolled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  tenant_type: TenantType;
  logo_asset_path: string | null;
  brand_primary_color: string | null;
  default_locale: AppLocale;
  data_retention_days: number;
  photo_personalization_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export interface Gift {
  id: string;
  purchaser_email: string;
  story_credits: number;
  amount_usd: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  code_hash: string | null;
  status: GiftStatus;
  redeemed_by_tenant_id: string | null;
  redeemed_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
}

export interface Child {
  id: string;
  tenant_id: string;
  first_name: string;
  /** Optional Arabic spelling of the child's name, used in place of
   * first_name when generating an Arabic-locale story — see
   * docs/DECISIONS.md "Arabic name field for children". */
  arabic_name: string | null;
  pronoun: Pronoun;
  class_name: string | null;
  preferred_language: AppLocale;
  avatar_config: AvatarConfig;
  consent_status: ConsentStatus;
  photo_asset_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsentRequest {
  id: string;
  tenant_id: string;
  child_id: string;
  token_hash: string;
  scope: { story: boolean; photo: boolean };
  status: ConsentStatus;
  requested_by: string | null;
  requested_at: string;
  responded_at: string | null;
  withdrawn_at: string | null;
  expires_at: string;
}

export interface StoryThemeTemplateRow {
  id: string;
  theme_key: string;
  locale: AppLocale;
  title: string;
  synopsis: string;
  mascot_name: string;
  pages: { order: number; text: string; image_prompt: string }[];
  native_review_status: NativeReviewStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Story {
  id: string;
  tenant_id: string;
  child_id: string;
  theme_key: string;
  locale: AppLocale;
  status: StoryStatus;
  avatar_config_snapshot: AvatarConfig;
  rejected_reason: string | null;
  pdf_asset_path: string | null;
  bulk_export_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryPage {
  id: string;
  story_id: string;
  page_number: number;
  text: string;
  image_prompt: string;
  image_asset_path: string | null;
  image_status: PageImageStatus;
  provider: string | null;
  cost_usd: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoryJob {
  id: string;
  story_id: string;
  page_id: string | null;
  job_type: JobType;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  last_error: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  price_monthly_cents: number;
  price_annual_cents: number;
  currency: string;
  vat_inclusive: boolean;
  stories_per_month: number;
  seats_included: number;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  trial_story_used: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Quota {
  tenant_id: string;
  stories_included_this_period: number;
  stories_used_this_period: number;
  period_start: string;
  period_end: string;
  hard_cap: boolean;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
