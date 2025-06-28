import { Context, Session } from 'koishi'
import { BlackboardWatcherConfig, AssignmentRecord } from '../types'
import { BlackboardClient } from './blackboard'
import { getAssignmentRecords, createAssignmentRecords } from '../database'
import { convertToTime, convertTimezone, parseJSON, testWithinHours, hasAttempted, parseInstruction } from '../utils'

/**
 * 日程处理器类
 */
export class CalendarHandler {
  private logger: any

  constructor(
    private ctx: Context,
    private userId: string,
    private config: BlackboardWatcherConfig,
    private blackboard: BlackboardClient,
    private session: Session
  ) {
    this.logger = ctx.logger('pku-blackboard-watcher')
  }

  /**
   * 从原始日程条目 assignment entry 中提取有效信息，并整合为一条 record
   */
  private async filterAssignmentInfo(entry: any): Promise<Omit<AssignmentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> {
    const id = entry.id
    const time = convertTimezone(entry.endDate)
    const course = entry.calendarName.replace(/\([^()]*\)$/, '') // 去除学期后缀
    const title = entry.title
    let description = entry.description || ''
    let shouldNotify = true // 用户自定义的事件默认需要提醒

    // 如果是该日程是一个作业 DDL，检查是否已提交
    if (course !== '个人') {
      try {
        const assignmentHtml = await this.blackboard.getAssignmentFromCalendar(id)
        shouldNotify = !hasAttempted(assignmentHtml)
        // 若用户已提交过该作业则不用提醒，否则在 description 里加入作业要求并提醒
        if (shouldNotify) {
          const instruction = parseInstruction(assignmentHtml)
          if (instruction.length > 0) {
            description += `\n${instruction}`
          }
        }
      } catch (e) {
        this.logger.error('获取作业详情失败:', e)
      }
    }

    return {
      assignmentId: id,
      time,
      course,
      title,
      description: description.trim(),
      shouldNotify
    }
  }

  /**
   * 由 assignment record 生成对应的消息标题与内容，并发送给用户
   */
  private async notifyAssignment(record: Omit<AssignmentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<void> {
    // 生成消息标题
    let subject: string
    let course: string

    if (record.course === '个人') {
      if (record.title.includes('：')) {
        course = record.title.split('：')[0]
      } else {
        course = '个人事件'
      }
      subject = this.config.assignmentTitlePrefix + ' ' + record.title
    } else {
      // 如果用户提供了该课程的别名，则使用别名
      const aliases = parseJSON(this.config.courseAliases, {})
      course = aliases[record.course.toLowerCase()] || record.course
      const sep = course.length > 0 ? '：' : ''
      subject = this.config.assignmentTitlePrefix + ' ' + course + sep + record.title
    }

    // 生成消息内容，显示日程截止时间
    let body = record.description
    body += `\n截止时间：${record.time}`

    await this.session.send(subject + '\n' + body.trim())
  }

  /**
   * 主处理函数，获取日程、过滤日程、发送消息、更新数据库表
   */
  async process(): Promise<void> {
    try {
      // 1. 检查配置
      if (this.config.calendarAdvanceHours <= 0) {
        await this.session.send('DDL 提前通知时间不是正整数，请检查配置')
        return
      }

      // 2. 从教学网获取通知日程信息
      const calendarData = await this.blackboard.getCalendarData(this.config.calendarAdvanceHours)

      // 3. 获取已处理的日程记录，并通过数据库表中的特殊记录判断是否需要初始化
      const oldAssignmentRecords = await getAssignmentRecords(this.ctx, this.userId)
      const oldAssignmentIds = new Set(oldAssignmentRecords.map(record => record.assignmentId))
      const isInit = !oldAssignmentIds.has('%init%')

      // 4. 从所有通知中过滤出新的（数据库中没有记录的）日程，并提取日程信息
      const updatedAssignmentRecords: Omit<AssignmentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] = []

      for (const entry of calendarData) {
        if (!oldAssignmentIds.has(entry.id)) {
          const record = await this.filterAssignmentInfo(entry)
          updatedAssignmentRecords.push(record)
        }
      }

      // 5. 如果是初始化，发送初始化成功消息并添加初始化标记记录
      if (isInit) {
        await this.session.send(`日程提醒模块首次运行成功！\n之后就可以自动在作业、事件截止前提醒您了~`)

        // 添加初始化标记记录
        const initRecord = {
          assignmentId: '%init%',
          time: convertToTime(Date.now()),
          course: '',
          title: '初始化标记',
          description: '日程模块初始化完成',
          shouldNotify: false
        }
        updatedAssignmentRecords.push(initRecord)
      } else {
        // 否则对用户自定义的事件和未提交过的作业进行提醒
        for (const record of updatedAssignmentRecords) {
          if (record.shouldNotify) {
            await this.notifyAssignment(record)
          } else {
            // this.logger.info(`作业已提交过：${record.title}（${record.course}）`)
          }
        }
      }

      // 6. 保存新的日程记录
      if (updatedAssignmentRecords.length > 0) {
        await createAssignmentRecords(this.ctx, this.userId, updatedAssignmentRecords)
      }

    } catch (error) {
      // this.logger.error('处理日程时发生错误：', error)
      await this.session.send(`处理日程时发生错误：${error.message}`)
    }
  }
}
