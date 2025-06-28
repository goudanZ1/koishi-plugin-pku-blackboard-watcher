import { Context } from 'koishi'
import { Config } from '../types'
import { CryptoUtils, delay } from '../utils'
import { BlackboardClient } from './blackboard'
import { getIAAAUser, getOrCreateBBConfig } from '../database'
import { NoticeHandler } from './notice_handler'
import { CalendarHandler } from './calendar_handler'
import { } from "koishi-plugin-cron";

/**
 * 定时服务类，每隔 checkInterval 分钟为所有用户查询新通知和日程 DDL
 */
export class ScheduleService {
  private ctx: Context
  private config: Config
  private crypto: CryptoUtils
  private disposeTask?: () => void
  private logger: any

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx
    this.config = config
    this.crypto = new CryptoUtils(config.encryptionKey)
    this.logger = ctx.logger('pku-blackboard-watcher')
  }

  /**
   * 为单个用户查询新通知和日程 DDL
   */
  async checkSingleUser(userId: string): Promise<void> {
    try {
      // 若用户还没有绑定 IAAA 登录信息，就跳过这个用户
      const iaaaUser = await getIAAAUser(this.ctx, userId)
      if (!iaaaUser) return

      // 若用户配置了对新通知和日程 DDL 都不需要提醒，就跳过这个用户
      const bbConfig = await getOrCreateBBConfig(this.ctx, userId)
      if (!bbConfig.notifyNotice && !bbConfig.notifyAssignment) return

      const username = iaaaUser.username
      const password = this.crypto.decrypt(iaaaUser.password)

      const client = new BlackboardClient(username, password, this.logger)
      await client.login()

      // 创建一个模拟 session 来发送消息
      const mockSession = {
        userId,
        send: async (message: string) => {
          // 通过 bot 发送私信
          const bots = this.ctx.bots
          for (const bot of bots.values()) {
            try {
              await bot.sendPrivateMessage(userId, message)
              break
            } catch (e) {
              this.logger.error(`发送消息失败 (bot: ${bot.platform})：`, e)
            }
          }
        }
      }

      if (bbConfig.notifyNotice) {
        // 用模拟 session 创建通知处理器实例，如果有新通知就可以向用户发送提醒消息
        const noticeHandler = new NoticeHandler(this.ctx, userId, bbConfig, client, mockSession as any)
        await noticeHandler.process()
      }

      if (bbConfig.notifyAssignment) {
        // 用模拟 session 创建日程处理器实例，如果有未完成的日程 DDL 就可以向用户发送提醒消息
        const calendarHandler = new CalendarHandler(this.ctx, userId, bbConfig, client, mockSession as any)
        await calendarHandler.process()
      }

      this.logger.error(`成功为用户 ${userId} 查询新通知和日程 DDL`)

    } catch (error) {
      this.logger.error(`查询用户 ${userId} 的新通知和日程 DDL 时发生错误：${error}`)
    }
  }

  /**
   * 为所有用户查询新通知和日程 DDL
   */
  async checkAllUsers(): Promise<void> {
    try {
      this.logger.info('开始定时为所有用户查询新通知和日程 DDL...')

      // 获取所有绑定了 IAAA 登录信息的用户
      const iaaaUsers = await this.ctx.database.get('iaaa_user', {})

      for (const iaaaUser of iaaaUsers) {
        await this.checkSingleUser(iaaaUser.userId)
        await delay(1000) // 模拟睡眠 1 秒，避免请求过于频繁
      }

      this.logger.info(`定时查询完成，共查询了 ${iaaaUsers.length} 个用户`)
    } catch (error) {
      this.logger.error('定时查询过程中发生错误：', error)
    }
  }

  /**
   * 启动定时任务
   */
  startSchedule(): void {
    // 每隔 checkInterval 分钟执行一次
    const cronExpression = `*/${this.config.checkInterval} * * * *`

    try {
      this.disposeTask = (this.ctx as any).cron(cronExpression, () => {
        this.checkAllUsers()
      })

      this.logger.info(`定时任务已启动，每 ${this.config.checkInterval} 分钟为所有用户查询一次新通知和日程 DDL`)
    } catch (error) {
      this.logger.error('启动定时任务时发生错误：', error)
      throw error  // 如果定时任务启动失败，插件应该启动失败
    }
  }

  /**
   * 停止定时任务
   */
  stopSchedule(): void {
    if (this.disposeTask) {
      this.disposeTask()
      this.disposeTask = undefined
      this.logger.info('定时任务已停止')
    }
  }
}
