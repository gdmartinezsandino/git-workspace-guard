import { createRequire } from 'module'
import { Command } from 'commander'
import { registerSystemCommands } from './commands/system/index.js'
import { registerWorkspaceCommands } from './commands/workspace/index.js'
import { registerPrCommands } from './commands/pr/index.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const program = new Command()

program
  .name('gw')
  .description('Git Workspace Guard CLI')
  .version(version)

registerSystemCommands(program)
registerWorkspaceCommands(program)
registerPrCommands(program)

program.parse()
