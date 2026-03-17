import chalk from 'chalk'

export const log = {
  title: (msg: string) => console.log(chalk.cyan(`\n${msg}\n`)),

  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(chalk.green(`✅ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`⚠️  ${msg}`)),
  error: (msg: string) => console.log(chalk.red(`❌ ${msg}`)),

  space: () => console.log('')
}
