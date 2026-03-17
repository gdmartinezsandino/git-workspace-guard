import prompts from 'prompts'
import chalk from 'chalk'

import { config } from '../../core/config.js'
import { questions } from '../../core/constants.js'
import { log } from '../../core/logger.js'

// Map providers to their actual domain names
const PROVIDER_DOMAINS = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org'
}

export default async function add() {
  log.title(chalk.cyan('\n➕ Add new workspace (identity)\n'))

  // 1. Prompt the user for input, and handle cancellation
  const response = await prompts(questions, {
    onCancel: () => {
      log.title(chalk.yellow('\n⚠️  Workspace creation cancelled.\n'))
      process.exit(0)
    }
  })

  
  const workspaces = config.get('workspaces') || {}
  const workspaceExist = workspaces[response.name]
  if (workspaceExist) {
    return log.error(chalk.red(`\n❌ Workspace "${response.name}" already exists.\n`))
  }

  // 3. Update the actual SSH Config file
  const domain = PROVIDER_DOMAINS[response.provider as keyof typeof PROVIDER_DOMAINS]

  // 4. Save to our JSON config
  const workspace = {
    provider: response.provider,
    userName: response.userName,
    userEmail: response.userEmail,
    sshKey: response.sshKey,
    // We store the alias name so we can reference it later
    sshAlias: `gw-${response.name}`,
    orgs: response.orgs.split(', ')
  }

  workspaces[response.name] = workspace
  config.set('workspaces', workspaces)

  log.title(chalk.green('\n✅ Workspace saved and SSH alias created\n'))
  log.title(chalk.dim(`Alias: ${workspace.sshAlias} -> ${domain}\n`))
}
