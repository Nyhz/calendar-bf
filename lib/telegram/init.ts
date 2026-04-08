import { startBot } from './bot'
import { startCronJobs } from '../cron'

// Persist init state across hot reloads in dev mode
const globalForInit = globalThis as unknown as { __telegramInitDone?: boolean }

export function initTelegramBot(): void {
  if (globalForInit.__telegramInitDone) return
  if (typeof window !== 'undefined') return
  globalForInit.__telegramInitDone = true

  startBot()
  startCronJobs()
}
