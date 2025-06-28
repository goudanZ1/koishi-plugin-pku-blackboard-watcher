import { Context } from 'koishi'
import { Config } from '../types'
import { CryptoUtils } from '../utils'
import { BlackboardClient } from '../core/blackboard'
import { getIAAAUser, upsertIAAAUser } from '../database'

/**
 * 注册 IAAA 认证相关指令
 */
export function registerIAAACommands(ctx: Context, config: Config) {
  const crypto = new CryptoUtils(config.encryptionKey)
  const logger = ctx.logger('pku-blackboard-watcher')

  // 创建 iaaa 指令组
  const iaaaCmd = ctx.command('iaaa', '北大 IAAA 认证信息管理')

  // 绑定 IAAA 账号
  iaaaCmd.subcommand('.bind <username> <password>', '绑定北大 IAAA 账号')
    .action(async ({ session }, username, password) => {
      if (!username || !password) {
        return '请在指令后提供学号和密码，格式如 iaaa.bind 2800011451 pswd1234'
      }

      // 测试使用用户提供的学号和密码能否在 IAAA 平台上登录
      let success = false;
      try {
        const client = new BlackboardClient(username, password, logger)
        success = await client.login()
      } catch (e) {
        return `IAAA 登录过程中发生错误: ${e.message}`
      }

      if (!success) {
        return 'IAAA 登录失败，请检查您的学号和密码是否正确'
      }

      // 更新认证信息（加密密码）
      await upsertIAAAUser(ctx, session.userId, username, crypto.encrypt(password))

      return 'IAAA 账号绑定成功！系统会安全加密存储您的密码'
    })

  // 查询自己的绑定信息
  iaaaCmd.subcommand('.info', '查询已绑定的 IAAA 账号信息')
    .action(async ({ session }) => {
      const iaaaUser = await getIAAAUser(ctx, session.userId)

      if (!iaaaUser) {
        return '您尚未绑定 IAAA 账号，请使用 iaaa.bind 命令进行绑定'
      }

      return `您已绑定 IAAA 账号，学号为 ${iaaaUser.username}`
    })
}
