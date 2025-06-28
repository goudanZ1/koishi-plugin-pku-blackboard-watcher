import { Context } from 'koishi'
import { Config } from '../types'
import { CryptoUtils } from '../utils'
import { BlackboardClient } from '../core/blackboard'
import { getIAAAUser, getOrCreateBBConfig } from '../database'
import { NoticeHandler } from '../core/notice_handler'
import { CalendarHandler } from '../core/calendar_handler'

/**
 * 注册教学网手动查询新通知与日程 DDL 的指令
 */
export function registerCheckCommands(ctx: Context, config: Config) {
  const crypto = new CryptoUtils(config.encryptionKey)
  const logger = ctx.logger('pku-blackboard-watcher')

  // 立即查询自己的新通知和日程 DDL
  ctx.command('blackboard.check', '手动查询是否有新通知和日程 DDL')
    .action(async ({ session }) => {
      // 检查用户是否已绑定 IAAA 登录信息
      const iaaaUser = await getIAAAUser(ctx, session.userId)
      if (!iaaaUser) {
        return '您尚未绑定北大 IAAA 账号，请先使用 iaaa.bind 命令进行绑定'
      }

      const bbConfig = await getOrCreateBBConfig(ctx, session.userId)

      try {
        const username = iaaaUser.username
        const password = crypto.decrypt(iaaaUser.password)

        const client = new BlackboardClient(username, password, logger)
        await client.login()

        if (bbConfig.notifyNotice) {
          const noticeHandler = new NoticeHandler(ctx, session.userId, bbConfig, client, session)
          await noticeHandler.process()
        }

        if (bbConfig.notifyAssignment) {
          const calendarHandler = new CalendarHandler(ctx, session.userId, bbConfig, client, session)
          await calendarHandler.process()
        }

        return '新通知和日程 DDL 已查询完成！'

      } catch (e) {
        return `查询过程中发生错误：${e.message}`
      }
    })
}
