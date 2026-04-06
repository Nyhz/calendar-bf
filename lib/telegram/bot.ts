import { Bot } from 'grammy'
import { registerHandlers } from './handlers'

const token = process.env.TELEGRAM_BOT_TOKEN
const authorizedUserId = process.env.TELEGRAM_AUTHORIZED_USER_ID

export const bot: Bot | null = token ? new Bot(token) : null

if (!token) {
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled')
}

export function isAuthorized(ctx: { from?: { id: number } }): boolean {
  if (!authorizedUserId) return false
  return ctx.from?.id === Number(authorizedUserId)
}

export async function startBot(): Promise<void> {
  if (!bot) {
    console.warn('[Telegram] Bot not initialized — skipping start')
    return
  }

  registerHandlers(bot)

  try {
    await bot.start({
      onStart: () => console.log('Telegram bot started in polling mode'),
    })
  } catch (error) {
    console.error('[Telegram] Bot polling failed:', error)
  }
}
