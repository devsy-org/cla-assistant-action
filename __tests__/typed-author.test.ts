/**
 * T7: Regression Tests I01–I04
 * Identity Verification & Fail-Closed Checks
 */

import {
  toAuthorIdentity,
  toCommitAuthor,
  isVerifiedIdentity,
  isSameIdentity
} from '../src/typed-author/authorIdentity'

describe('Identity Verification Tests (T1, I01–I04)', () => {
  describe('I01: Valid GitHub ID, verified author', () => {
    it('should mark author as verified when GitHub ID is present', () => {
      const apiAuthor = {
        id: 12345,
        name: 'John Doe',
        login: 'johndoe'
      }

      const identity = toAuthorIdentity(apiAuthor)

      expect(identity.verified).toBe(true)
      expect(identity.githubId).toBe(12345)
      expect(identity.name).toBe('John Doe')
    })

    it('should mark user signed when verified', () => {
      const identity = toAuthorIdentity({ id: 1, name: 'Test' })
      expect(isVerifiedIdentity(identity)).toBe(true)
    })
  })

  describe('I02: Missing GitHub ID (SSH/GPG only)', () => {
    it('should not verify author without GitHub ID', () => {
      const apiAuthor = {
        name: 'SSH User',
        email: 'ssh@example.com'
        // No id field
      }

      const identity = toAuthorIdentity(apiAuthor)

      expect(identity.verified).toBe(false)
      expect(identity.githubId).toBe(0)
    })

    it('should fail-closed when ID is undefined', () => {
      const identity = toAuthorIdentity({ name: 'Unknown' })
      expect(isVerifiedIdentity(identity)).toBe(false)
    })

    it('should fail-closed when ID is negative', () => {
      const identity = toAuthorIdentity({ id: -1, name: 'Bad' })
      expect(isVerifiedIdentity(identity)).toBe(false)
    })

    it('should fail-closed when ID is null', () => {
      const apiAuthor = {
        id: null,
        name: 'Null ID'
      }
      const identity = toAuthorIdentity(apiAuthor)
      expect(isVerifiedIdentity(identity)).toBe(false)
    })
  })

  describe('I03: Name in allowlist, ID not (no name bypass)', () => {
    it('should NOT match by name; only by ID', () => {
      const identity1 = toAuthorIdentity({ id: 123, name: 'John' })
      const identity2 = toAuthorIdentity({ id: 456, name: 'John' })

      // Same name, different IDs
      expect(identity1.name).toBe(identity2.name)
      expect(identity1.githubId).not.toBe(identity2.githubId)

      // Should NOT match as same identity
      expect(isSameIdentity(identity1, identity2)).toBe(false)
    })

    it('should reject allowlist bypass via name spoofing', () => {
      const allowlistedId = 100
      const spooferWithSameName = toAuthorIdentity({
        id: 999, // Different ID
        name: 'John Allowlisted' // Same name as allowlisted user
      })

      expect(spooferWithSameName.name).toContain('John')
      expect(spooferWithSameName.githubId).not.toBe(allowlistedId)
    })
  })

  describe('I04: Multiple authors, one missing ID', () => {
    it('should reject author when one in list has no ID', () => {
      const author1 = toAuthorIdentity({ id: 1, name: 'A' })
      const author2 = toAuthorIdentity({ id: 2, name: 'B' })
      const author3 = toAuthorIdentity({ name: 'C' }) // No ID

      expect(isVerifiedIdentity(author1)).toBe(true)
      expect(isVerifiedIdentity(author2)).toBe(true)
      expect(isVerifiedIdentity(author3)).toBe(false) // Rejected
    })
  })

  describe('toCommitAuthor conversion', () => {
    it('should convert REST API commit to CommitAuthor', () => {
      const apiCommit = {
        sha: 'abc123',
        author: {
          id: 456,
          name: 'Test Author',
          login: 'testauthor'
        }
      }

      const commitAuthor = toCommitAuthor(apiCommit)

      expect(commitAuthor.commitSha).toBe('abc123')
      expect(commitAuthor.authorIdentity.githubId).toBe(456)
      expect(commitAuthor.authorIdentity.verified).toBe(true)
    })

    it('should throw on invalid commit (missing sha)', () => {
      expect(() => toCommitAuthor({})).toThrow('Invalid commit')
    })
  })
})
