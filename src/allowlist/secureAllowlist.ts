import * as core from '@actions/core'
import { AuthorIdentity } from '../interfaces'
import { isVerifiedIdentity } from '../typed-author/authorIdentity'

export interface AllowlistConfig {
  githubIds: number[]
}

export function isAllowlisted(identity: AuthorIdentity, allowlist: AllowlistConfig): boolean {
  if (!isVerifiedIdentity(identity)) {
    core.debug(`Identity ${identity.name} is not verified (no GitHub ID), rejecting from allowlist`)
    return false
  }

  const isListed = allowlist.githubIds.includes(identity.githubId)
  
  if (isListed) {
    core.info(`Author ${identity.name} (ID: ${identity.githubId}) is allowlisted`)
  } else {
    core.debug(`Author ${identity.name} (ID: ${identity.githubId}) is NOT allowlisted`)
  }

  return isListed
}

export function areAllAllowlisted(
  identities: AuthorIdentity[],
  allowlist: AllowlistConfig
): boolean {
  if (identities.length === 0) {
    return false
  }

  return identities.every(identity => isAllowlisted(identity, allowlist))
}

export function parseAllowlist(input?: string): AllowlistConfig {
  if (!input || input.trim() === '') {
    return { githubIds: [] }
  }

  try {
    const parsed = JSON.parse(input)
    if (!Array.isArray(parsed)) {
      throw new Error('Allowlist must be an array')
    }

    const githubIds = parsed.filter((id): id is number => typeof id === 'number' && id > 0)
    if (githubIds.length !== parsed.length) {
      core.warning('Allowlist contained non-numeric IDs, filtering to valid IDs only')
    }

    return { githubIds }
  } catch (e) {
    throw new Error(`Invalid allowlist format: ${e instanceof Error ? e.message : String(e)}`)
  }
}

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
