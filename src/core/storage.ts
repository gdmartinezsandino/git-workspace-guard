import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const GW_DIR = path.join(os.homedir(), '.gw')
const CONFIG = path.join(GW_DIR, 'config.json')
const STATE = path.join(GW_DIR, 'state.json')
const ENV = path.join(GW_DIR, 'env')

type JsonValue = string | number | boolean | null | object

export async function ensureStorage(): Promise<void> {
  await fs.mkdir(GW_DIR, { recursive: true })

  await ensureFile(CONFIG, { workspaces: {} })
  await ensureFile(STATE, { activeWorkspace: null })
  await ensureFile(ENV, '')
}

async function ensureFile(file: string, content: JsonValue): Promise<void> {
  try {
    await fs.access(file)
  } catch {
    const data =
      typeof content === 'string'
        ? content
        : JSON.stringify(content, null, 2)

    await fs.writeFile(file, data)
  }
}
