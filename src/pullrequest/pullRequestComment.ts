import { octokit } from '../octokit'
import { context } from '@actions/github'
import signatureWithPRComment, { listPullRequestComments } from './signatureComment'
import { commentContent } from './pullRequestCommentContent'
import {
  CommitterMap,
  CommittersDetails
} from '../interfaces'
import { getUseDcoFlag } from '../shared/getInputs'



export default async function prCommentSetup(committerMap: CommitterMap, committers: CommittersDetails[]) {
  const signed = committerMap?.notSigned && committerMap?.notSigned.length === 0

  try {
    const comments = await getComments()
    const claBotComment = findBotComment(comments, await getAuthenticatedUserId())
    if (!claBotComment && !signed) {
      return createComment(signed, committerMap)
    } else if (claBotComment?.id) {
      if (signed) {
        await updateComment(signed, committerMap, claBotComment)
      }

      // reacted committers are contributors who have newly signed by posting the Pull Request comment
      const reactedCommitters = await signatureWithPRComment(committerMap, committers, comments)
      if (reactedCommitters?.onlyCommitters) {
          reactedCommitters.allSignedFlag = prepareAllSignedCommitters(committerMap, reactedCommitters.onlyCommitters, committers)
      }
      committerMap = prepareCommiterMap(committerMap, reactedCommitters)
      await updateComment(reactedCommitters.allSignedFlag, committerMap, claBotComment)
      return reactedCommitters
    }
  } catch (error) {
    throw new Error(
      `Error occured when creating or editing the comments of the pull request: ${error.message}`)
  }
}

async function createComment(signed: boolean, committerMap: CommitterMap): Promise<void> {
  await octokit.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    body: commentContent(signed, committerMap)
  }).catch(error => { throw new Error(`Error occured when creating a pull request comment: ${error.message}`) })
}

async function updateComment(signed: boolean, committerMap: CommitterMap, claBotComment: any): Promise<void> {
  await octokit.issues.updateComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    comment_id: claBotComment.id,
    body: commentContent(signed, committerMap)
  }).catch(error => { throw new Error(`Error occured when updating the pull request comment: ${error.message}`) })
}

async function getComments() {
  try {
    return await listPullRequestComments()
  } catch (error) {
    throw new Error(`Error occured when getting  all the comments of the pull request: ${error.message}`)
  }
}

async function getAuthenticatedUserId(): Promise<number | undefined> {
  try {
    const { data } = await octokit.users.getAuthenticated()
    return data?.id
  } catch {
    return undefined
  }
}

function findBotComment(comments: any[], authenticatedUserId?: number) {
  // using a `string` true or false purposely as github action input cannot have a boolean value
  const useDco = getUseDcoFlag()
  if (useDco !== 'true' && useDco !== 'false') {
    return undefined
  }
  const marker = useDco === 'true' ? /.*DCO Assistant Lite bot.*/m : /.*CLA Assistant Lite bot.*/m
  const candidates = comments.filter(comment => isOwnAuthor(comment?.user, authenticatedUserId) && marker.test(comment.body || ''))
  return candidates.reduce((newest, comment) => (isNewer(comment, newest) ? comment : newest), undefined)
}

function isOwnAuthor(user: any, authenticatedUserId?: number): boolean {
  if (!user) {
    return false
  }
  return user.type === 'Bot' || (authenticatedUserId !== undefined && user.id === authenticatedUserId)
}

function isNewer(comment: any, other: any): boolean {
  if (!other) {
    return true
  }
  const a = Date.parse(comment.created_at) || 0
  const b = Date.parse(other.created_at) || 0
  return a !== b ? a > b : comment.id > other.id
}

function prepareCommiterMap(committerMap: CommitterMap, reactedCommitters) {
  committerMap.signed?.push(...reactedCommitters.newSigned)
  committerMap.notSigned = committerMap.notSigned!.filter(
    committer =>
      !reactedCommitters.newSigned.some(
        reactedCommitter => committer.id === reactedCommitter.id
      )
  )
  return committerMap

}

function prepareAllSignedCommitters(committerMap: CommitterMap, signedInPrCommitters: CommittersDetails[], committers: CommittersDetails[]): boolean {
  let allSignedCommitters = [] as CommittersDetails[]
  /*
   * 1) already signed committers in the file 2) signed committers in the PR comment
  */
  const ids = new Set(signedInPrCommitters.map(committer => committer.id))
  allSignedCommitters = [...signedInPrCommitters, ...committerMap.signed!.filter(signedCommitter => !ids.has(signedCommitter.id))]
  /*
  * checking if all the unsigned committers have reacted to the PR comment (this is needed for changing the content of the PR comment to "All committers have signed the CLA")
  */
  let allSignedFlag: boolean = committers.every(committer => allSignedCommitters.some(reactedCommitter => committer.id === reactedCommitter.id))
  return allSignedFlag
}

