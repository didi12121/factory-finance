/**
 * 登录页视图模型（纯函数）：表单校验与登录后回跳目标解析。
 * 后端校验为最终防线（400 VALIDATION_ERROR / 401），本层只做即时反馈。
 */

/** 登录表单状态 */
export interface LoginFormState {
  username: string
  password: string
}

/** 登录表单字段错误 */
export interface LoginFormErrors {
  username: string
  password: string
}

/** 初始表单状态 */
export function emptyLoginForm(): LoginFormState {
  return { username: '', password: '' }
}

/** 初始字段错误（无错误） */
export function emptyLoginErrors(): LoginFormErrors {
  return { username: '', password: '' }
}

/** 用户名约束：必填，≤ 64 字符（对齐 LoginRequest 校验） */
export function validateUsername(username: string): string {
  const value = username.trim()
  if (value === '') {
    return '请输入用户名'
  }
  if (value.length > 64) {
    return '用户名长度不能超过 64'
  }
  return ''
}

/** 密码约束：必填，≤ 128 字符（对齐 LoginRequest 校验） */
export function validatePassword(password: string): string {
  if (password === '') {
    return '请输入密码'
  }
  if (password.length > 128) {
    return '密码长度不能超过 128'
  }
  return ''
}

/**
 * 整体校验：返回字段错误（全部为空即通过）。
 */
export function validateLoginForm(form: LoginFormState): LoginFormErrors {
  return {
    username: validateUsername(form.username),
    password: validatePassword(form.password),
  }
}

/** 表单是否可提交 */
export function isLoginFormValid(form: LoginFormState): boolean {
  const errors = validateLoginForm(form)
  return errors.username === '' && errors.password === ''
}

/**
 * 登录成功后的回跳目标解析。
 * - 仅接受应用内绝对路径（以 `/` 开头且非 `//`，防开放跳转）；
 * - 无效/缺失回退 `/workbench`。
 */
export function resolveLoginRedirect(redirect: unknown): string {
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.startsWith('/login')
  ) {
    return redirect
  }
  return '/workbench'
}
