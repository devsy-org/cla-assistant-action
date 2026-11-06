import getCommitters from '../src/graphql'
import { octokit } from '../src/octokit'

jest.mock('../src/octokit', () => ({ octokit: { graphql: jest.fn() } }))
jest.mock('@actions/github', () => ({
  context: { repo: { owner: 'owner', repo: 'repo' }, issue: { number: 42 } }
}))

const graphql = octokit.graphql as unknown as jest.Mock
const edge = (login: string, databaseId: number) => ({
  node: { commit: { author: { user: { login, databaseId } }, committer: {} } }
})
const page = (edges: any[], endCursor: string | null, hasNextPage: boolean, totalCount = edges.length) => ({
  repository: { pullRequest: { commits: { totalCount, edges, pageInfo: { endCursor, hasNextPage } } } }
})

describe('getCommitters', () => {
  beforeEach(() => graphql.mockReset())

  test.each([1, 2, 3])('collects committers across %i pages', async (count) => {
    for (let i = 0; i < count; i++) {
      const edges = Array.from({ length: 100 }, (_, j) => edge(`user${i * 100 + j}`, i * 100 + j + 1))
      graphql.mockResolvedValueOnce(page(edges, `cursor${i}`, i < count - 1, count * 100))
    }

    const result = await getCommitters()

    expect(result).toHaveLength(count * 100)
    expect(result[count * 100 - 1]).toEqual({ name: `user${count * 100 - 1}`, id: count * 100, pullRequestNo: 42 })
    expect(graphql).toHaveBeenCalledTimes(count)
    for (let i = 0; i < count; i++) {
      expect(graphql).toHaveBeenNthCalledWith(i + 1, expect.any(String), {
        owner: 'owner', name: 'repo', number: 42, cursor: i === 0 ? '' : `cursor${i - 1}`
      })
    }
  })

  test('returns no committers for an empty page', async () => {
    graphql.mockResolvedValueOnce(page([], null, false))
    expect(await getCommitters()).toEqual([])
    expect(graphql).toHaveBeenCalledTimes(1)
  })

  test('deduplicates across pages and retains bot filtering', async () => {
    graphql.mockResolvedValueOnce(page([edge('alice', 1), edge('bot', 41898282)], 'next', true, 4))
    graphql.mockResolvedValueOnce(page([edge('alice', 1), edge('bob', 2)], null, false, 4))
    expect(await getCommitters()).toEqual([
      { name: 'alice', id: 1, pullRequestNo: 42 },
      { name: 'bob', id: 2, pullRequestNo: 42 }
    ])
  })

  test('propagates a later page failure', async () => {
    graphql.mockResolvedValueOnce(page([edge('alice', 1)], 'next', true))
    graphql.mockRejectedValueOnce(new Error('unavailable'))
    await expect(getCommitters()).rejects.toThrow('graphql call to get the committers details failed: Error: unavailable')
  })

  test('rejects a truncated connection despite hasNextPage being false', async () => {
    const edges = Array.from({ length: 100 }, (_, i) => edge(`user${i}`, i + 1))
    graphql.mockResolvedValueOnce(page(edges, 'first', true, 794))
    graphql.mockResolvedValueOnce(page(edges, 'second', true, 794))
    graphql.mockResolvedValueOnce(page(edges.slice(0, 50), 'last', false, 794))
    await expect(getCommitters()).rejects.toThrow('Incomplete pull request commit list: expected 794, received 250')
    expect(graphql).toHaveBeenCalledTimes(3)
  })

  test('rejects an empty connection with a nonzero total', async () => {
    graphql.mockResolvedValueOnce(page([], null, false, 1))
    await expect(getCommitters()).rejects.toThrow('Incomplete pull request commit list: expected 1, received 0')
  })

})
