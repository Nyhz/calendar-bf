import { startBot } from './bot'
import { startCronJobs } from '../cron'

let started = false

export function initTelegramBot(): void {
  if (started) return
  if (typeof window !== 'undefined') return
  started = true

  startBot()
  startCronJobs()
}
