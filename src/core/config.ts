import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const GW_DIR = path.join(os.homedir(), '.gw')
const CONFIG_PATH = path.join(GW_DIR, 'config.json')
const STATE_PATH = path.join(GW_DIR, 'state.json')

type JsonObject = Record<string, any>

class Store<T extends JsonObject> {
  private file: string
  private defaults: T
  private data: T

  constructor(file: string, defaults: T) {
    this.file = file
    this.defaults = defaults

    fs.ensureFileSync(this.file)

    try {
      this.data = fs.readJsonSync(this.file)
    } catch {
      this.data = defaults
      fs.writeJsonSync(this.file, defaults, { spaces: 2 })
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]) {
    this.data[key] = value
    fs.writeJsonSync(this.file, this.data, { spaces: 2 })
  }

  all(): T {
    return this.data
  }
}

/* ---------- Typed stores ---------- */

type WorkspaceConfig = {
  workspaces: Record<string, any>
}

type StateConfig = {
  activeWorkspace: string | null
}

export const config = new Store<WorkspaceConfig>(CONFIG_PATH, { workspaces: {} })
export const state = new Store<StateConfig>(STATE_PATH, { activeWorkspace: null })

export { GW_DIR, CONFIG_PATH, STATE_PATH }
