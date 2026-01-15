import type { Command } from 'commander'

import init from './init.js'
import doctor from './doctor.js'
import whoami from './whoami.js'
import status from './status.js'

export function registerSystemCommands(program: Command) {
  program.command('init').description('Install guard system').action(init)
  program.command('doctor').description('Run system diagnostics').action(doctor)
  program.command('whoami').description('Show current identity').action(whoami)
  program.command('status').description('Show current status').action(status)
}
