/**
 * T7: Regression Tests I11–I16
 * Allowlist Security & Signature Persistence
 */

import {
  isAllowlisted,
  areAllAllowlisted,
  parseAllowlist,
  partitionByAllowlist,
  AllowlistConfig
} from '../src/allowlist/secureAllowlist'
import {
  InMemorySignatureStore,
  atomicPersistSignature,
  atomicBatchPersist
} from '../src/signature/signaturePersistence'
import { AuthorIdentity } from '../src/interfaces'

describe('Secure Allowlist Tests (T3, I14–I16)', () => {
  let allowlist: AllowlistConfig

  beforeEach(() => {
    allowlist = {
      githubIds: [100, 200, 300]
    }
  })

  describe('I14: ID allowlist match', () => {
    it('should mark user as signed when ID is in allowlist', () => {
      const identity: AuthorIdentity = {
        name: 'Allowlisted User',
        githubId: 100,
        verified: true
      }

      expect(isAllowlisted(identity, allowlist)).toBe(true)
    })
  })

  describe('I15: ID allowlist miss', () => {
    it('should mark user as not signed when ID is NOT in allowlist', () => {
      const identity: AuthorIdentity = {
        name: 'Not Allowlisted',
        githubId: 999,
        verified: true
      }

      expect(isAllowlisted(identity, allowlist)).toBe(false)
    })
  })

  describe('I16: Empty allowlist', () => {
    it('should mark all as unsigned when allowlist is empty', () => {
      const emptyList: AllowlistConfig = { githubIds: [] }

      const identity1: AuthorIdentity = {
        name: 'User 1',
        githubId: 1,
        verified: true
      }
      const identity2: AuthorIdentity = {
        name: 'User 2',
        githubId: 2,
        verified: true
      }

      expect(isAllowlisted(identity1, emptyList)).toBe(false)
      expect(isAllowlisted(identity2, emptyList)).toBe(false)
    })
  })

  describe('Name-based bypass prevention', () => {
    it('should reject allowlist bypass via name spoofing', () => {
      const allowlistedIdentity: AuthorIdentity = {
        name: 'John Developer',
        githubId: 100,
        verified: true
      }

      const spoofer: AuthorIdentity = {
        name: 'John Developer', // Same name!
        githubId: 999, // Different ID
        verified: true
      }

      expect(isAllowlisted(allowlistedIdentity, allowlist)).toBe(true)
      expect(isAllowlisted(spoofer, allowlist)).toBe(false) // Rejected despite same name
    })
  })

  describe('Fail-closed on missing verification', () => {
    it('should reject unverified identities even if ID matches allowlist', () => {
      const unverified: AuthorIdentity = {
        name: 'Spoofed User',
        githubId: 100, // ID is in allowlist
        verified: false // But not verified
      }

      expect(isAllowlisted(unverified, allowlist)).toBe(false)
    })
  })

  describe('parseAllowlist', () => {
    it('should parse JSON array of IDs', () => {
      const parsed = parseAllowlist('[123, 456, 789]')
      expect(parsed.githubIds).toEqual([123, 456, 789])
    })

    it('should handle empty string', () => {
      const parsed = parseAllowlist('')
      expect(parsed.githubIds).toEqual([])
    })

    it('should handle undefined', () => {
      const parsed = parseAllowlist(undefined)
      expect(parsed.githubIds).toEqual([])
    })

    it('should filter out invalid IDs', () => {
      const parsed = parseAllowlist('[123, "invalid", 456, -1, null]')
      expect(parsed.githubIds).toEqual([123, 456])
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseAllowlist('not json')).toThrow()
    })
  })

  describe('partitionByAllowlist', () => {
    it('should separate allowlisted and non-allowlisted identities', () => {
      const identities: AuthorIdentity[] = [
        { name: 'A', githubId: 100, verified: true },
        { name: 'B', githubId: 999, verified: true },
        { name: 'C', githubId: 200, verified: true }
      ]

      const { allowlisted, notAllowlisted } = partitionByAllowlist(identities, allowlist)

      expect(allowlisted).toHaveLength(2)
      expect(notAllowlisted).toHaveLength(1)
      expect(allowlisted[0].githubId).toBe(100)
      expect(allowlisted[1].githubId).toBe(200)
      expect(notAllowlisted[0].githubId).toBe(999)
    })
  })
})

describe('Signature Persistence Tests (T4, I11–I13)', () => {
  let store: InMemorySignatureStore

  beforeEach(() => {
    store = new InMemorySignatureStore()
  })

  describe('I11: Persist before success', () => {
    it('should persist signature atomically', async () => {
      let persistCalled = false

      const mockStore = {
        persistSignature: jest.fn(async () => {
          persistCalled = true
        })
      }

      await atomicPersistSignature(mockStore, 1, 'abc123')

      expect(persistCalled).toBe(true)
      expect(mockStore.persistSignature).toHaveBeenCalledWith(1, 'abc123')
    })

    it('should call persistence before allowing success', async () => {
      const callOrder: string[] = []

      const mockStore = {
        persistSignature: jest.fn(async () => {
          callOrder.push('persist')
        })
      }

      callOrder.push('start')
      await atomicPersistSignature(mockStore, 1, 'abc123')
      callOrder.push('success')

      expect(callOrder).toEqual(['start', 'persist', 'success'])
    })
  })

  describe('I12: Storage fails, operation fails atomically', () => {
    it('should throw if persistence fails', async () => {
      const mockStore = {
        persistSignature: jest.fn(async () => {
          throw new Error('Storage unreachable')
        })
      }

      await expect(atomicPersistSignature(mockStore, 1, 'abc123')).rejects.toThrow(
        'Signature persistence failed'
      )
    })

    it('should not proceed with success if persistence fails', async () => {
      const mockStore = {
        persistSignature: jest.fn(async () => {
          throw new Error('Storage error')
        })
      }

      let successReached = false
      try {
        await atomicPersistSignature(mockStore, 1, 'abc123')
        successReached = true
      } catch {
        // Expected
      }

      expect(successReached).toBe(false)
    })
  })

  describe('I13: Duplicate signature (idempotent)', () => {
    it('should handle duplicate signatures without error', async () => {
      await atomicPersistSignature(store, 1, 'abc123', 'test')
      // Persisting again should not error
      await atomicPersistSignature(store, 1, 'abc123', 'test')

      expect(await store.hasSignature(1, 'abc123')).toBe(true)
    })

    it('should support batch persistence', async () => {
      const signatures = [
        { userId: 1, commitSha: 'sha1' },
        { userId: 2, commitSha: 'sha2' },
        { userId: 3, commitSha: 'sha3' }
      ]

      await atomicBatchPersist(store, signatures)

      for (const { userId, commitSha } of signatures) {
        expect(await store.hasSignature(userId, commitSha)).toBe(true)
      }
    })

    it('should handle empty signature list', async () => {
      // Should not throw
      await atomicBatchPersist(store, [])
    })

    it('should fail atomically on batch error', async () => {
      const mockStore = {
        persistSignature: jest.fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Batch failed on item 2'))
      }

      const signatures = [
        { userId: 1, commitSha: 'sha1' },
        { userId: 2, commitSha: 'sha2' }
      ]

      await expect(atomicBatchPersist(mockStore, signatures)).rejects.toThrow()
    })
  })
})
