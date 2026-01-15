import { config, state } from '../../core/config.js'
import chalk from 'chalk'

export default function list() {
  const workspaces = config.get('workspaces')
  const active = state.get('activeWorkspace')

  console.log(chalk.cyan('\n📦 Workspaces:\n'))

  if (!Object.keys(workspaces).length) {
    console.log('No workspaces defined.\nRun: gw add\n')
    return
  }

  for (const [name, ws] of Object.entries(workspaces)) {
    const mark = name === active ? chalk.green(' ● active') : ''
    console.log(`- ${chalk.bold(name)} (${ws.userEmail})${mark}`)
  }

  console.log('')
}
