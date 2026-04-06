import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename, dirname } from 'path'

const execFileAsync = promisify(execFile)

export async function transcribeAudio(filePath: string): Promise<string> {
  const backend = process.env.WHISPER_BACKEND || 'mlx-whisper'
  const model = process.env.WHISPER_MODEL || 'base'

  try {
    if (backend === 'mlx-whisper') {
      await execFileAsync('mlx_whisper', [
        '--model', model,
        '--language', 'en',
        '--output-format', 'txt',
        filePath,
      ])
    } else if (backend === 'whisper.cpp') {
      await execFileAsync('whisper-cpp', [
        '--model', model,
        '--language', 'en',
        '--output-txt',
        filePath,
      ])
    } else {
      throw new Error(`Unknown WHISPER_BACKEND: ${backend}`)
    }

    const txtPath = filePath.replace(/\.[^.]+$/, '.txt')
    const text = await readFile(txtPath, 'utf-8')

    await unlink(txtPath).catch(() => {})

    return text.trim()
  } catch (error) {
    console.error('Whisper transcription error:', error)
    throw new Error('Whisper transcription failed')
  }
}

export async function downloadTelegramFile(botToken: string, fileId: string): Promise<string> {
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  )
  const fileInfo = await fileInfoRes.json() as { ok: boolean; result: { file_path: string } }

  if (!fileInfo.ok) {
    throw new Error('Failed to get Telegram file info')
  }

  const telegramFilePath = fileInfo.result.file_path
  const downloadRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${telegramFilePath}`
  )

  if (!downloadRes.ok) {
    throw new Error('Failed to download Telegram file')
  }

  const buffer = Buffer.from(await downloadRes.arrayBuffer())
  const tempPath = join(tmpdir(), `telegram-${Date.now()}-${basename(fileId)}.ogg`)
  await writeFile(tempPath, buffer)

  return tempPath
}
