export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initTelegramBot } = await import('./lib/telegram/init')
    initTelegramBot()
  }
}
