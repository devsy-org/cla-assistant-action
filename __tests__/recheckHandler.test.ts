/**
 * T7: Regression Tests I17–I20
 * Event & Recheck Handling Tests
 */

import {
  RecheckStateStore,
  handleSynchronizeEvent,
  completeRecheck,
  shouldRecheck,
  getPRHeadSha,
  getEventAction
} from '../src/recheck/recheckHandler'

// Mock the GitHub context
jest.mock('@actions/github', () => ({
  context: {
    eventName: 'pull_request',
    payload: {
      action: 'synchronize',
      pull_request: {
        number: 1,
        head: {
          sha: 'newsha123'
        }
      }
    },
    repo: {
      owner: 'test',
      repo: 'test/repo'
    }
  }
}))

describe('Recheck Handling Tests (T6, I17–I20)', () => {
  let stateStore: RecheckStateStore

  beforeEach(() => {
    stateStore = new RecheckStateStore()
  })

  describe('I17: Synchronize event recheck', () => {
    it('should trigger recheck on synchronize event', () => {
      const currentHeadSha = 'newsha456'
      const lastCheckedSha = 'oldsha789'

      const shouldRecheckValue = shouldRecheck(
        'synchronize',
        currentHeadSha,
        lastCheckedSha
      )

      expect(shouldRecheckValue).toBe(true)
    })

    it('should always recheck on synchronize regardless of head change', () => {
      // Even with same head, synchronize always triggers recheck
      const sameSha = 'sha123'

      const shouldRecheckValue = shouldRecheck('synchronize', sameSha, sameSha)

      expect(shouldRecheckValue).toBe(true)
    })
  })

  describe('I18: Push event (single commit)', () => {
    it('should handle push event correctly', () => {
      const shouldRecheckValue = shouldRecheck('push', 'sha123', 'oldsha')

      // Push events don't automatically trigger recheck in our logic
      // (depends on implementation details)
      // But if head has changed, it should recheck
      expect(shouldRecheckValue).toBe(true)
    })

    it('should handle opened event', () => {
      const shouldRecheckValue = shouldRecheck('opened', 'sha123', undefined)

      expect(shouldRecheckValue).toBe(true)
    })
  })

  describe('I19: PR head commit changes detected & rechecked', () => {
    it('should detect when PR head has changed', () => {
      const oldHeadSha = 'oldsha123'
      const newHeadSha = 'newsha456'

      stateStore.setLastCheckedHead(oldHeadSha)

      expect(stateStore.isHeadChanged(newHeadSha)).toBe(true)
    })

    it('should recheck when head changes', () => {
      const oldHead = 'oldsha'
      const newHead = 'newsha'

      stateStore.setLastCheckedHead(oldHead)

      const shouldRecheckValue = shouldRecheck('synchronize', newHead, stateStore.getLastCheckedHead())

      expect(shouldRecheckValue).toBe(true)
      expect(stateStore.getLastCheckedHead()).toBe(oldHead)
    })

    it('should update state after recheck completes', () => {
      const newHeadSha = 'newsha789'

      completeRecheck(stateStore, newHeadSha)

      expect(stateStore.getLastCheckedHead()).toBe(newHeadSha)
      expect(stateStore.isRechecking()).toBe(false)
    })
  })

  describe('I20: No new commits (recheck skipped)', () => {
    it('should skip recheck if no head change and not synchronize event', () => {
      const sameSha = 'sha123'
      stateStore.setLastCheckedHead(sameSha)

      // Some arbitrary action that's not 'synchronize' or 'opened'
      const shouldRecheckValue = shouldRecheck('edited', sameSha, sameSha)

      expect(shouldRecheckValue).toBe(false)
    })

    it('should maintain state across checks', () => {
      const sha1 = 'sha1'
      completeRecheck(stateStore, sha1)

      expect(stateStore.getLastCheckedHead()).toBe(sha1)
      expect(stateStore.isRechecking()).toBe(false)

      const sha2 = 'sha2'
      completeRecheck(stateStore, sha2)

      expect(stateStore.getLastCheckedHead()).toBe(sha2)
    })
  })

  describe('RecheckStateStore', () => {
    it('should track recheck state', () => {
      expect(stateStore.isRechecking()).toBe(false)

      stateStore.setRechecking(true)
      expect(stateStore.isRechecking()).toBe(true)

      stateStore.setRechecking(false)
      expect(stateStore.isRechecking()).toBe(false)
    })

    it('should track last checked head SHA', () => {
      expect(stateStore.getLastCheckedHead()).toBeUndefined()

      stateStore.setLastCheckedHead('sha123')
      expect(stateStore.getLastCheckedHead()).toBe('sha123')

      stateStore.setLastCheckedHead('sha456')
      expect(stateStore.getLastCheckedHead()).toBe('sha456')
    })

    it('should clear state', () => {
      stateStore.setLastCheckedHead('sha123')
      stateStore.setRechecking(true)

      stateStore.clear()

      expect(stateStore.getLastCheckedHead()).toBeUndefined()
      expect(stateStore.isRechecking()).toBe(false)
    })

    it('should detect head changes', () => {
      stateStore.setLastCheckedHead('oldsha')

      expect(stateStore.isHeadChanged('oldsha')).toBe(false)
      expect(stateStore.isHeadChanged('newsha')).toBe(true)
    })

    it('should always consider no prior check as head change', () => {
      // No prior check
      expect(stateStore.isHeadChanged('anysha')).toBe(true)
    })
  })

  describe('shouldRecheck behavior', () => {
    it('should recheck on opened event', () => {
      expect(shouldRecheck('opened', 'sha123', 'oldsha')).toBe(true)
      expect(shouldRecheck('opened', 'sha123', undefined)).toBe(true)
    })

    it('should not recheck if no change and action is not special', () => {
      expect(shouldRecheck('edited', 'sha123', 'sha123')).toBe(false)
      expect(shouldRecheck('labeled', 'sha123', 'sha123')).toBe(false)
    })

    it('should recheck if head changed regardless of action', () => {
      expect(shouldRecheck('edited', 'newsha', 'oldsha')).toBe(true)
      expect(shouldRecheck('labeled', 'newsha', 'oldsha')).toBe(true)
    })
  })
})
