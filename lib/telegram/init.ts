import { startBot } from './bot'

let started = false

export function initTelegramBot(): void {
  if (started) return
  if (typeof window !== 'undefined') return
  started = true

  startBot()
}
