import { describe, expect, it } from 'vitest'

import {
  emptyLoginForm,
  isLoginFormValid,
  resolveLoginRedirect,
  validateLoginForm,
  validatePassword,
  validateUsername,
} from './loginModel'

describe('登录表单校验（loginModel）', () => {
  it('用户名/密码必填与长度约束（对齐 LoginRequest）', () => {
    expect(validateUsername('')).toBe('请输入用户名')
    expect(validateUsername('   ')).toBe('请输入用户名')
    expect(validateUsername('a'.repeat(65))).toBe('用户名长度不能超过 64')
    expect(validateUsername('admin')).toBe('')

    expect(validatePassword('')).toBe('请输入密码')
    expect(validatePassword('p'.repeat(129))).toBe('密码长度不能超过 128')
    expect(validatePassword('secret')).toBe('')
  })

  it('整体校验与可提交判定', () => {
    expect(validateLoginForm(emptyLoginForm())).toEqual({
      username: '请输入用户名',
      password: '请输入密码',
    })
    expect(isLoginFormValid({ username: 'admin', password: 'pw' })).toBe(true)
    expect(isLoginFormValid({ username: '', password: 'pw' })).toBe(false)
    expect(isLoginFormValid({ username: 'admin', password: '' })).toBe(false)
  })

  it('登录后回跳目标解析（仅应用内路径，防开放跳转）', () => {
    expect(resolveLoginRedirect('/treasury/accounts')).toBe('/treasury/accounts')
    expect(resolveLoginRedirect('/workbench?x=1')).toBe('/workbench?x=1')
    expect(resolveLoginRedirect(undefined)).toBe('/workbench')
    expect(resolveLoginRedirect('')).toBe('/workbench')
    expect(resolveLoginRedirect('https://evil.example')).toBe('/workbench')
    expect(resolveLoginRedirect('//evil.example')).toBe('/workbench')
    expect(resolveLoginRedirect('/login')).toBe('/workbench')
  })
})
