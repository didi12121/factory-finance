import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/vue 风格的类名合并工具 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
