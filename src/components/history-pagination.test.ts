import { describe, expect, it } from 'vitest'
import { historyPageHref } from './history-pagination-utils'

describe('participant history pagination', () => {
  it('preserves sibling page parameters and removes page one from the URL', () => {
    expect(historyPageHref('/pa', { historyPage: '2', changePage: '3' }, 'historyPage', 1)).toBe(
      '/pa?changePage=3'
    )
    expect(historyPageHref('/pa', { historyPage: '2', changePage: '3' }, 'historyPage', 3)).toBe(
      '/pa?historyPage=3&changePage=3'
    )
  })

  it('omits an empty query string', () => {
    expect(historyPageHref('/teacher', {}, 'historyPage', 1)).toBe('/teacher')
  })
})
