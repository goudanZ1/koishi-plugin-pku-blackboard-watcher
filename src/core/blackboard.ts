import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { delay, testWithinHours } from '../utils'

/**
 * 教学网登录与数据获取功能类
 */
export class BlackboardClient {
  private session: AxiosInstance
  private username: string
  private password: string
  private logger: any
  private cookies: Map<string, string> = new Map() // 手动管理教学网域名下的 cookies

  constructor(username: string, password: string, logger?: any) {
    this.username = username
    this.password = password
    this.logger = logger
    this.session = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
      },
      withCredentials: true,
      // maxRedirects: 10
    })

    /*
    // 添加请求拦截器，自动添加 Cookie
    this.session.interceptors.request.use((config) => {
      if (this.cookies.size > 0) {
        const cookieString = Array.from(this.cookies.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join('; ')
        config.headers.Cookie = cookieString
        this.logger?.info('发送请求，Cookie:', cookieString)
      }
      return config
    })

    // 添加响应拦截器，自动保存 Cookie
    this.session.interceptors.response.use((response) => {
      this.logger?.info(response.headers)
      this.extractCookies(response)
      return response
    }, (error) => {
      if (error.response) {
        this.extractCookies(error.response)
      }
      return Promise.reject(error)
    })
    */
  }

  /**
   * 从响应头中提取并保存 cookies
   */
  private extractCookies(response: AxiosResponse) {
    const setCookieHeaders = response.headers['set-cookie']
    if (setCookieHeaders) {
      setCookieHeaders.forEach((cookie: string) => {
        const [nameValue] = cookie.split(';')
        const [name, value] = nameValue.split('=')
        if (name && value) {
          this.cookies.set(name.trim(), value.trim())
          // this.logger?.info(`保存 Cookie: ${name.trim()}=${value.trim()}`)
        }
      })
    }
  }

  /**
   * 根据 self.cookies 构造出 Cookie 字符串以加入到请求头
   */
  private generateCookieString(): string {
    let cookieString = ''
    if (this.cookies.size > 0) {
      cookieString = Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    }
    // this.logger?.info(`发送请求时手动添加 Cookie 字段: ${cookieString}`)
    return cookieString
  }

  /**
   * 登录 IAAA 和教学网系统，保存会话 course.pku.edu.cn/ 下的 cookie s_session_id
   */
  async login(): Promise<boolean> {
    try {
      // IAAA 登录，响应头分配一个 iaaa.pku.edu.cn/ 下的 cookie JSESSIONID（不重要），响应体包含一个 token
      let response = await this.session.post(
        'https://iaaa.pku.edu.cn/iaaa/oauthlogin.do',
        new URLSearchParams({
          appid: 'blackboard',
          userName: this.username,
          password: this.password,
          redirUrl: 'http://course.pku.edu.cn/webapps/bb-sso-BBLEARN/execute/authValidate/campusLogin'
        })
      )

      const iaaa_data = response.data
      if (!iaaa_data.success) {
        throw new Error('IAAA 登录失败，请检查学号和密码')
      }

      // IAAA 登录成功
      const token = iaaa_data.token

      // 教学网登录，响应头分配一个 course.pku.edu.cn/ 下的 cookie s_session_id
      response = await this.session.get(
        'https://course.pku.edu.cn/webapps/bb-sso-BBLEARN/execute/authValidate/campusLogin',
        { params: { token } }
      )

      this.extractCookies(response)

      return true

    } catch (e) {
      // 教学网登录过程出错
      this.logger?.error(`IAAA 与教学网登录失败：${e.message}`)
      if (e.response) {
        this.logger?.error(`HTTP 状态码：${e.response.status}`)
        this.logger?.error(`响应内容：${JSON.stringify(e.response.data)}`)
      }
      return false
    }
  }

  /**
   * 获取教学网上的全部通知数据，返回数据为 json 格式
   */
  async getNoticeData(): Promise<any> {
    try {
      // 首先获取 streamViewer 页面的会话，响应头分配一个 course.pku.edu.cn/webapps/streamViewer 下的 cookie JSESSIONID
      let response = await this.session.get(
        'https://course.pku.edu.cn/webapps/streamViewer/streamViewer',
        {
          params: {
            cmd: 'view',
            streamName: 'alerts',
            globalNavigation: 'false'
          },
          headers: {
            'Cookie': this.generateCookieString()
          }
        }
      )

      this.extractCookies(response)

      // 模拟睡眠 3 秒，等待服务端数据加载，防止返回空数据
      await delay(3000)

      // 请求通知数据
      response = await this.session.post(
        'https://course.pku.edu.cn/webapps/streamViewer/streamViewer',
        new URLSearchParams({
          cmd: 'loadStream',
          streamName: 'alerts',
          providers: '{}',
          forOverview: 'false'
        }),
        {
          headers: {
            'Cookie': this.generateCookieString()
          }
        }
      )

      this.extractCookies(response)

      return response.data

    } catch (e) {
      this.logger?.error(`获取通知数据失败：${e.message}`)
      if (e.response) {
        this.logger?.error(`HTTP 状态码：${e.response.status}`)
        this.logger?.error(`响应内容：${JSON.stringify(e.response.data)}`)
      }
      throw new Error(`获取通知数据失败：${e.message}`)
    }
  }

  /**
   * 获取从现在开始的若干小时内的全部日程数据，返回数据为 json 格式
   */
  async getCalendarData(advanceHours: number): Promise<any> {
    try {
      const currentTimestamp = Date.now()
      const response = await this.session.get(
        'https://course.pku.edu.cn/webapps/calendar/calendarData/selectedCalendarEvents',
        {
          params: {
            start: currentTimestamp - 3 * 3600000,
            end: currentTimestamp + advanceHours * 3600000,
            course_id: '',
            mode: 'personal'
          },
          headers: {
            'Cookie': this.generateCookieString()
          }
        }
      )

      this.extractCookies(response)

      // 手动再检查一下日程截止时间是否确实在范围内
      const filteredData = response.data.filter((entry: any) => {
        return testWithinHours(entry.endDate, advanceHours)
      })

      return filteredData

    } catch (e) {
      this.logger?.error(`获取日程数据失败：${e.message}`)
      if (e.response) {
        this.logger?.error(`HTTP 状态码：${e.response.status}`)
        this.logger?.error(`响应内容：${JSON.stringify(e.response.data)}`)
      }
      throw new Error(`获取日程数据失败：${e.message}`)
    }
  }

  /**
   * 由 notice entry（通知条目）中的 uri 获取对应作业的上传页面 html
   */
  async getAssignmentFromNotice(uri: string): Promise<string> {
    try {
      const response = await this.session.get(`https://course.pku.edu.cn${uri}`,
        {
          headers: {
            'Cookie': this.generateCookieString()
          }
        }
      )
      this.extractCookies(response)
      return response.data
    } catch (e) {
      throw new Error(`获取作业上传页面失败：${e.message}`)
    }
  }

  /**
   * 由 calendar_id 获取对应作业的上传页面 html
   */
  async getAssignmentFromCalendar(calendarId: string): Promise<string> {
    try {
      const response = await this.session.get(
        `https://course.pku.edu.cn/webapps/calendar/launch/attempt/${calendarId}`,
        {
          headers: {
            'Cookie': this.generateCookieString()
          }
        }
      )
      this.extractCookies(response)
      // 这个请求会重定向到对应作业的 /webapps/assignment/uploadAssignment 页面
      return response.data
    } catch (e) {
      throw new Error(`获取作业上传页面失败：${e.message}`)
    }
  }
}
