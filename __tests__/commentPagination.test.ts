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
      user: { id: 1, login: 'github-actions[bot]', type: 'Bot' },
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

describe('comment robustness', () => {
  const BOT = { id: 1, login: 'github-actions[bot]', type: 'Bot' }
  const HUMAN = { id: 77, login: 'human', type: 'User' }
  const marker = '**CLA Assistant Lite bot** please sign'

  function comment(id: number, body: string, user: any, created = `2026-01-0${id}T00:00:00Z`) {
    return { id, body, user, created_at: created }
  }

  it('skips comments without a user and never treats them as a signer', async () => {
    installApi([
      comment(1, 'I have read the CLA Document and I hereby sign the CLA', null),
      comment(2, 'I have read the CLA Document and I hereby sign the CLA', HUMAN)
    ])
    const committerMap: any = { signed: [], notSigned: [{ id: HUMAN.id, name: HUMAN.login }] }

    const result = await signatureWithPRComment(committerMap, [{ id: HUMAN.id, name: HUMAN.login }])

    expect(result.newSigned.map(c => c.id)).toEqual([HUMAN.id])
  })

  it('does not crash the bot comment lookup on a comment without a user', async () => {
    installApi([comment(1, 'ghost', null), comment(2, marker, BOT)])

    await prCommentSetup({ signed: [], notSigned: [{ id: 5, name: 'o' }] } as any, [{ id: 5, name: 'o' }] as any)

    expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 2 }))
  })

  it('does not adopt a user comment that contains the marker text', async () => {
    installApi([comment(1, marker, HUMAN)])

    await prCommentSetup({ signed: [], notSigned: [{ id: 5, name: 'o' }] } as any, [{ id: 5, name: 'o' }] as any)

    expect(mockOctokit.issues.updateComment).not.toHaveBeenCalled()
    expect(mockOctokit.issues.createComment).toHaveBeenCalledTimes(1)
  })

  it('does not adopt a marker comment from a User account whose login ends in [bot]', async () => {
    installApi([comment(1, marker, { id: 9, login: 'impostor[bot]', type: 'User' })])

    await prCommentSetup({ signed: [], notSigned: [{ id: 5, name: 'o' }] } as any, [{ id: 5, name: 'o' }] as any)

    expect(mockOctokit.issues.updateComment).not.toHaveBeenCalled()
  })

  it('updates the newest bot comment when duplicates exist', async () => {
    installApi([
      comment(3, marker, BOT, '2026-01-03T00:00:00Z'),
      comment(5, marker, BOT, '2026-01-05T00:00:00Z'),
      comment(4, marker, BOT, '2026-01-04T00:00:00Z')
    ])

    await prCommentSetup({ signed: [], notSigned: [{ id: 5, name: 'o' }] } as any, [{ id: 5, name: 'o' }] as any)

    expect(mockOctokit.issues.createComment).not.toHaveBeenCalled()
    expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 5 }))
  })

  it('fetches the comment list once per run', async () => {
    installApi([comment(1, marker, BOT)])

    await prCommentSetup({ signed: [], notSigned: [{ id: 5, name: 'o' }] } as any, [{ id: 5, name: 'o' }] as any)

    expect(mockOctokit.paginate).toHaveBeenCalledTimes(1)
  })
})
