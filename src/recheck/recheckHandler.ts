/**
 * T6: Event & Recheck Handling
 * 
 * Handles synchronize and push events with deterministic recheck at PR head.
 * Implements idempotent recheck state to avoid duplicate processing.
 */

import * as core from '@actions/core'
import { context } from '@actions/github'

/**
 * Recheck state tracking
 */
export interface RecheckState {
  lastCheckedHeadSha?: string
  lastCheckTime?: number
  isRechecking: boolean
}

/**
 * In-memory recheck state store
 * In production, this should be persisted (e.g., in GitHub annotations, files, etc.)
 */
export class RecheckStateStore {
  private state: RecheckState = {
    isRechecking: false
  }

  setState(newState: Partial<RecheckState>): void {
    this.state = { ...this.state, ...newState }
  }

  getState(): RecheckState {
    return { ...this.state }
  }

  setRechecking(isRechecking: boolean): void {
    this.state.isRechecking = isRechecking
  }

  isRechecking(): boolean {
    return this.state.isRechecking
  }

  setLastCheckedHead(sha: string): void {
    this.state.lastCheckedHeadSha = sha
    this.state.lastCheckTime = Date.now()
  }

  getLastCheckedHead(): string | undefined {
    return this.state.lastCheckedHeadSha
  }

  isHeadChanged(currentHeadSha: string): boolean {
    const lastHead = this.getLastCheckedHead()
    return !lastHead || lastHead !== currentHeadSha
  }

  clear(): void {
    this.state = { isRechecking: false }
  }
}

/**
 * Get PR head SHA from GitHub context
 */
export function getPRHeadSha(): string | undefined {
  // For pull_request event
  if (context.payload.pull_request) {
    return context.payload.pull_request.head.sha
  }

  // For push event on a PR branch
  if (context.payload.ref && context.payload.after) {
    return context.payload.after
  }

  return undefined
}

/**
 * Determine if we should trigger a full recheck
 * 
 * Recheck happens when:
 * 1. Event is 'synchronize' (new commits pushed)
 * 2. Event is 'opened' (PR created)
 * 3. PR head SHA has changed since last check
 */
export function shouldRecheck(
  action: string | undefined,
  currentHeadSha: string,
  lastCheckedSha: string | undefined
): boolean {
  // Always recheck on these events
  if (action === 'synchronize' || action === 'opened') {
    core.info(`Recheck triggered by event: ${action}`)
    return true
  }

  // Check if head has changed
  if (lastCheckedSha && currentHeadSha !== lastCheckedSha) {
    core.info(`Recheck triggered: PR head changed from ${lastCheckedSha} to ${currentHeadSha}`)
    return true
  }

  core.debug(`No recheck needed: same head SHA`)
  return false
}

/**
 * Get event action from GitHub context
 */
export function getEventAction(): string | undefined {
  const action = context.payload.action
  if (typeof action === 'string') {
    return action
  }
  return undefined
}

/**
 * Check if this is a pull_request event
 */
export function isPullRequestEvent(): boolean {
  return context.eventName === 'pull_request'
}

/**
 * Check if this is a push event
 */
export function isPushEvent(): boolean {
  return context.eventName === 'push'
}

/**
 * Determine the PR number from context
 * (Returns undefined for non-PR events)
 */
export function getPRNumber(): number | undefined {
  if (context.payload.pull_request) {
    return context.payload.pull_request.number
  }

  if (context.payload.number) {
    return context.payload.number
  }

  return undefined
}

/**
 * Determine the repository owner and name from context
 */
export function getRepositoryInfo(): { owner: string; repo: string } {
  const [owner, repo] = context.repo.repo.split('/').reverse()
  return {
    owner: context.repo.owner,
    repo: context.repo.repo.split('/').pop() || ''
  }
}

/**
 * Handle PR synchronize event (new commits)
 * Returns true if a full recheck should be performed
 */
export function handleSynchronizeEvent(stateStore: RecheckStateStore): boolean {
  core.info('Handling synchronize event (PR updated with new commits)')

  const currentHeadSha = getPRHeadSha()
  if (!currentHeadSha) {
    core.error('Could not determine PR head SHA')
    return false
  }

  const shouldRecheckValue = shouldRecheck(
    getEventAction(),
    currentHeadSha,
    stateStore.getLastCheckedHead()
  )

  if (shouldRecheckValue) {
    core.info(`Starting recheck for new commits`)
    stateStore.setRechecking(true)
  }

  return shouldRecheckValue
}

/**
 * Mark recheck as complete
 */
export function completeRecheck(stateStore: RecheckStateStore, headSha: string): void {
  core.info(`Recheck complete, updating head to ${headSha}`)
  stateStore.setLastCheckedHead(headSha)
  stateStore.setRechecking(false)
}

/**
 * Validate that recheck can proceed
 */
export function validateRecheckState(stateStore: RecheckStateStore): boolean {
  if (stateStore.isRechecking()) {
    core.warning('Recheck already in progress')
    return false
  }

  return true
}
