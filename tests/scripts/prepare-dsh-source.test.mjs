import test from 'node:test'
import assert from 'node:assert/strict'
import { validateHead } from '../../scripts/prepare-dsh-source.mjs'

test('accepts only the pinned upstream commit', () => {
  assert.doesNotThrow(() => validateHead('b150a551b8d465e31e418e1b2eaf5e79bbb7d28e'))
  assert.throws(() => validateHead('0000000000000000000000000000000000000000'), /unexpected DSH commit/)
})
