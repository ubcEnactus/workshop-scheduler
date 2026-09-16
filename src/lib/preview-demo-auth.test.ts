import { describe, expect, it } from 'vitest'

import {
  getPreviewDemoConfig,
  isPreviewDemoEnabled,
  isSameOriginPreviewRequest,
  PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS,
  previewDemoEmailForRole,
} from './preview-demo-auth'

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  VERCEL_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_preview_test',
  AUTH_PREVIEW_DEMO_ENABLED: 'true',
  AUTH_PREVIEW_DEMO_PROJECT_ID: 'prj_preview_test',
  AUTH_PREVIEW_ADMIN_EMAIL: 'preview-admin@example.test',
  AUTH_PREVIEW_TEACHER_EMAIL: 'preview-teacher@example.test',
  AUTH_PREVIEW_PA_EMAIL: 'preview-pa@example.test',
}

describe('preview demo auth configuration', () => {
  it('enables only the fully configured Vercel preview project', () => {
    const config = getPreviewDemoConfig(validEnvironment)

    expect(config).toEqual({
      adminEmail: 'preview-admin@example.test',
      teacherEmail: 'preview-teacher@example.test',
      paEmail: 'preview-pa@example.test',
    })
    expect(isPreviewDemoEnabled(validEnvironment)).toBe(true)
    expect(previewDemoEmailForRole(config!, 'ADMIN')).toBe('preview-admin@example.test')
    expect(previewDemoEmailForRole(config!, 'TEACHER')).toBe('preview-teacher@example.test')
    expect(previewDemoEmailForRole(config!, 'PA')).toBe('preview-pa@example.test')
  })

  it.each([
    ['a production deployment', { VERCEL_ENV: 'production' }],
    ['a development deployment', { VERCEL_ENV: 'development' }],
    ['an absent enable flag', { AUTH_PREVIEW_DEMO_ENABLED: undefined }],
    ['a non-exact enable flag', { AUTH_PREVIEW_DEMO_ENABLED: 'TRUE' }],
    ['an absent expected project', { AUTH_PREVIEW_DEMO_PROJECT_ID: undefined }],
    ['an empty expected project', { AUTH_PREVIEW_DEMO_PROJECT_ID: '' }],
    ['an absent Vercel project identity', { VERCEL_PROJECT_ID: undefined }],
    ['a different Vercel project', { VERCEL_PROJECT_ID: 'prj_other' }],
    ['an absent admin email', { AUTH_PREVIEW_ADMIN_EMAIL: undefined }],
    ['an invalid teacher email', { AUTH_PREVIEW_TEACHER_EMAIL: 'not-an-email' }],
    ['a non-canonical PA email', { AUTH_PREVIEW_PA_EMAIL: ' Preview-PA@example.test ' }],
    ['a mixed-case admin email', { AUTH_PREVIEW_ADMIN_EMAIL: 'Preview-Admin@example.test' }],
    ['a duplicate role email', { AUTH_PREVIEW_PA_EMAIL: 'preview-teacher@example.test' }],
  ])('fails closed for %s', (_case, overrides) => {
    const environment = { ...validEnvironment, ...overrides }

    expect(getPreviewDemoConfig(environment)).toBeNull()
    expect(isPreviewDemoEnabled(environment)).toBe(false)
  })

  it('keeps preview sessions short', () => {
    expect(PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(5 * 60)
    expect(PREVIEW_DEMO_SESSION_MAX_AGE_SECONDS).toBeLessThanOrEqual(2 * 60 * 60)
  })
})

describe('preview demo request origin', () => {
  it('accepts an HTTPS origin matching the forwarded host', () => {
    const headers = new Headers({
      host: 'internal.example.test',
      origin: 'https://preview.example.test',
      'x-forwarded-host': 'preview.example.test',
    })

    expect(isSameOriginPreviewRequest(headers)).toBe(true)
  })

  it.each([
    ['a missing origin', { host: 'preview.example.test' }],
    ['a missing host', { origin: 'https://preview.example.test' }],
    [
      'a cross-origin request',
      { host: 'preview.example.test', origin: 'https://attacker.example.test' },
    ],
    ['an insecure origin', { host: 'preview.example.test', origin: 'http://preview.example.test' }],
    [
      'an origin containing a path',
      { host: 'preview.example.test', origin: 'https://preview.example.test/login' },
    ],
    ['an invalid origin', { host: 'preview.example.test', origin: 'not a URL' }],
  ])('rejects %s', (_case, values) => {
    expect(isSameOriginPreviewRequest(new Headers(values))).toBe(false)
  })
})
