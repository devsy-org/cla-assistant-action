/**
 * T7: Regression Tests I08–I10
 * Comment Enumeration Tests
 */

import {
  getAllComments,
  isSignatureComment,
  filterSignatureComments,
  extractSigningAuthors,
  SignatureComment
} from '../src/comments/commentEnumerator'

describe('Comment Enumeration Tests (T5, I08–I10)', () => {
  let mockOctokit: any

  beforeEach(() => {
    mockOctokit = {
      rest: {
        issues: {
          listComments: jest.fn()
        }
      }
    }
  })

  describe('I08: 100 signature comments enumerated', () => {
    it('should enumerate 100 comments', async () => {
      // Create 100 comments across multiple pages
      const page1 = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        body: `I agree to the CLA #${i + 1}`,
        user: { id: i + 1, login: `user${i + 1}` },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }))

      const page2 = Array.from({ length: 30 }, (_, i) => ({
        id: i + 31,
        body: `I agree to the CLA #${i + 31}`,
        user: { id: i + 31, login: `user${i + 31}` },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }))

      const page3 = Array.from({ length: 30 }, (_, i) => ({
        id: i + 61,
        body: `I agree to the CLA #${i + 61}`,
        user: { id: i + 61, login: `user${i + 61}` },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }))

      const page4 = Array.from({ length: 10 }, (_, i) => ({
        id: i + 91,
        body: `I agree to the CLA #${i + 91}`,
        user: { id: i + 91, login: `user${i + 91}` },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }))

      mockOctokit.rest.issues.listComments
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 })
        .mockResolvedValueOnce({ data: page3 })
        .mockResolvedValueOnce({ data: page4 })

      const comments = await getAllComments({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        octokit: mockOctokit
      })

      expect(comments).toHaveLength(100)
      expect(comments[0].id).toBe(1)
      expect(comments[99].id).toBe(100)
    })
  })

  describe('I09: Comments across 5 pages', () => {
    it('should find all comments across 5 pages', async () => {
      const pages = Array.from({ length: 5 }, (_, pageIdx) =>
        Array.from({ length: 30 }, (_, i) => ({
          id: pageIdx * 30 + i + 1,
          body: `Comment ${pageIdx * 30 + i + 1}`,
          user: { id: pageIdx * 30 + i + 1, login: `user${pageIdx}${i}` },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }))
      )

      for (const page of pages) {
        mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: page })
      }
      // Last call returns empty
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: [] })

      const comments = await getAllComments({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        octokit: mockOctokit
      })

      expect(comments).toHaveLength(150) // 5 pages * 30 comments
    })
  })

  describe('I10: Malformed comment skipped safely', () => {
    it('should skip comments with missing required fields', async () => {
      const comments = [
        {
          id: 1,
          body: 'Valid comment',
          user: { id: 1, login: 'user1' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          // Missing body
          id: 2,
          user: { id: 2, login: 'user2' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 3,
          body: 'Another valid comment',
          user: { id: 3, login: 'user3' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      ]

      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: comments })
      mockOctokit.rest.issues.listComments.mockResolvedValueOnce({ data: [] })

      const result = await getAllComments({
        owner: 'test',
        repo: 'repo',
        issue_number: 1,
        octokit: mockOctokit
      })

      // Only 2 valid comments (malformed one is skipped)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1)
      expect(result[1].id).toBe(3)
    })
  })

  describe('isSignatureComment', () => {
    const mockComment = (body: string): SignatureComment => ({
      id: 1,
      body,
      author: { name: 'Test', githubId: 1, verified: true },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      pr_number: 1
    })

    it('should detect "I agree to the CLA" pattern', () => {
      expect(isSignatureComment(mockComment('I agree to the CLA'))).toBe(true)
    })

    it('should detect "I have read and agree" pattern', () => {
      expect(isSignatureComment(mockComment('I have read and agree to the CLA'))).toBe(true)
    })

    it('should detect "signed the CLA" pattern', () => {
      expect(isSignatureComment(mockComment('I have signed the CLA'))).toBe(true)
    })

    it('should reject non-signature comments', () => {
      expect(isSignatureComment(mockComment('This is just a regular comment'))).toBe(false)
    })
  })

  describe('filterSignatureComments', () => {
    it('should filter to only signature comments', () => {
      const comments: SignatureComment[] = [
        {
          id: 1,
          body: 'I agree to the CLA',
          author: { name: 'User 1', githubId: 1, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        },
        {
          id: 2,
          body: 'This is not a signature',
          author: { name: 'User 2', githubId: 2, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        },
        {
          id: 3,
          body: 'I have signed the CLA',
          author: { name: 'User 3', githubId: 3, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        }
      ]

      const filtered = filterSignatureComments(comments)

      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe(1)
      expect(filtered[1].id).toBe(3)
    })
  })

  describe('extractSigningAuthors', () => {
    it('should extract unique verified signers', () => {
      const comments: SignatureComment[] = [
        {
          id: 1,
          body: 'I agree to the CLA',
          author: { name: 'User 1', githubId: 1, verified: true },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          pr_number: 1
        },
        {
          id: 2,
          body: 'I agree to the CLA',
          author: { name: 'User 1', githubId: 1, verified: true }, // Duplicate
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          pr_number: 1
        }
      ]

      const authors = extractSigningAuthors(comments)

      expect(authors).toHaveLength(1)
      expect(authors[0].githubId).toBe(1)
    })
  })
})
