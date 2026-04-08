import { Bot } from 'grammy'
import { registerHandlers } from './handlers'

const token = process.env.TELEGRAM_BOT_TOKEN
const authorizedUserId = process.env.TELEGRAM_AUTHORIZED_USER_ID

// Persist bot instance across hot reloads in dev mode
const globalForBot = globalThis as unknown as { __telegramBot?: Bot | null; __telegramBotStarted?: boolean }

if (!token) {
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — bot disabled')
}

if (!globalForBot.__telegramBot && token) {
  globalForBot.__telegramBot = new Bot(token)
}

export const bot: Bot | null = globalForBot.__telegramBot ?? null

export function isAuthorized(ctx: { from?: { id: number } }): boolean {
  if (!authorizedUserId) {
    console.log(`[Telegram] Unauthorized request from user ID: ${ctx.from?.id} — set TELEGRAM_AUTHORIZED_USER_ID to authorize`)
    return false
  }
  return ctx.from?.id === Number(authorizedUserId)
}

export async function startBot(): Promise<void> {
  if (!bot) {
    console.warn('[Telegram] Bot not initialized — skipping start')
    return
  }

  if (globalForBot.__telegramBotStarted) {
    console.log('[Telegram] Bot already running — skipping duplicate start')
    return
  }
  globalForBot.__telegramBotStarted = true

  registerHandlers(bot)

  try {
    await bot.start({
      onStart: () => console.log('Telegram bot started in polling mode'),
    })
  } catch (error) {
    globalForBot.__telegramBotStarted = false
    console.error('[Telegram] Bot polling failed:', error)
  }
}
