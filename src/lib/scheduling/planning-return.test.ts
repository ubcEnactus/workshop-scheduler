import { describe, expect, it } from 'vitest'
import { classEditPlanningHref, parsePlanningReturn, planningReturnHref } from './planning-return'

const draft = '123e4567-e89b-42d3-a456-426614174000'

describe('planning return context', () => {
  it('round trips only through fixed local planning and class routes', () => {
    const source = {
      planning: '1',
      planningDraft: draft,
      planningClassId: ['class-a', 'class-b'],
      returnTo: 'https://example.test/steal',
    }
    const state = parsePlanningReturn(source)
    expect(state).toBeTruthy()
    expect(classEditPlanningHref('class-a', { month: '2027-01' }, state!)).toBe(
      '/admin/classes/class-a/edit?month=2027-01&planning=1&planningDraft=' +
        draft +
        '&planningClassId=class-a&planningClassId=class-b'
    )
    const back = planningReturnHref({ month: '2027-01' }, source)
    expect(back).toContain('/admin/workshops/plan?')
    expect(back).toContain('classId=class-a&classId=class-b')
    expect(back).not.toContain('example.test')
  })

  it('rejects malformed draft keys, duplicate ids, and oversized selections', () => {
    expect(
      parsePlanningReturn({
        planning: '1',
        planningDraft: 'not-a-uuid',
        planningClassId: 'class-a',
      })
    ).toBeUndefined()
    expect(
      parsePlanningReturn({
        planning: '1',
        planningDraft: draft,
        planningClassId: ['class-a', 'class-a'],
      })
    ).toBeUndefined()
    expect(
      parsePlanningReturn({
        planning: '1',
        planningDraft: draft,
        planningClassId: Array.from({ length: 201 }, (_, i) => 'class-' + i),
      })
    ).toBeUndefined()
  })
})
