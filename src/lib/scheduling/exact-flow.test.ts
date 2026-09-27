import { describe, expect, it } from 'vitest'
import { minCostMaximumFlow } from './exact-flow'

describe('minCostMaximumFlow', () => {
  it('finds the full flow through a reassignment chain and minimizes cost', () => {
    const edges = [
      { from: 's', to: 'a', capacity: 1, cost: 5 },
      { from: 's', to: 'b', capacity: 1, cost: 0 },
      { from: 'a', to: 'x', capacity: 1 },
      { from: 'a', to: 'y', capacity: 1 },
      { from: 'b', to: 'x', capacity: 1 },
      { from: 'x', to: 't', capacity: 1 },
      { from: 'y', to: 't', capacity: 1 },
    ]
    const result = minCostMaximumFlow('s', 't', edges)
    expect(result.flow).toBe(2)
    expect(result.cost).toBe(5)
    expect(result.diagnostics.augmentations).toBe(2)
  })

  it('returns a residual reachability cut for an infeasible network', () => {
    const result = minCostMaximumFlow('s', 't', [
      { from: 's', to: 'a', capacity: 1 },
      { from: 'a', to: 't', capacity: 2 },
    ])
    expect(result.flow).toBe(1)
    expect(result.reachable).toEqual(new Set(['s']))
  })
})
