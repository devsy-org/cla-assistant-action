import * as core from '@actions/core'

export interface SignatureStorage {
  persistSignature(userId: number, commitSha: string): Promise<void>
}

export class InMemorySignatureStore implements SignatureStorage {
  private signatures = new Map<string, Set<string>>()

  async persistSignature(userId: number, commitSha: string): Promise<void> {
    const key = `user:${userId}`
    if (!this.signatures.has(key)) {
      this.signatures.set(key, new Set())
    }
    this.signatures.get(key)!.add(commitSha)
    core.debug(`[InMemory] Persisted signature for user ${userId}, commit ${commitSha}`)
  }

  async hasSignature(userId: number, commitSha: string): Promise<boolean> {
    const key = `user:${userId}`
    return this.signatures.has(key) && this.signatures.get(key)!.has(commitSha)
  }

  clear(): void {
    this.signatures.clear()
  }
}

export class GitHubSignatureStore implements SignatureStorage {
  constructor(
    private octokit: any,
    private owner: string,
    private repo: string,
    private branch: string = 'cla-signatures'
  ) {}

  async persistSignature(userId: number, commitSha: string): Promise<void> {
    try {
      const path = `signatures/${userId}/${commitSha}.txt`
      const content = Buffer.from(`${userId}:${commitSha}:${new Date().toISOString()}`).toString('base64')

      core.debug(`[GitHub] Persisting signature to ${path}`)

      let sha: string | undefined
      try {
        const existing = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
          ref: this.branch
        })
        sha = existing.data.sha
      } catch {
      }

      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: `CLA signature for user ${userId} on commit ${commitSha}`,
        content,
        branch: this.branch,
        ...(sha ? { sha } : {})
      })

      core.info(`[GitHub] Persisted signature to ${path}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to persist signature to GitHub: ${message}`)
    }
  }
}

export function createDefaultSignatureStore(octokit: any, owner: string, repo: string): SignatureStorage {
  return new GitHubSignatureStore(octokit, owner, repo)
}

export async function atomicPersistSignature(
  storage: SignatureStorage,
  userId: number,
  commitSha: string,
  operationName: string = 'CLA signature'
): Promise<void> {
  try {
    core.info(`Persisting ${operationName} for user ${userId} on commit ${commitSha}`)
    await storage.persistSignature(userId, commitSha)
    core.info(`Successfully persisted ${operationName}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.error(`CRITICAL: Failed to persist ${operationName}: ${message}`)
    throw new Error(`Signature persistence failed; operation aborted: ${message}`)
  }
}

export async function atomicBatchPersist(
  storage: SignatureStorage,
  signatures: Array<{ userId: number; commitSha: string }>
): Promise<void> {
  if (signatures.length === 0) {
    return
  }

  try {
    core.info(`Persisting ${signatures.length} signatures atomically`)

    for (const { userId, commitSha } of signatures) {
      await storage.persistSignature(userId, commitSha)
    }

    core.info(`Successfully persisted all ${signatures.length} signatures`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.error(`CRITICAL: Batch persistence failed, no signatures were saved: ${message}`)
    throw new Error(`Batch signature persistence failed: ${message}`)
  }
}
