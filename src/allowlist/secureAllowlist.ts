/**
 * T3: Secure Allowlist - ID-Only Identity Checking
 * 
 * Enforces fail-closed identity verification:
 * - Only verified GitHub IDs count
 * - No name-based matching (prevents bypass)
 * - Reject if verification missing
 */

import * as core from '@actions/core'
import { AuthorIdentity } from '../interfaces'
import { isVerifiedIdentity } from '../typed-author/authorIdentity'

/**
 * Allowlist configuration
 */
export interface AllowlistConfig {
  githubIds: number[]
}

/**
 * Check if an author is allowlisted by GitHub ID only
 * 
 * Fail-closed policy:
 * 1. If identity is not verified (no GitHub ID), returns false
 * 2. Compare ONLY against GitHub IDs in allowlist
 * 3. Never match by name
 */
export function isAllowlisted(identity: AuthorIdentity, allowlist: AllowlistConfig): boolean {
  // CRITICAL: Fail-closed if identity is not verified
  if (!isVerifiedIdentity(identity)) {
    core.debug(`Identity ${identity.name} is not verified (no GitHub ID), rejecting from allowlist`)
    return false
  }

  // CRITICAL: Check ONLY by GitHub ID, never by name
  const isListed = allowlist.githubIds.includes(identity.githubId)
  
  if (isListed) {
    core.info(`Author ${identity.name} (ID: ${identity.githubId}) is allowlisted`)
  } else {
    core.debug(`Author ${identity.name} (ID: ${identity.githubId}) is NOT allowlisted`)
  }

  return isListed
}

/**
 * Check if all authors in a list are allowlisted
 */
export function areAllAllowlisted(
  identities: AuthorIdentity[],
  allowlist: AllowlistConfig
): boolean {
  if (identities.length === 0) {
    return false // Empty list means no one is signed
  }

  return identities.every(identity => isAllowlisted(identity, allowlist))
}

/**
 * Parse allowlist from input string (JSON array of IDs)
 * 
 * Example input: "[1234, 5678, 9000]"
 */
export function parseAllowlist(input?: string): AllowlistConfig {
  if (!input || input.trim() === '') {
    return { githubIds: [] }
  }

  try {
    const parsed = JSON.parse(input)
    if (!Array.isArray(parsed)) {
      throw new Error('Allowlist must be an array')
    }

    // Validate all elements are numbers
    const githubIds = parsed.filter((id): id is number => typeof id === 'number' && id > 0)
    if (githubIds.length !== parsed.length) {
      core.warning('Allowlist contained non-numeric IDs, filtering to valid IDs only')
    }

    return { githubIds }
  } catch (e) {
    throw new Error(`Invalid allowlist format: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Separate authors into allowlisted and not allowlisted
 */
export function partitionByAllowlist(
  identities: AuthorIdentity[],
  allowlist: AllowlistConfig
) {
  const allowlisted: AuthorIdentity[] = []
  const notAllowlisted: AuthorIdentity[] = []

  for (const identity of identities) {
    if (isAllowlisted(identity, allowlist)) {
      allowlisted.push(identity)
    } else {
      notAllowlisted.push(identity)
    }
  }

  return { allowlisted, notAllowlisted }
}
