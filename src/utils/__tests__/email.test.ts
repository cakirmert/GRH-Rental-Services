import { describe, it, expect } from 'vitest'
import { normalizeEmail } from '../email'

describe('normalizeEmail', () => {
  it('should return the same email if already normalized', () => {
    expect(normalizeEmail('test@example.com')).toBe('test@example.com')
  })

  it('should lowercase the email', () => {
    expect(normalizeEmail('Test@Example.com')).toBe('test@example.com')
    expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com')
  })

  it('should trim whitespace from the email', () => {
    expect(normalizeEmail('  test@example.com  ')).toBe('test@example.com')
    expect(normalizeEmail('\ttest@example.com\n')).toBe('test@example.com')
  })

  it('should both lowercase and trim whitespace from the email', () => {
    expect(normalizeEmail('  Test@Example.com  ')).toBe('test@example.com')
  })

  it('should handle an empty string', () => {
    expect(normalizeEmail('')).toBe('')
  })

  it('should handle a string with only whitespace', () => {
    expect(normalizeEmail('   ')).toBe('')
  })
})
