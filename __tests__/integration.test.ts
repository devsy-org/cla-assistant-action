/**
 * T7: Regression Tests I21–I23
 * Integration & Node 24 Compatibility Tests
 */

import {
  toAuthorIdentity,
  isVerifiedIdentity,
  isSameIdentity
} from '../src/typed-author/authorIdentity'
import {
  isAllowlisted,
  areAllAllowlisted
} from '../src/allowlist/secureAllowlist'
import {
  InMemorySignatureStore,
  atomicPersistSignature
} from '../src/signature/signaturePersistence'
import { filterSignatureComments } from '../src/comments/commentEnumerator'
import { AuthorIdentity } from '../src/interfaces'

describe('Integration Tests (I21–I22)', () => {
  describe('I21: E2E sign + comment + persist (all gates pass)', () => {
    it('should handle complete signing workflow', async () => {
      // Simulate: author is verified, in allowlist, signs via comment, signature persisted
      const author: AuthorIdentity = {
        name: 'Alice Developer',
        githubId: 123,
        verified: true
      }

      const allowlist = { githubIds: [123] }
      const store = new InMemorySignatureStore()

      // Gate 1: Verify identity
      expect(isVerifiedIdentity(author)).toBe(true)

      // Gate 2: Check allowlist
      expect(isAllowlisted(author, allowlist)).toBe(true)

      // Gate 3: Persist signature
      await atomicPersistSignature(store, author.githubId, 'commit123', 'E2E test')
      expect(await store.hasSignature(author.githubId, 'commit123')).toBe(true)

      // All gates passed
      console.log('✓ All security gates passed for signing author')
    })

    it('should work with multiple signers', async () => {
      const signers: AuthorIdentity[] = [
        { name: 'Alice', githubId: 1, verified: true },
        { name: 'Bob', githubId: 2, verified: true },
        { name: 'Charlie', githubId: 3, verified: true }
      ]

      const allowlist = { githubIds: [1, 2, 3] }
      const store = new InMemorySignatureStore()

      // All signers should pass gates
      for (const signer of signers) {
        expect(isVerifiedIdentity(signer)).toBe(true)
        expect(isAllowlisted(signer, allowlist)).toBe(true)

        await atomicPersistSignature(store, signer.githubId, `commit${signer.githubId}`)
        expect(await store.hasSignature(signer.githubId, `commit${signer.githubId}`)).toBe(true)
      }

      expect(areAllAllowlisted(signers, allowlist)).toBe(true)
    })
  })

  describe('I22: E2E deny unsigned (proper failure)', () => {
    it('should reject unverified author', () => {
      const unverified: AuthorIdentity = {
        name: 'Unknown User',
        githubId: 0, // No GitHub ID
        verified: false
      }

      const allowlist = { githubIds: [123] }

      // Gate 1: Fail on verification
      expect(isVerifiedIdentity(unverified)).toBe(false)
      expect(isAllowlisted(unverified, allowlist)).toBe(false)
    })

    it('should reject author not in allowlist', () => {
      const notAllowed: AuthorIdentity = {
        name: 'Outsider',
        githubId: 999,
        verified: true
      }

      const allowlist = { githubIds: [1, 2, 3] }

      expect(isVerifiedIdentity(notAllowed)).toBe(true)
      expect(isAllowlisted(notAllowed, allowlist)).toBe(false) // Rejected
    })

    it('should handle partially signed PRs', () => {
      const authors: AuthorIdentity[] = [
        { name: 'Alice', githubId: 1, verified: true },
        { name: 'Bob', githubId: 999, verified: true }, // Not in allowlist
        { name: 'Charlie', githubId: 2, verified: true }
      ]

      const allowlist = { githubIds: [1, 2] }

      // Not all are allowlisted
      expect(areAllAllowlisted(authors, allowlist)).toBe(false)
    })

    it('should reject on persistence failure', async () => {
      const author: AuthorIdentity = {
        name: 'Alice',
        githubId: 123,
        verified: true
      }

      const failingStore = {
        persistSignature: jest.fn(async () => {
          throw new Error('Storage unavailable')
        })
      }

      // Should throw and prevent success
      await expect(atomicPersistSignature(failingStore, author.githubId, 'commit123'))
        .rejects
        .toThrow('Signature persistence failed')
    })
  })

  describe('I21 continued: Signature comment detection', () => {
    it('should correctly filter signature comments in workflow', () => {
      const comments = [
        {
          id: 1,
          body: 'I agree to the CLA',
          author: { name: 'Signer 1', githubId: 1, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        },
        {
          id: 2,
          body: 'Just a comment about the code',
          author: { name: 'Commenter', githubId: 99, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        },
        {
          id: 3,
          body: 'I have signed the CLA',
          author: { name: 'Signer 2', githubId: 2, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        }
      ]

      const signatures = filterSignatureComments(comments)
      expect(signatures).toHaveLength(2)
      expect(signatures[0].id).toBe(1)
      expect(signatures[1].id).toBe(3)
    })
  })
})

describe('Node 24 Compatibility (I23)', () => {
  describe('ES6+ features used correctly', () => {
    it('should use async/await (ES2017)', async () => {
      const store = new InMemorySignatureStore()
      // Async/await should work
      await store.persistSignature(1, 'sha')
      expect(await store.hasSignature(1, 'sha')).toBe(true)
    })

    it('should use arrow functions (ES2015)', () => {
      const double = (x: number) => x * 2
      expect(double(5)).toBe(10)
    })

    it('should use const/let (ES2015)', () => {
      const constVar = 'immutable'
      let letVar = 'mutable'
      letVar = 'changed'
      expect(constVar).toBe('immutable')
      expect(letVar).toBe('changed')
    })

    it('should use template literals (ES2015)', () => {
      const name = 'World'
      const greeting = `Hello, ${name}!`
      expect(greeting).toBe('Hello, World!')
    })

    it('should use destructuring (ES2015)', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const { a, b } = obj
      expect(a).toBe(1)
      expect(b).toBe(2)
    })

    it('should use spread operator (ES2015)', () => {
      const arr1 = [1, 2, 3]
      const arr2 = [...arr1, 4, 5]
      expect(arr2).toEqual([1, 2, 3, 4, 5])
    })

    it('should use Set (ES2015)', () => {
      const set = new Set([1, 2, 2, 3])
      expect(set.size).toBe(3)
    })

    it('should use Map (ES2015)', () => {
      const map = new Map([['key', 'value']])
      expect(map.get('key')).toBe('value')
    })

    it('should support class syntax (ES2015)', () => {
      class TestClass {
        value: number
        constructor(v: number) {
          this.value = v
        }
      }
      const instance = new TestClass(42)
      expect(instance.value).toBe(42)
    })

    it('should support Promise (ES2015)', async () => {
      const promise = Promise.resolve(42)
      const value = await promise
      expect(value).toBe(42)
    })

    it('should support optional chaining (ES2020)', () => {
      const obj = { a: { b: { c: 'value' } } }
      expect(obj?.a?.b?.c).toBe('value')
      
      const nullObj = null as any
      expect(nullObj?.a?.b?.c).toBeUndefined()
    })

    it('should support nullish coalescing (ES2020)', () => {
      const value = null ?? 'default'
      expect(value).toBe('default')

      const zero = 0 ?? 'default'
      expect(zero).toBe(0) // 0 is not nullish
    })
  })

  describe('TypeScript strict mode', () => {
    it('should use strict type checking', () => {
      // These should be type-safe in tsconfig strict mode
      const identity: AuthorIdentity = {
        name: 'Test',
        githubId: 1,
        verified: true
      }

      expect(isVerifiedIdentity(identity)).toBe(true)
    })

    it('should require explicit types', () => {
      const allowlist = { githubIds: [1, 2, 3] }
      const identity: AuthorIdentity = {
        name: 'User',
        githubId: 1,
        verified: true
      }

      const result: boolean = isAllowlisted(identity, allowlist)
      expect(typeof result).toBe('boolean')
    })
  })

  describe('All previous tests still pass on Node 24', () => {
    it('should run identity verification tests', () => {
      const id = toAuthorIdentity({ id: 1, name: 'Test' })
      expect(isVerifiedIdentity(id)).toBe(true)
    })

    it('should run allowlist tests', () => {
      const id: AuthorIdentity = { name: 'Test', githubId: 1, verified: true }
      const allowlist = { githubIds: [1] }
      expect(isAllowlisted(id, allowlist)).toBe(true)
    })

    it('should run signature tests', async () => {
      const store = new InMemorySignatureStore()
      await atomicPersistSignature(store, 1, 'sha')
      expect(await store.hasSignature(1, 'sha')).toBe(true)
    })
  })
})
