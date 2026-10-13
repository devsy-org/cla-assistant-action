import * as core from '@actions/core'
import { context } from '@actions/github'

export interface RecheckState {
  lastCheckedHeadSha?: string
  lastCheckTime?: number
  isRechecking: boolean
}

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

export function getPRHeadSha(): string | undefined {
  if (context.payload.pull_request) {
    return context.payload.pull_request.head.sha
  }

  if (context.payload.ref && context.payload.after) {
    return context.payload.after
  }

  return undefined
}

export function shouldRecheck(
  action: string | undefined,
  currentHeadSha: string,
  lastCheckedSha: string | undefined
): boolean {
  if (action === 'synchronize' || action === 'opened') {
    core.info(`Recheck triggered by event: ${action}`)
    return true
  }

  if (lastCheckedSha && currentHeadSha !== lastCheckedSha) {
    core.info(`Recheck triggered: PR head changed from ${lastCheckedSha} to ${currentHeadSha}`)
    return true
  }

  core.debug(`No recheck needed: same head SHA`)
  return false
}

export function getEventAction(): string | undefined {
  const action = context.payload.action
  if (typeof action === 'string') {
    return action
  }
  return undefined
}

export function isPullRequestEvent(): boolean {
  return context.eventName === 'pull_request'
}

export function isPushEvent(): boolean {
  return context.eventName === 'push'
}

export function getPRNumber(): number | undefined {
  if (context.payload.pull_request) {
    return context.payload.pull_request.number
  }

  if (context.payload.number) {
    return context.payload.number
  }

  return undefined
}

export function getRepositoryInfo(): { owner: string; repo: string } {
  const [owner, repo] = context.repo.repo.split('/').reverse()
  return {
    owner: context.repo.owner,
    repo: context.repo.repo.split('/').pop() || ''
  }
}

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

export function completeRecheck(stateStore: RecheckStateStore, headSha: string): void {
  core.info(`Recheck complete, updating head to ${headSha}`)
  stateStore.setLastCheckedHead(headSha)
  stateStore.setRechecking(false)
}

export function validateRecheckState(stateStore: RecheckStateStore): boolean {
  if (stateStore.isRechecking()) {
    core.warning('Recheck already in progress')
    return false
  }

  return true
}
