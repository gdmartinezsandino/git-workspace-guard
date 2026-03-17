import fs from 'fs-extra'
import path from 'path'

import { config } from './config.js'
import { GW_SSH_CONFIG, SSH_CONFIG_PATH, ACTIVE_KEY_SYMLINK } from './constants.js'

/**
 * Regenerates ~/.gw/ssh_config with Host aliases for all configured workspaces
 * and ensures ~/.ssh/config includes it.
 *
 * Must be called after any workspace add / remove / edit so that SSH aliases
 * like gw-<name> are always in sync with the workspace list.
 */
export async function setupSSHConfig(): Promise<void> {
  const workspaces = config.get('workspaces')
  const names = Object.keys(workspaces)

  // Map both real provider domains and workspace aliases (gw-<name>) to the
  // active key symlink. This lets SSH resolve gw-<name> without manual config.
  const aliases = names.map(n => `gw-${n}`).join(' ')
  const domains = 'github.com bitbucket.org gitlab.com'

  const dynamicConfig = `# Git Workspace Guard - Unified Hijack
Host ${domains}${aliases ? ` ${aliases}` : ''}
    IdentityFile ${ACTIVE_KEY_SYMLINK}
    IdentitiesOnly yes
    User git
`

  await fs.ensureDir(path.dirname(GW_SSH_CONFIG))
  await fs.writeFile(GW_SSH_CONFIG, dynamicConfig)

  let mainConfig = ''
  if (await fs.pathExists(SSH_CONFIG_PATH)) {
    mainConfig = await fs.readFile(SSH_CONFIG_PATH, 'utf8')
  }

  const includeLine = `Include "${GW_SSH_CONFIG}"`
  if (!mainConfig.includes(GW_SSH_CONFIG)) {
    await fs.writeFile(SSH_CONFIG_PATH, `${includeLine}\n\n${mainConfig}`, { mode: 0o600 })
  }
}
