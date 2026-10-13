/**
 * T2: Commit Collection with Full Pagination
 * 
 * Fetches all commits from a PR using paginated REST API.
 * GitHub REST API: max 250 commits per page.
 */

import * as core from '@actions/core'
import { CommitAuthor, AuthorIdentity } from '../interfaces'
import { toCommitAuthor } from '../typed-author/authorIdentity'

/**
 * GitHub REST API paginated commits endpoint
 */
export interface PaginationOptions {
  owner: string
  repo: string
  pull_number: number
  octokit: any
}

/**
 * Fetch all commits from a PR with full pagination
 * 
 * - Uses REST API: /repos/{owner}/{repo}/pulls/{pull_number}/commits
 * - Max 250 per page
 * - Iterates until no more commits
 * - Returns typed CommitAuthor[] with verified identities
 */
export async function fetchAllCommits(opts: PaginationOptions): Promise<CommitAuthor[]> {
  const { owner, repo, pull_number, octokit } = opts
  const allCommits: CommitAuthor[] = []
  let page = 1
  const per_page = 250

  try {
    while (true) {
      core.debug(`Fetching commits page ${page} (${per_page} per page)`)

      const response = await octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number,
        page,
        per_page
      })

      const commits = response.data || []
      
      if (!Array.isArray(commits) || commits.length === 0) {
        core.debug(`Page ${page} returned no commits, pagination complete`)
        break
      }

      core.debug(`Page ${page} returned ${commits.length} commits`)

      // Convert each commit to typed CommitAuthor
      for (const commit of commits) {
        try {
          const commitAuthor = toCommitAuthor(commit)
          allCommits.push(commitAuthor)
        } catch (e) {
          core.warning(`Failed to parse commit ${commit?.sha}: ${e}`)
        }
      }

      // If we got fewer than per_page, we've reached the end
      if (commits.length < per_page) {
        core.debug(`Page ${page} returned fewer than ${per_page} commits, stopping`)
        break
      }

      page++

      // Safety: stop if we've fetched more than 10000 commits (40 pages)
      if (page > 40) {
        core.error('Commit pagination exceeded 10000 commits, stopping to prevent runaway loop')
        break
      }
    }

    core.info(`Fetched ${allCommits.length} total commits from PR #${pull_number}`)
    return allCommits
  } catch (error) {
    throw new Error(`Failed to fetch commits: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Extract unique verified author identities from commit list
 */
export function extractVerifiedAuthors(commits: CommitAuthor[]): AuthorIdentity[] {
  const seen = new Set<number>()
  const verifiedAuthors: AuthorIdentity[] = []

  for (const commit of commits) {
    const { githubId, verified } = commit.authorIdentity
    
    // Only include verified identities with valid IDs
    if (verified && githubId > 0 && !seen.has(githubId)) {
      seen.add(githubId)
      verifiedAuthors.push(commit.authorIdentity)
    }
  }

  return verifiedAuthors
}
