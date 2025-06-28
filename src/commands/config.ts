import { Context } from 'koishi'
import { Config } from '../types'
import { parseJSON } from '../utils'
import { getOrCreateBBConfig, upsertBBConfig } from '../database'

/**
 * 注册个人配置管理指令
 */
export function registerConfigCommands(ctx: Context, config: Config) {
  // 创建 bb 指令组
  const bbCmd = ctx.command('blackboard', '教学网监听相关指令组').alias('bb')

  // 基本配置指令
  const configCmd = bbCmd.subcommand('.config', '管理教学网监听配置')

  // 查看当前配置
  configCmd.subcommand('.info', '查看当前的教学网监听配置')
    .action(async ({ session }) => {
      const bbConfig = await getOrCreateBBConfig(ctx, session.userId)

      // 解析课程别名配置、特定课程需要提醒的事件类型的配置
      const courseAliases = parseJSON(bbConfig.courseAliases, {})
      const specificCourseEvents = parseJSON(bbConfig.specificCourseEvents, {})

      // 解析通知类型
      const eventTypes = {
        '1': '作业相关通知',
        '2': '内容与课件相关通知',
        '3': '公告等其他通知'
      }
      const allowedTypes = bbConfig.generalAllowedEvents.split('').map(num => eventTypes[num]).filter(Boolean)

      let configText = `当前您的教学网监听配置：`

      // 通用配置
      configText += `\n\n通用配置：`

      configText += `\n- 每隔 ${config.checkInterval} 分钟检查一次是否有新通知与未完成的 DDL（由管理员统一设置），您也可以分别禁用新通知的检查和日程（DDL）的检查`

      // 显示课程别名
      if (Object.keys(courseAliases).length > 0) {
        configText += `\n- 课程别名：`
        Object.entries(courseAliases).forEach(([course, alias]) => {
          configText += `\n  ${course} → ${alias}`
        })
      } else {
        configText += `\n- 课程别名：未设置`
      }

      // 通知提醒配置
      configText += `\n\n通知提醒配置：`
      if (bbConfig.notifyNotice) {
        configText += `\n- 状态：已启用通知提醒`
        configText += `\n- 提醒消息前缀：${bbConfig.noticeTitlePrefix}`
        configText += `\n- 需要提醒的通知类型：${allowedTypes.length > 0 ? allowedTypes.join('，') : '无'}`

        // 显示特定课程事件配置
        if (Object.keys(specificCourseEvents).length > 0) {
          configText += `\n- 特定课程需要提醒的通知类型（优先级高于上面的总体配置）：`
          Object.entries(specificCourseEvents).forEach(([course, events]) => {
            const courseTypes = events.toString().split('').map(num => eventTypes[num]).filter(Boolean)
            configText += `\n  ${course}：${courseTypes.join('，')}`
          })
        } else {
          configText += `\n- 特定课程需要提醒的通知类型：未设置`
        }
      } else {
        configText += `\n- 状态：未启用通知提醒`
      }

      // 日程提醒配置
      configText += `\n\n日程提醒配置：`
      if (bbConfig.notifyAssignment) {
        configText += `\n- 状态：已启用日程提醒`
        configText += `\n- 提前提醒时间：${bbConfig.calendarAdvanceHours} 小时（左右）`
        configText += `\n- 提醒消息前缀：${bbConfig.assignmentTitlePrefix}`
      } else {
        configText += `\n- 状态：未启用日程提醒`
      }

      return configText
    })

  // 交互式配置设置
  configCmd.subcommand('.set', '交互式设置配置参数')
    .action(async ({ session }) => {
      const configOptions = {
        '1': { key: 'courseAliases', name: '课程别名', type: 'json' },
        '2': { key: 'notifyNotice', name: '是否启用通知提醒', type: 'boolean' },
        '3': { key: 'noticeTitlePrefix', name: '通知提醒消息前缀', type: 'string' },
        '4': { key: 'generalAllowedEvents', name: '需要提醒的通知类型', type: 'events' },
        '5': { key: 'specificCourseEvents', name: '特定课程需要提醒的通知类型', type: 'json' },
        '6': { key: 'notifyAssignment', name: '是否启用日程提醒', type: 'boolean' },
        '7': { key: 'calendarAdvanceHours', name: '提前提醒时间', type: 'number' },
        '8': { key: 'assignmentTitlePrefix', name: '日程提醒消息前缀', type: 'string' }
      }

      // 1. 显示配置选项
      let optionsList = '请选择要修改的配置项：\n\n'
      Object.entries(configOptions).forEach(([num, option]) => {
        optionsList += `${num}. ${option.name}\n`
      })
      optionsList += '\n回复对应数字选择配置项，或回复 quit 退出设置'

      await session.send(optionsList)

      // 等待用户选择配置项
      const choice = await session.prompt(30000)
      if (!choice || choice.toLowerCase() === 'quit') {
        return '已退出配置设置'
      }

      const selectedOption = configOptions[choice.trim()]
      if (!selectedOption) {
        return '选择无效，请重新运行命令 blackboard.config.set'
      }

      // 2. 根据选择的配置项类型，提供相应的输入提示
      let promptMessage = `正在设置：${selectedOption.name}\n\n`

      switch (selectedOption.type) {
        case 'boolean':
          promptMessage += '请回复 yes 启用或 no 禁用\n回复 quit 退出设置'
          await session.send(promptMessage)

          const boolValue = await session.prompt(30000)
          if (!boolValue || boolValue.toLowerCase() === 'quit') {
            return '已退出配置设置'
          }

          if (boolValue.toLowerCase() === 'yes' || boolValue.toLowerCase() === 'y') {
            await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: true })
            return `已启用 ${selectedOption.name.slice(4)}`
          } else if (boolValue.toLowerCase() === 'no' || boolValue.toLowerCase() === 'n') {
            await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: false })
            return `已禁用 ${selectedOption.name.slice(4)}`
          } else {
            return '输入无效，请重新运行命令 blackboard.config.set'
          }

        case 'string':
          promptMessage += '请输入新的值（字符串）\n回复 quit 退出设置'
          await session.send(promptMessage)

          const stringValue = await session.prompt(30000)
          if (!stringValue || stringValue.toLowerCase() === 'quit') {
            return '已退出配置设置'
          }

          await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: stringValue })
          return `已设置 ${selectedOption.name} 为：'${stringValue}'`

        case 'number':
          promptMessage += '请输入新的数值（3 到 48 之间的整数，作为提前提醒的小时数）\n回复 quit 退出设置'
          await session.send(promptMessage)

          const numberValue = await session.prompt(30000)
          if (!numberValue || numberValue.toLowerCase() === 'quit') {
            return '已退出配置设置'
          }

          const num = parseInt(numberValue.trim())
          if (isNaN(num) || num < 3 || num > 48) {
            return '输入的整数必须在 3 到 48 之间，请重新运行 blackboard.config.set'
          }

          await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: num })
          return `已设置 ${selectedOption.name} 为：${num} 小时`

        case 'events':
          promptMessage += '请选择需要提醒的通知类型（可组合）：\n'
          promptMessage += '1 - 作业相关通知\n'
          promptMessage += '2 - 内容与课件相关通知\n'
          promptMessage += '3 - 公告等其他通知\n\n'
          promptMessage += '示例：\n'
          promptMessage += '回复 "13" 表示只提醒作业和公告\n'
          promptMessage += '回复 "123" 表示提醒所有类型\n'
          promptMessage += '回复 quit 退出设置'
          await session.send(promptMessage)

          const eventsValue = await session.prompt(30000)
          if (!eventsValue || eventsValue.toLowerCase() === 'quit') {
            return '已退出配置设置'
          }

          const events = eventsValue.trim()
          if (!/^[123]+$/.test(events) || events.length === 0) {
            return '只能输入数字 1、2、3 的组合，请重新运行 blackboard.config.set'
          }

          await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: events })

          const eventTypes = {
            '1': '作业相关通知',
            '2': '内容与课件相关通知',
            '3': '公告等其他通知'
          }
          const selectedTypes = events.split('').map(num => eventTypes[num]).join('，')
          return `已设置全局通知类型为：${selectedTypes}`

        case 'json':
          if (selectedOption.key === 'courseAliases') {
            promptMessage += '课程别名设置格式说明：\n\n'
            promptMessage += '请输入 JSON 格式的课程别名配置\n'
            promptMessage += '示例：{"高等数学": "高数", "计算机系统导论": "ICS"}\n\n'
            promptMessage += '回复 clear 清空所有别名\n'
            promptMessage += '回复 quit 退出设置'
          } else if (selectedOption.key === 'specificCourseEvents') {
            promptMessage += '特定课程通知类型设置格式说明（优先级高于全局设置）：\n\n'
            promptMessage += '请输入 JSON 格式的课程通知配置\n'
            promptMessage += '示例：{"高等数学": "1", "计算机系统导论": "13"}\n'
            promptMessage += '（1：作业相关通知，2：内容与课件相关通知，3：公告等其他通知）\n\n'
            promptMessage += '回复 clear 清空所有配置\n'
            promptMessage += '回复 quit 退出设置'
          }
          await session.send(promptMessage)

          const jsonValue = await session.prompt(60000)
          if (!jsonValue || jsonValue.toLowerCase() === 'quit') {
            return '已退出配置设置'
          }

          if (jsonValue.toLowerCase() === 'clear') {
            await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: '{}' })
            return `已清空 ${selectedOption.name} 配置`
          }

          try {
            const parsed = JSON.parse(jsonValue.trim())
            await upsertBBConfig(ctx, session.userId, { [selectedOption.key]: JSON.stringify(parsed) })
            return `已更新 ${selectedOption.name} 配置`
          } catch (e) {
            return '无效的 JSON 格式，请重新运行命令 blackboard.config.set'
          }

        default:
          return '不支持的配置类型，请重新运行 blackboard.config.set'
      }
    })
}
