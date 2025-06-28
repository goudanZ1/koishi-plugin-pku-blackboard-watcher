import { Schema } from 'koishi'

export const name = 'pku-blackboard-watcher'

export const inject = ['database', 'cron']

// 全局配置接口
export interface Config {
  encryptionKey: string
  checkInterval: number
}

export const Config: Schema<Config> = Schema.object({
  encryptionKey: Schema.string().description('用于加密 IAAA 密码的密钥（设置后请不要随意修改）').required(),
  checkInterval: Schema.number().description('每隔多少时间（分钟）自动为所有用户检查新通知与 DDL').required().min(30).max(240).step(1),
})

// IAAA 认证信息表接口
export interface IAAAUser {
  id: number
  userId: string  // 关联到 Koishi 的 user.id

  username: string  // IAAA 用户名
  password: string  // 加密后的密码

  createdAt: Date
  updatedAt: Date
}

// Blackboard Watcher 配置表接口
export interface BlackboardWatcherConfig {
  id: number
  userId: string  // 关联到 Koishi 的 user.id

  // 通用配置
  courseAliases: string  // 为课程指定的别名（json 格式）

  // 通知提醒配置
  notifyNotice: boolean  // 是否需要检查新通知并提醒
  noticeTitlePrefix: string  // 提醒消息的前缀
  generalAllowedEvents: string  // 需要提醒的通知类型
  specificCourseEvents: string  // 为某些课程特别设置需要提醒的通知类型（json 格式）

  // 日程提醒配置
  notifyAssignment: boolean  // 是否需要检查未完成的 DDL 并提醒
  calendarAdvanceHours: number  // 在 DDL 截止前几小时（左右）发送提醒消息
  assignmentTitlePrefix: string  // 提醒消息的前缀

  createdAt: Date
  updatedAt: Date
}

// 通知记录表接口（记录已处理的通知）
export interface NoticeRecord {
  id: number
  userId: string  // 关联到 Koishi 的 user.id

  noticeId: string  // 通知的教学网 ID
  time: string  // 发布时间
  course: string  // 课程原始名称
  title: string  // 通知标题
  content: string  // 通知内容
  event: string  // 事件类型
  shouldNotify: boolean  // 是否需要通知

  createdAt: Date
  updatedAt: Date
}

// 日程记录表接口（记录已处理的作业、事件 DDL）
export interface AssignmentRecord {
  id: number
  userId: string  // 关联到 Koishi 的 user.id

  assignmentId: string  // 日程的教学网 ID
  time: string  // 截止时间
  course: string  // 课程原始名称
  title: string  // 日程标题
  description: string  // 日程描述
  shouldNotify: boolean  // 是否需要通知

  createdAt: Date
  updatedAt: Date
}

// 扩展 Koishi 的 Tables 接口，增加上述四个表
declare module 'koishi' {
  interface Tables {
    iaaa_user: IAAAUser
    bb_watcher_config: BlackboardWatcherConfig
    notice_record: NoticeRecord
    assignment_record: AssignmentRecord
  }
}
