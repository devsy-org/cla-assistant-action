/**
 * T7: Regression Tests I05–I07
 * Commit Pagination Tests
 */

import { fetchAllCommits, extractVerifiedAuthors } from '../src/commits/commitCollector'
import { CommitAuthor } from '../src/interfaces'

describe('Commit Pagination Tests (T2, I05–I07)', () => {
  let mockOctokit: any

  beforeEach(() => {
    mockOctokit = {
      rest: {
        pulls: {
          listCommits: jest.fn()
        }
      }
    }
  })

  describe('I05: 500 commits across 3 pages', () => {
    it('should fetch all commits when paginated across 3 pages', async () => {
      // Page 1: 250 commits
      const page1 = Array.from({ length: 250 }, (_, i) => ({
        sha: `commit${i + 1}`,
        author: { id: i + 1, name: `Author ${i + 1}`, login: `author${i + 1}` }
      }))

      // Page 2: 250 commits
      const page2 = Array.from({ length: 250 }, (_, i) => ({
        sha: `commit${i + 251}`,
        author: { id: i + 251, name: `Author ${i + 251}`, login: `author${i + 251}` }
      }))

      // Page 3: 0 commits (signals end)
      const page3: any[] = []

      mockOctokit.rest.pulls.listCommits
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 })
        .mockResolvedValueOnce({ data: page3 })

      const commits = await fetchAllCommits({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        octokit: mockOctokit
      })

      expect(commits).toHaveLength(500)
      expect(mockOctokit.rest.pulls.listCommits).toHaveBeenCalledTimes(3)
      expect(commits[0].commitSha).toBe('commit1')
      expect(commits[499].commitSha).toBe('commit500')
    })
  })

  describe('I06: Exact page boundary (250 commits)', () => {
    it('should handle exact page boundary correctly', async () => {
      // Exactly 250 commits
      const commits = Array.from({ length: 250 }, (_, i) => ({
        sha: `commit${i}`,
        author: { id: i + 1, name: `Author ${i}`, login: `author${i}` }
      }))

      mockOctokit.rest.pulls.listCommits
        .mockResolvedValueOnce({ data: commits })
        .mockResolvedValueOnce({ data: [] }) // Next page is empty

      const result = await fetchAllCommits({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        octokit: mockOctokit
      })

      expect(result).toHaveLength(250)
      expect(mockOctokit.rest.pulls.listCommits).toHaveBeenCalledTimes(2) // Called twice: page 1 & check for page 2
    })
  })

  describe('I07: Single commit', () => {
    it('should handle single commit correctly', async () => {
      const commits = [
        {
          sha: 'singlecommit',
          author: { id: 1, name: 'Solo Author', login: 'solo' }
        }
      ]

      mockOctokit.rest.pulls.listCommits.mockResolvedValueOnce({ data: commits })

      const result = await fetchAllCommits({
        owner: 'test',
        repo: 'repo',
        pull_number: 1,
        octokit: mockOctokit
      })

      expect(result).toHaveLength(1)
      expect(result[0].commitSha).toBe('singlecommit')
    })
  })

  describe('extractVerifiedAuthors', () => {
    it('should extract only verified authors', () => {
      const commits: CommitAuthor[] = [
        {
          authorIdentity: { name: 'Verified 1', githubId: 1, verified: true },
          commitSha: 'sha1'
        },
        {
          authorIdentity: { name: 'Unverified', githubId: 0, verified: false },
          commitSha: 'sha2'
        },
        {
          authorIdentity: { name: 'Verified 2', githubId: 2, verified: true },
          commitSha: 'sha3'
        }
      ]

      const verified = extractVerifiedAuthors(commits)

      expect(verified).toHaveLength(2)
      expect(verified[0].githubId).toBe(1)
      expect(verified[1].githubId).toBe(2)
    })

    it('should deduplicate authors by GitHub ID', () => {
      const commits: CommitAuthor[] = [
        {
          authorIdentity: { name: 'Alice', githubId: 1, verified: true },
          commitSha: 'sha1'
        },
        {
          authorIdentity: { name: 'Alice', githubId: 1, verified: true },
          commitSha: 'sha2' // Same author, different commit
        }
      ]

      const verified = extractVerifiedAuthors(commits)

      expect(verified).toHaveLength(1) // Only one unique author
      expect(verified[0].githubId).toBe(1)
    })
  })
})
