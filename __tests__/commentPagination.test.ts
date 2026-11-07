import signatureWithPRComment from '../src/pullrequest/signatureComment'
import prCommentSetup from '../src/pullrequest/pullRequestComment'
import { octokit } from '../src/octokit'

const mockOctokit: any = octokit

jest.mock('../src/octokit', () => ({ octokit: {} }))
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'org', repo: 'repo' },
    issue: { number: 7 },
    payload: { repository: { id: 99 } }
  }
}))
jest.mock('../src/pullrequest/pullRequestCommentContent', () => ({ commentContent: () => 'body' }))
jest.mock('../src/shared/getInputs', () => ({
  getUseDcoFlag: () => 'false',
  getCustomPrSignComment: () => ''
}))

const TOTAL = 250
const SIGNER = { id: 4242, login: 'signer' }

function buildComments(): any[] {
  const comments = Array.from({ length: TOTAL - 1 }, (_, i) => ({
    id: i + 1,
    body: `chatter ${i + 1}`,
    user: { id: 1000 + i, login: `user${i}` },
    created_at: '2026-01-01T00:00:00Z'
  }))
  comments.push({
    id: TOTAL,
    body: 'I have read the CLA Document and I hereby sign the CLA',
    user: SIGNER,
    created_at: '2026-01-02T00:00:00Z'
  })
  return comments
}

function installApi(all: any[]) {
  const listComments: any = jest.fn(async (params: any) => {
    const perPage = params.per_page ?? 30
    const page = params.page ?? 1
    return { data: all.slice((page - 1) * perPage, page * perPage) }
  })
  mockOctokit.issues = {
    listComments,
    createComment: jest.fn().mockResolvedValue({}),
    updateComment: jest.fn().mockResolvedValue({})
  }
  mockOctokit.paginate = jest.fn(async (fn: any, params: any) => {
    const items: any[] = []
    for (let page = 1; ; page++) {
      const res = await fn({ ...params, page })
      items.push(...res.data)
      if (res.data.length < (params.per_page ?? 30)) break
    }
    return items
  })
}

describe('comment list pagination', () => {
  beforeEach(() => installApi(buildComments()))

  it('finds a signature comment that is on the last page', async () => {
    const committerMap: any = { signed: [], notSigned: [{ id: SIGNER.id, name: SIGNER.login }] }
    const committers = [{ id: SIGNER.id, name: SIGNER.login }]

    const result = await signatureWithPRComment(committerMap, committers)

    expect(result.newSigned.map(c => c.id)).toEqual([SIGNER.id])
    expect(mockOctokit.issues.listComments.mock.calls.length).toBeGreaterThan(1)
    expect(
      mockOctokit.issues.listComments.mock.calls.every(([p]: any[]) => p.per_page === 100)
    ).toBe(true)
  })

  it('finds the bot comment on the last page and updates it instead of creating another', async () => {
    const all = buildComments()
    all[TOTAL - 1] = {
      id: TOTAL,
      body: '**CLA Assistant Lite bot** please sign',
      user: { id: 1, login: 'github-actions[bot]' },
      created_at: '2026-01-02T00:00:00Z'
    }
    installApi(all)
    const committerMap: any = { signed: [], notSigned: [{ id: 5, name: 'other' }] }

    await prCommentSetup(committerMap, [{ id: 5, name: 'other' }] as any)

    expect(mockOctokit.issues.createComment).not.toHaveBeenCalled()
    expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: TOTAL })
    )
  })
})
