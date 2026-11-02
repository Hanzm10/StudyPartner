import { describe, expect, it } from 'vitest'
import { seededShuffle } from './shuffle'

describe('seededShuffle', () => {
  it('is deterministic for a seed and keeps every element', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const a = seededShuffle(items, 'attempt-1')
    expect(seededShuffle(items, 'attempt-1')).toEqual(a)
    expect([...a].sort((x, y) => x - y)).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('gives different orders for different seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect(seededShuffle(items, 'a')).not.toEqual(seededShuffle(items, 'b'))
  })
})
