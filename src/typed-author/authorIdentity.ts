import { AuthorIdentity, CommitAuthor } from '../interfaces'

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
  
  const verified = typeof githubId === 'number' && githubId > 0

  return {
    name,
    githubId,
    verified
  }
}

export function toCommitAuthor(apiCommit: any): CommitAuthor {
  if (!apiCommit || !apiCommit.sha) {
    throw new Error('Invalid commit: missing sha')
  }

  const authorData = apiCommit.author || apiCommit.commit?.author || {}
  const authorIdentity = toAuthorIdentity(authorData)

  return {
    authorIdentity,
    commitSha: apiCommit.sha
  }
}

export function isVerifiedIdentity(identity: AuthorIdentity): boolean {
  return identity.verified && identity.githubId > 0
}

export function isSameIdentity(id1: AuthorIdentity, id2: AuthorIdentity): boolean {
  if (!isVerifiedIdentity(id1) || !isVerifiedIdentity(id2)) {
    return false
  }
  
  return id1.githubId === id2.githubId
}
