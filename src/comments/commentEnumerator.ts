/**
 * T5: Comment Enumeration with Full Pagination
 * 
 * Fetches all PR comments with full pagination.
 * GitHub REST API: max 30 comments per page.
 */

import * as core from '@actions/core'
import { AuthorIdentity } from '../interfaces'
import { toAuthorIdentity } from '../typed-author/authorIdentity'

/**
 * Signature comment type
 */
export interface SignatureComment {
  id: number
  body: string
  author: AuthorIdentity
  created_at: string
  updated_at: string
  pr_number: number
}

/**
 * Options for fetching comments
 */
export interface CommentFetchOptions {
  owner: string
  repo: string
  issue_number: number // PR number
  octokit: any
}

/**
 * Fetch all comments from a PR with full pagination
 * 
 * - Uses REST API: /repos/{owner}/{repo}/issues/{issue_number}/comments
 * - Max 30 per page
 * - Returns all comments as typed objects
 */
export async function getAllComments(opts: CommentFetchOptions): Promise<SignatureComment[]> {
  const { owner, repo, issue_number, octokit } = opts
  const allComments: SignatureComment[] = []
  let page = 1
  const per_page = 30

  try {
    while (true) {
      core.debug(`Fetching comments page ${page} (${per_page} per page)`)

      const response = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number,
        page,
        per_page,
        sort: 'created',
        direction: 'asc'
      })

      const comments = response.data || []

      if (!Array.isArray(comments) || comments.length === 0) {
        core.debug(`Page ${page} returned no comments, pagination complete`)
        break
      }

      core.debug(`Page ${page} returned ${comments.length} comments`)

      // Convert each comment to typed SignatureComment
      for (const comment of comments) {
        try {
          const signatureComment = toSignatureComment(comment, issue_number)
          allComments.push(signatureComment)
        } catch (e) {
          core.warning(`Failed to parse comment ${comment?.id}: ${e}`)
        }
      }

      // If we got fewer than per_page, we've reached the end
      if (comments.length < per_page) {
        core.debug(`Page ${page} returned fewer than ${per_page} comments, stopping`)
        break
      }

      page++

      // Safety: stop if we've fetched more than 3000 comments (100 pages)
      if (page > 100) {
        core.error('Comment pagination exceeded 3000 comments, stopping to prevent runaway loop')
        break
      }
    }

    core.info(`Fetched ${allComments.length} total comments from PR #${issue_number}`)
    return allComments
  } catch (error) {
    throw new Error(`Failed to fetch comments: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Convert REST API comment to SignatureComment
 */
function toSignatureComment(apiComment: any, pr_number: number): SignatureComment {
  if (!apiComment || !apiComment.id || !apiComment.body) {
    throw new Error('Invalid comment: missing id or body')
  }

  const author = toAuthorIdentity(apiComment.user || {})

  return {
    id: apiComment.id,
    body: apiComment.body,
    author,
    created_at: apiComment.created_at,
    updated_at: apiComment.updated_at,
    pr_number
  }
}

/**
 * Regex pattern to detect CLA signature comments
 * Matches: "I agree to ...", "I have read and agree to ...", etc.
 */
const CLA_SIGNATURE_PATTERNS = [
  /I\s+(?:have\s+)?(?:read\s+and\s+)?agree\s+to\s+the\s+CLA/i,
  /I\s+sign\s+the\s+CLA/i,
  /signed\s+the\s+CLA/i,
  /CLA\s+.*?signed/i,
  /contributor\s+license\s+agreement/i
]

/**
 * Check if a comment is a CLA signature comment
 */
export function isSignatureComment(comment: SignatureComment): boolean {
  for (const pattern of CLA_SIGNATURE_PATTERNS) {
    if (pattern.test(comment.body)) {
      return true
    }
  }
  return false
}

/**
 * Filter comments to only signature comments
 */
export function filterSignatureComments(comments: SignatureComment[]): SignatureComment[] {
  return comments.filter(isSignatureComment)
}

/**
 * Get all signature comments from a PR
 */
export async function getAllSignatureComments(
  opts: CommentFetchOptions
): Promise<SignatureComment[]> {
  const allComments = await getAllComments(opts)
  return filterSignatureComments(allComments)
}

/**
 * Extract unique authors who have signed via comments
 */
export function extractSigningAuthors(signatureComments: SignatureComment[]): AuthorIdentity[] {
  const seen = new Set<number>()
  const authors: AuthorIdentity[] = []

  for (const comment of signatureComments) {
    const { githubId, verified } = comment.author

    // Only verified signers with valid GitHub IDs
    if (verified && githubId > 0 && !seen.has(githubId)) {
      seen.add(githubId)
      authors.push(comment.author)
    }
  }

  return authors
}
