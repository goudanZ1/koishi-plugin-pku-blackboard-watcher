import { Context, Session } from 'koishi'
import { BlackboardWatcherConfig, NoticeRecord } from '../types'
import { BlackboardClient } from './blackboard'
import { getNoticeRecords, createNoticeRecords } from '../database'
import { parseTitle, parseContent, convertToTime, removeSuffix, parseJSON, convertTimezone, parseInstruction } from '../utils'

/**
 * 通知处理器类
 */
export class NoticeHandler {
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
   * 根据用户的配置判断事件是否需要通知
   */
  private isEventAllowed(course: string, event: string): boolean {
    const specificEvents = parseJSON(this.config.specificCourseEvents, {})
    const allowedEvents = specificEvents[course.toLowerCase()] || this.config.generalAllowedEvents

    if (event.startsWith('AS')) {
      return allowedEvents.includes('1')
    } else if (event.startsWith('CO')) {
      return allowedEvents.includes('2')
    } else {
      return allowedEvents.includes('3')
    }
  }

  /**
   * 从原始通知条目 notice entry 中提取有效信息，并整合为一条 record
   */
  private async filterNoticeInfo(entry: any, courseDict: Record<string, string>, isInit: boolean): Promise<Omit<NoticeRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> {
    const id = entry.se_id
    const time = convertToTime(entry.se_timestamp)
    const course = courseDict[entry.se_courseId] || ''
    const title = parseTitle(entry.se_context || '')
    let content = parseContent(entry.se_details || '')
    const event = entry.extraAttribs?.event_type || ''
    const shouldNotify = this.isEventAllowed(course, event)

    // 如果是作业可用事件且需要通知，则在 content 里添加作业要求和截止时间
    if (event === 'AS:AS_AVAIL' && entry.se_itemUri && shouldNotify && !isInit) {
      try {
        const assignmentHtml = await this.blackboard.getAssignmentFromNotice(entry.se_itemUri)
        const instruction = parseInstruction(assignmentHtml)
        if (instruction.length > 0) {
          content += `\n${instruction}`
        }
        const deadline = entry.itemSpecificData?.notificationDetails?.dueDate
        if (deadline) {
          content += `\n截止时间：${convertTimezone(deadline)}`
        }
      } catch (e) {
        this.logger.error('获取作业详情失败:', e)
      }
    }

    return {
      noticeId: id,
      time,
      course,
      title,
      content: content.trim(),
      event,
      shouldNotify
    }
  }

  /**
   * 由 notice record 生成对应的消息标题与内容，并发送给用户
   */
  private async notifyNotice(record: Omit<NoticeRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<void> {
    // 生成消息标题
    const aliases = parseJSON(this.config.courseAliases, {})
    // 如果用户提供了该课程的别名，则使用别名
    const course = aliases[record.course.toLowerCase()] || record.course
    const sep = course.length > 0 ? '：' : ''
    const subject = this.config.noticeTitlePrefix + ' ' + course + sep + record.title

    // 生成消息内容，显示通知发布时间
    let body = record.content
    body += `\n发布时间：${record.time}`

    await this.session.send(subject + '\n' + body.trim())
  }

  /**
   * 主处理函数，获取通知、过滤通知、发送消息、更新数据库表
   */
  async process(): Promise<void> {
    try {
      // 1. 从教学网获取通知原始信息
      const noticeData = await this.blackboard.getNoticeData()

      // 生成课程 ID 到课程名的映射
      const courseList = noticeData.sv_extras?.sx_courses || []
      const courseDict: Record<string, string> = {}
      for (const course of courseList) {
        courseDict[course.id] = removeSuffix(course.name)
      }

      // 2. 获取已处理的通知记录，并通过数据库表中的特殊记录判断是否需要初始化
      const oldNoticeRecords = await getNoticeRecords(this.ctx, this.userId)
      const oldNoticeIds = new Set(oldNoticeRecords.map(record => record.noticeId))
      const isInit = !oldNoticeIds.has('%init%')

      // 3. 从所有通知中过滤出新的（数据库中没有记录的）通知，并提取通知信息
      const updatedNoticeRecords: Omit<NoticeRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[] = []
      const streamEntries = noticeData.sv_streamEntries || []

      for (const entry of streamEntries) {
        if (!oldNoticeIds.has(entry.se_id)) {
          const record = await this.filterNoticeInfo(entry, courseDict, isInit)
          updatedNoticeRecords.push(record)
        }
      }

      // 4. 如果是初始化，发送初始化成功消息并添加初始化标记记录
      if (isInit) {
        await this.session.send(`通知提醒模块首次运行成功！\n初始化已完成，从教学网同步了 ${updatedNoticeRecords.length} 条已有通知。之后就可以自动检测新的通知并提醒您了~`)

        // 添加初始化标记记录
        const initRecord = {
          noticeId: '%init%',
          time: convertToTime(Date.now()),
          course: '',
          title: '初始化标记',
          content: '通知提醒模块初始化完成',
          event: '',
          shouldNotify: false
        }
        updatedNoticeRecords.push(initRecord)
      } else {
        // 否则根据用户对课程与 event 的屏蔽设置，选择性地对新通知进行提醒
        for (const record of updatedNoticeRecords) {
          if (record.shouldNotify) {
            await this.notifyNotice(record)
          } else {
            // this.logger.info(`通知已忽略：${record.title}（${record.course}）`)
          }
        }
      }

      // 5. 保存新的通知记录
      if (updatedNoticeRecords.length > 0) {
        await createNoticeRecords(this.ctx, this.userId, updatedNoticeRecords)
      }

    } catch (error) {
      // this.logger.error('处理通知时发生错误：', error)
      await this.session.send(`处理通知时发生错误：${error.message}`)
    }
  }
}
