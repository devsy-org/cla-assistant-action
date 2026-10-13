/**
 * T1: Typed Author Model - Type conversions & verification
 * 
 * Provides type-safe conversion from REST API responses to AuthorIdentity,
 * with fail-closed identity verification.
 */

import { AuthorIdentity, CommitAuthor } from '../interfaces'

/**
 * Convert REST API commit author to typed AuthorIdentity
 * 
 * Fail-closed: Returns verified=false if GitHub ID is missing or invalid
 * Only GitHub API responses with numeric user.id count as verified
 */
export function toAuthorIdentity(apiAuthor: any): AuthorIdentity {
  if (!apiAuthor) {
    return {
      name: 'Unknown',
      githubId: 0,
      verified: false
    }
  }

  const githubId = apiAuthor.id ?? apiAuthor.user?.id ?? 0
  const name = apiAuthor.name ?? apiAuthor.login ?? 'Unknown'
  
  // Fail-closed: Only accept numeric GitHub IDs
  const verified = typeof githubId === 'number' && githubId > 0

  return {
    name,
    githubId,
    verified
  }
}

/**
 * Convert REST API commit response to CommitAuthor
 * 
 * Expects standard GitHub REST API commit object:
 * {
 *   sha: string,
 *   commit: { author: { name, email }, ... },
 *   author: { id, login, ... }
 * }
 */
export function toCommitAuthor(apiCommit: any): CommitAuthor {
  if (!apiCommit || !apiCommit.sha) {
    throw new Error('Invalid commit: missing sha')
  }

  // Prefer author.id from REST API (the verified ID)
  // Fall back to commit.author if no REST author data
  const authorData = apiCommit.author || apiCommit.commit?.author || {}
  const authorIdentity = toAuthorIdentity(authorData)

  return {
    authorIdentity,
    commitSha: apiCommit.sha
  }
}

/**
 * Check if an identity is verified with a valid GitHub ID
 */
export function isVerifiedIdentity(identity: AuthorIdentity): boolean {
  return identity.verified && identity.githubId > 0
}

/**
 * Check if two identities refer to the same person (by GitHub ID)
 * 
 * Fail-closed: Unverified identities never match
 */
export function isSameIdentity(id1: AuthorIdentity, id2: AuthorIdentity): boolean {
  // Both must be verified
  if (!isVerifiedIdentity(id1) || !isVerifiedIdentity(id2)) {
    return false
  }
  
  // Compare GitHub IDs
  return id1.githubId === id2.githubId
}
