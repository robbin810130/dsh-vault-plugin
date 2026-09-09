import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHead } from '../../scripts/prepare-dsh-source.mjs'

test('accepts only the pinned upstream commit', () => {
  assert.doesNotThrow(() => validateHead('a66e4702047846cdaa10c66c9d3df3951f5ea70d'))
  assert.throws(() => validateHead('0000000000000000000000000000000000000000'), /unexpected DSH commit/)
})
