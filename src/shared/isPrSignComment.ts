import { getCustomPrSignComment } from './getInputs'
import { getPrSignComment } from './pr-sign-comment'

export function isPrSignComment(comment: string): boolean {
  const customSignature = getCustomPrSignComment()
  const signature = (customSignature || getPrSignComment()).trim().toLowerCase()
  const signatureWithoutTerminalPeriod = signature.replace(/\.$/, '')
  const normalizedComment = comment.trim().toLowerCase()

  if (customSignature) {
    return normalizedComment === signatureWithoutTerminalPeriod ||
      normalizedComment === `${signatureWithoutTerminalPeriod}.`
  }

  const normalizeWhitespace = (value: string): string =>
    value.replace(/\s+/g, ' ')
  const normalizedSignature = normalizeWhitespace(signatureWithoutTerminalPeriod)
  const normalizedCommentWithWhitespace = normalizeWhitespace(normalizedComment)

  return normalizedCommentWithWhitespace === normalizedSignature ||
    normalizedCommentWithWhitespace === `${normalizedSignature}.`
}
