export type OnboardingDraft = {
  name: string
  date_of_birth: string
  gender: 'male' | 'female' | ''
  user_type: 'student' | 'professional' | 'self_employed' | 'retired' | ''
  country: string
}

export const EMPTY_DRAFT: OnboardingDraft = {
  name: '',
  date_of_birth: '2000-01-01',
  gender: '',
  user_type: '',
  country: 'Pakistan',
}

let draft: OnboardingDraft = { ...EMPTY_DRAFT }

export function getOnboardingDraft(): OnboardingDraft {
  return { ...draft }
}

export function patchOnboardingDraft(patch: Partial<OnboardingDraft>): OnboardingDraft {
  draft = { ...draft, ...patch }
  return getOnboardingDraft()
}

export function clearOnboardingDraft(): void {
  draft = { ...EMPTY_DRAFT }
}
