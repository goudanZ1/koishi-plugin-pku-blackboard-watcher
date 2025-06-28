import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * 文本加密工具类，用于 IAAA 密码的存储和提取
 */
export class CryptoUtils {
  private encryptionKey: string

  constructor(encryptionKey: string) {
    this.encryptionKey = encryptionKey
  }

  /**
   * 加密文本
   */
  encrypt(text: string): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)),
      iv
    )
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  /**
   * 解密文本
   */
  decrypt(text: string): string {
    if (!text) return ''
    try {
      const parts = text.split(':')
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]
      const decipher = createDecipheriv(
        'aes-256-cbc',
        Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)),
        iv
      )
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (e) {
      // 解密失败时抛出错误，让调用者处理
      throw new Error(`解密 IAAA 密码失败：${e.message}`)
    }
  }
}

/**
 * 解析 json 格式字符串，出现错误时返回空对象
 */
export function parseJSON(text: string, fallback: any = {}): any {
  try {
    return JSON.parse(text || '{}')
  } catch {
    return fallback
  }
}

/**
 * 延迟函数，模拟 sleep 若干毫秒
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 将毫秒时间戳转换为可读东八区时间字符串
 */
export function convertToTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

/**
 * 将 UTC 时间字符串转换为毫秒时间戳
 */
export function convertToTimestamp(timeStr: string): number {
  const date = new Date(timeStr)
  return date.getTime()
}

/**
 * 将 UTC 时间字符串转换到东八区时间字符串
 */
export function convertTimezone(timeStr: string): string {
  const date = new Date(timeStr)
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

/**
 * 测试指定时间是否在当前时间后的指定小时内
 */
export function testWithinHours(timeStr: string, advanceHours: number): boolean {
  const currentTimestamp = Date.now()
  const targetTimestamp = convertToTimestamp(timeStr)
  return targetTimestamp - currentTimestamp <= advanceHours * 3600000
}

/**
 * 去除课程名的学期后缀
 */
export function removeSuffix(courseName: string): string {
  const pattern = /\([^()]*\)$/
  return courseName.replace(pattern, '')
}

/**
 * 解析 html 并提取通知标题中的有效信息，去除 "课程公告" "打开/拒绝" 等标签
 */
export function parseTitle(titleHtml: string): string {
  if (!titleHtml) return ''

  let html = titleHtml

  // 去除 class="inlineContextMenu" 的标签及其内容
  html = html.replace(/<[^>]*class="[^"]*inlineContextMenu[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')

  // 去除 class="announcementType" 的标签及其内容
  html = html.replace(/<[^>]*class="[^"]*announcementType[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')

  // 去除 class="announcementPosted" 的标签及其内容
  html = html.replace(/<[^>]*class="[^"]*announcementPosted[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')

  // 去除所有剩余的 HTML 标签
  return html.replace(/<[^>]*>/g, '').trim().slice(0, -2)
}

/**
 * 解析 html 并提取通知内容中的有效信息
 */
export function parseContent(contentHtml: string): string {
  if (!contentHtml) return ''

  // 去除所有 HTML 标签，提取纯文本
  return contentHtml.replace(/<[^>]*>/g, '').trim()
}

/**
 * 根据上传作业页面的内容，判断用户是否已经提交过该作业
 */
export function hasAttempted(assignmentHtml: string): boolean {
  if (!assignmentHtml) return false

  // 提取 title 标签的内容
  const titleMatch = assignmentHtml.match(/<title[^>]*>(.*?)<\/title>/is)
  if (!titleMatch || !titleMatch[1]) return false

  const titleText = titleMatch[1].replace(/<[^>]*>/g, '').trim()

  return titleText.length > 0 && titleText[0] === '复'
}

/**
 * 提取上传作业页面中的作业要求（文字与附件）
 */
export function parseInstruction(assignmentHtml: string): string {
  if (!assignmentHtml) return ''

  let text = ''

  // 提取 class="vtbegenerated" 的div中的文本
  const vtbGeneratedMatch = assignmentHtml.match(/<div[^>]*class="[^"]*vtbegenerated[^"]*"[^>]*>(.*?)<\/div>/is)
  if (vtbGeneratedMatch) {
    text = vtbGeneratedMatch[1].replace(/<[^>]*>/g, '').trim()
  }

  // 检查是否已提交过该作业
  const isSubmitted = hasAttempted(assignmentHtml)

  if (isSubmitted) {
    // 已提交过该作业
    const assignmentInfoMatch = assignmentHtml.match(/<div[^>]*id="assignmentInfo"[^>]*>(.*?)<\/div>/is)
    if (assignmentInfoMatch) {
      const links = assignmentInfoMatch[1].match(/<a[^>]*>(.*?)<\/a>/gis)
      if (links) {
        links.forEach((link, index) => {
          const linkText = link.replace(/<[^>]*>/g, '').trim()
          if (linkText) {
            text += `\n附件${index + 1}：${linkText}`
          }
        })
      }
    }
  } else {
    // 未提交过该作业
    const instructionsMatch = assignmentHtml.match(/<li[^>]*id="instructions"[^>]*>(.*?)<\/li>/is)
    if (instructionsMatch) {
      const links = instructionsMatch[1].match(/<a[^>]*>(.*?)<\/a>/gis)
      if (links) {
        links.forEach((link, index) => {
          const linkText = link.replace(/<[^>]*>/g, '').trim()
          if (linkText) {
            text += `\n附件${index + 1}：${linkText}`
          }
        })
      }
    }
  }

  return text
}
