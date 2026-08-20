export const CANDIDATE_CONTEXT_DEFAULT = true
export const CANDIDATE_CONTEXT_STORAGE_KEY = 'natively.interviewConsole.candidateContext.v1'

export function loadCandidateContextEnabled(
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (!target) return CANDIDATE_CONTEXT_DEFAULT
    const value = target.getItem(CANDIDATE_CONTEXT_STORAGE_KEY)
    if (value === 'true') return true
    if (value === 'false') return false
    return CANDIDATE_CONTEXT_DEFAULT
  } catch {
    return CANDIDATE_CONTEXT_DEFAULT
  }
}

export function saveCandidateContextEnabled(
  enabled: boolean,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    target?.setItem(CANDIDATE_CONTEXT_STORAGE_KEY, String(enabled))
  } catch {
    // Storage can be unavailable without disabling the in-session control.
  }
}
