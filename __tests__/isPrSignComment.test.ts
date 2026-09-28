import * as core from '@actions/core'
import { isPrSignComment } from '../src/shared/isPrSignComment'

declare const jest: { mock(moduleName: string): void }
declare function describe(name: string, suite: () => void): void
declare function beforeEach(setup: () => void): void
declare function test(name: string, run: () => void): void
declare function expect(value: unknown): { toBe(expected: unknown): void }

jest.mock('@actions/core')

const mockedGetInput = core.getInput as unknown as {
  mockReturnValue(value: string): void
}

describe('isPrSignComment', () => {
  beforeEach(() => {
    mockedGetInput.mockReturnValue('')
  })

  test('recognizes the configured CLA signature without a final period', () => {
    expect(isPrSignComment('I have read the CLA Document and I hereby sign the CLA')).toBe(true)
  })

  test('recognizes the configured CLA signature with a final period', () => {
    expect(isPrSignComment('I have read the CLA Document and I hereby sign the CLA.')).toBe(true)
  })

  test('does not recognize an unrelated comment', () => {
    expect(isPrSignComment('I read the CLA document')).toBe(false)
  })

  test('does not recognize the signature embedded in unrelated text', () => {
    expect(isPrSignComment('I have read the CLA Document and I hereby sign the CLA, thanks')).toBe(false)
  })

  test('preserves whitespace variations in the default signature', () => {
    expect(isPrSignComment('I have read the CLA   Document and I hereby sign the CLA')).toBe(true)
  })

  test('allows a final period on a custom signature', () => {
    mockedGetInput.mockReturnValue('Please accept my agreement')

    expect(isPrSignComment('Please accept my agreement.')).toBe(true)
  })

  test('does not duplicate punctuation from a custom signature', () => {
    mockedGetInput.mockReturnValue('Please accept my agreement.')

    expect(isPrSignComment('Please accept my agreement..')).toBe(false)
  })
})
