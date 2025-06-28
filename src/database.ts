import { Context } from 'koishi'
import { IAAAUser, BlackboardWatcherConfig, NoticeRecord, AssignmentRecord } from './types'

/**
 * 初始化数据库模型
 */
export function initializeDatabase(ctx: Context) {
  // 创建 IAAA 认证信息表
  ctx.model.extend('iaaa_user', {
    id: 'unsigned',
    userId: { type: 'string', nullable: false },

    // IAAA 认证信息
    username: { type: 'string', nullable: false },
    password: { type: 'string', nullable: false },

    createdAt: { type: 'timestamp', nullable: false },
    updatedAt: { type: 'timestamp', nullable: false }
  }, {
    // 确保每个用户只有一条记录
    unique: ['userId']
  })

  // 创建 Blackboard Watcher 配置表
  ctx.model.extend('bb_watcher_config', {
    id: 'unsigned',
    userId: { type: 'string', nullable: false },

    // 通用配置，为课程指定的别名
    courseAliases: { type: 'string', initial: '{}' },

    // 通知提醒配置
    notifyNotice: { type: 'boolean', initial: true },
    noticeTitlePrefix: { type: 'string', initial: '[教学网]' },
    generalAllowedEvents: { type: 'string', initial: '123' },
    specificCourseEvents: { type: 'string', initial: '{}' },

    // 日程提醒配置
    notifyAssignment: { type: 'boolean', initial: true },
    calendarAdvanceHours: { type: 'integer', initial: 24 },
    assignmentTitlePrefix: { type: 'string', initial: '[DDL!]' },

    createdAt: { type: 'timestamp', nullable: false },
    updatedAt: { type: 'timestamp', nullable: false }
  }, {
    // 确保每个用户只有一条记录
    unique: ['userId']
  })

  // 创建通知记录表（记录已处理的通知）
  ctx.model.extend('notice_record', {
    id: 'unsigned',
    userId: { type: 'string', nullable: false },

    // 要记录的通知信息
    noticeId: { type: 'string', nullable: false },
    time: { type: 'string', nullable: false },
    course: { type: 'string', nullable: false },
    title: { type: 'string', nullable: false },
    content: { type: 'text', nullable: false },
    event: { type: 'string', nullable: false },
    shouldNotify: { type: 'boolean', nullable: false },

    createdAt: { type: 'timestamp', nullable: false },
    updatedAt: { type: 'timestamp', nullable: false }
  }, {
    primary: 'id',
    autoInc: true,
  })

  // 创建日程记录表（记录已处理的作业、事件 DDL）
  ctx.model.extend('assignment_record', {
    id: 'unsigned',
    userId: { type: 'string', nullable: false },

    // 要记录的日程信息
    assignmentId: { type: 'string', nullable: false },
    time: { type: 'string', nullable: false },
    course: { type: 'string', nullable: false },
    title: { type: 'string', nullable: false },
    description: { type: 'text', nullable: false },
    shouldNotify: { type: 'boolean', nullable: false },

    createdAt: { type: 'timestamp', nullable: false },
    updatedAt: { type: 'timestamp', nullable: false }
  }, {
    primary: 'id',
    autoInc: true,
  })
}

/**
 * 获取关联到给定 Koishi 用户 ID 的 IAAA 认证信息
 */
export async function getIAAAUser(ctx: Context, userId: string): Promise<IAAAUser | null> {
  const iaaaUsers = await ctx.database.get('iaaa_user', { userId })
  return iaaaUsers[0] || null
}

/**
 * 创建或更新用户的 IAAA 认证信息
 */
export async function upsertIAAAUser(ctx: Context, userId: string, username: string, password: string): Promise<void> {
  const now = new Date()

  // 先检查记录是否存在
  const existingUsers = await ctx.database.get('iaaa_user', { userId })
  const exists = existingUsers.length > 0

  if (exists) {
    // 记录存在，只更新必要字段，不修改 createdAt
    await ctx.database.upsert('iaaa_user', [
      {
        userId,
        username,
        password,
        updatedAt: now
      }
    ], ['userId'])  // 索引 userId 对应记录进行更新
  } else {
    // 记录不存在，创建新记录，设置 createdAt 为现在的时间
    await ctx.database.upsert('iaaa_user', [
      {
        userId,
        username,
        password,
        createdAt: now,
        updatedAt: now
      }
    ], ['userId'])
  }
}

/**
 * 获取或创建用户的 Blackboard Watcher 配置
 */
export async function getOrCreateBBConfig(ctx: Context, userId: string): Promise<BlackboardWatcherConfig> {
  let bbConfigs = await ctx.database.get('bb_watcher_config', { userId })
  let bbConfig = bbConfigs[0]

  if (!bbConfig) {
    // 若不存在，创建新的配置记录
    const now = new Date()
    const records = await ctx.database.upsert('bb_watcher_config', [
      {
        userId,
        createdAt: now,
        updatedAt: now
        // 其他字段使用模型中定义的默认值
      }
    ], ['userId'])
    bbConfig = records[0]
  }

  return bbConfig
}

/**
 * 创建或更新用户的 Blackboard Watcher 配置
 */
export async function upsertBBConfig(ctx: Context, userId: string, updates: Partial<BlackboardWatcherConfig>): Promise<void> {
  const now = new Date()

  // 先检查记录是否存在
  const existingConfigs = await ctx.database.get('bb_watcher_config', { userId })
  const exists = existingConfigs.length > 0

  if (exists) {
    // 记录存在，只更新必要字段，不修改 createdAt，其他字段保持原来值
    await ctx.database.upsert('bb_watcher_config', [
      {
        userId,
        updatedAt: now,
        ...updates
      }
    ], ['userId'])
  } else {
    // 记录不存在，创建新记录，设置 createdAt，其他字段采用默认值
    await ctx.database.upsert('bb_watcher_config', [
      {
        userId,
        createdAt: now,
        updatedAt: now,
        ...updates
      }
    ], ['userId'])
  }
}

/**
 * 获取用户的通知记录
 */
export async function getNoticeRecords(ctx: Context, userId: string): Promise<NoticeRecord[]> {
  return await ctx.database.get('notice_record', { userId })
}

/**
 * 批量创建通知记录
 */
export async function createNoticeRecords(ctx: Context, userId: string, records: Omit<NoticeRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]): Promise<void> {
  const now = new Date()
  const noticeRecords = records.map(record => ({
    userId,
    createdAt: now,
    updatedAt: now,
    ...record
  }))

  try {
    for (const record of noticeRecords) {
      await ctx.database.create('notice_record', record)
    }
  }
  catch (e) {
    console.log(`批量创建通知记录出错：${e.message}`)
  }
}

/**
 * 获取用户的日程记录
 */
export async function getAssignmentRecords(ctx: Context, userId: string): Promise<AssignmentRecord[]> {
  return await ctx.database.get('assignment_record', { userId })
}

/**
 * 批量创建日程记录
 */
export async function createAssignmentRecords(ctx: Context, userId: string, records: Omit<AssignmentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[]): Promise<void> {
  const now = new Date()
  const assignmentRecords = records.map(record => ({
    userId,
    createdAt: now,
    updatedAt: now,
    ...record
  }))

  try {
    for (const record of assignmentRecords) {
      await ctx.database.create('assignment_record', record)
    }
  }
  catch (e) {
    console.log(`批量创建日程记录出错：${e.message}`)
  }
}
