import { Context } from 'koishi'
import { Config, name, inject } from './types'
import { initializeDatabase } from './database'
import { registerIAAACommands } from './commands/iaaa'
import { registerConfigCommands } from './commands/config'
import { registerCheckCommands } from './commands/check'
import { ScheduleService } from './core/schedule'

export { name, Config, inject } from './types'

export function apply(ctx: Context, config: Config) {
  // 初始化数据库模型
  initializeDatabase(ctx)

  // 注册 iaaa, blackboard.config, blackboard.check 指令
  registerIAAACommands(ctx, config)
  registerConfigCommands(ctx, config)
  registerCheckCommands(ctx, config)

  // 初始化并启动定时服务
  const scheduleService = new ScheduleService(ctx, config)
  scheduleService.startSchedule()

  // 插件卸载时停止定时任务
  ctx.on('dispose', () => {
    scheduleService.stopSchedule()
  })
}
