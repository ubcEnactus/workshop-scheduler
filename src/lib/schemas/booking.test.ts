import { describe, expect, it } from 'vitest'
import { NEW_CHOICE, workshopBookingSchema } from './booking'

const valid = {
  requestKey: '96ca6a32-bbb0-458e-b224-1d8c57e28563',
  schoolChoice: NEW_CHOICE,
  schoolName: ' Cedar School ',
  schoolDistrict: '',
  teacherChoice: NEW_CHOICE,
  teacherName: ' Alex Teacher ',
  teacherEmail: ' Alex@Example.Test ',
  classChoice: NEW_CHOICE,
  className: ' Science 10 ',
  date: '2027-01-04',
  startTime: '10:00',
  endTime: '11:00',
  minPAs: '1',
  maxPAs: '3',
  month: '2027-01',
}

describe('workshopBookingSchema', () => {
  it('normalizes direct booking text and accepts a blank district', () => {
    expect(workshopBookingSchema.parse(valid)).toMatchObject({
      schoolName: 'Cedar School',
      schoolDistrict: '',
      teacherName: 'Alex Teacher',
      teacherEmail: 'alex@example.test',
      className: 'Science 10',
      minPAs: 1,
      maxPAs: 3,
    })
  })

  it.each([
    ['schoolName', { schoolName: '' }],
    ['teacherName', { teacherName: '' }],
    ['teacherEmail', { teacherEmail: '' }],
    ['className', { className: '' }],
    ['endTime', { endTime: '09:00' }],
    ['maxPAs', { maxPAs: '0' }],
    ['date', { date: '2027-01-03' }],
  ])('rejects invalid %s input', (_field, change) => {
    expect(workshopBookingSchema.safeParse({ ...valid, ...change }).success).toBe(false)
  })

  it('does not require creation fields for existing selections', () => {
    expect(
      workshopBookingSchema.safeParse({
        ...valid,
        schoolChoice: 'school-id',
        schoolName: '',
        teacherChoice: 'teacher-id',
        teacherName: '',
        teacherEmail: '',
        classChoice: 'class-id',
        className: '',
        view: '',
      }).success
    ).toBe(true)
  })
})
