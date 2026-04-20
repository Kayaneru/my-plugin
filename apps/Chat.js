import plugin from '../../../lib/plugins/plugin.js'
import { AIchatAPI } from '../utils/AIchatAPI.js'
import { TTS } from '../utils/TTS.js'
import { VITS_SPEAKERS, convertVitsSpeaker } from '../utils/VitsSpeakers.js'
import Config from '../components/Config.js'
import fetch from 'node-fetch'
import { segment } from 'oicq'

// 对话历史存储（内存存储，重启后清空）
// 结构: { groupId: { userId: [messages] } }
const chatHistory = new Map()

// 最大历史条数
const MAX_HISTORY = 100

export class chat extends plugin {
  constructor() {
    super({
      name: 'AIchat对话',
      dsc: '与 AIchat 对话（支持图片+上下文）',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: '^[\\s\\S]*$',
          fnc: 'chatByAt',
          log: false
        },
        {
          reg: '^[^#][\\s\\S]*$',
          fnc: 'bym',
          log: false
        },
        {
          reg: '^#?(?:AIchat|aichat)\\s*$',
          fnc: 'chat',
          desc: 'AIchat对话（无文字则仅发送图片）'
        },
        {
          reg: '^#?(?:AIchat|aichat)(?:查看)?语音角色列表$',
          fnc: 'ttsRoleList',
          desc: '查看VITS语音角色列表'
        },
        {
          reg: '^#?(?:AIchat|aichat)(?:设置)?语音角色\s*(.*)$',
          fnc: 'setUserTTSRole',
          desc: '设置个人语音角色'
        },
        {
          reg: '^#?(?:AIchat|aichat)\\s+(.+)$',
          fnc: 'chat'
        }
      ]
    })
  }

  getAIchatConfig(cfg = {}) {
    const AIchat = cfg.AIchat || cfg.aichat || cfg.kimi || {}
    let triggerMode = String(AIchat.triggerMode || 'both').toLowerCase()
    if (!['prefix', 'at', 'both'].includes(triggerMode)) {
      triggerMode = 'both'
    }
    return {
      apiKey: AIchat.apiKey,
      baseUrl: AIchat.baseUrl,
      model: AIchat.model,
      enableSearch: AIchat.enableSearch !== false,
      allowPrivate: AIchat.allowPrivate !== false,
      groupMerge: AIchat.groupMerge === true,
      showThinking: AIchat.showThinking !== false,
      personaPrompt: AIchat.personaPrompt || '你是一个友好的AI助手，可以分析图片并回答问题。请简洁回答。',
      triggerMode
    }
  }

  canUseInPrivate(cfg = {}) {
    const isPrivate = !this.e.group_id
    if (!isPrivate) {
      return true
    }
    if (this.e.isMaster) {
      return true
    }
    const AIchatCfg = this.getAIchatConfig(cfg)
    return AIchatCfg.allowPrivate
  }

  isAtBot() {
    const selfId = String(this.e.self_id || this.e.bot?.uin || '')
    if (!selfId) {
      return false
    }

    // 1) 常规 e.at 字段
    const at = this.e.at
    if (Array.isArray(at)) {
      if (at.map(String).includes(selfId)) {
        return true
      }
    } else if (at && String(at) === selfId) {
      return true
    }

    // 2) 消息段内的 at（不同适配器字段名可能是 qq / id / target）
    if (Array.isArray(this.e.message)) {
      for (const seg of this.e.message) {
        if (seg?.type === 'at') {
          const target = String(seg?.qq || seg?.id || seg?.target || '')
          if (target === selfId) {
            return true
          }
        }
      }
    }

    // 3) CQ 码兜底
    const msg = String(this.e.msg || '')
    if (msg.includes(`[CQ:at,qq=${selfId}]`) || msg.includes(`[CQ:at,id=${selfId}]`)) {
      return true
    }

    return false
  }

  async setTriggerMode() {
    const cfg = await this.getConfig()
    const AIchatCfg = this.getAIchatConfig(cfg)
    const match = this.e.msg.match(/^#?(?:AIchat|aichat)触发方式(?:\s*(指令|艾特|全部))?$/)
    const modeText = match?.[1]
    if (!modeText) {
      const map = { prefix: '指令', at: '艾特', both: '全部' }
      return this.reply(`当前触发方式：${map[AIchatCfg.triggerMode]}（可用：#AIchat触发方式 指令/艾特/全部）`)
    }
    const modeMap = { 指令: 'prefix', 艾特: 'at', 全部: 'both' }
    cfg.AIchat = cfg.AIchat || {}
    cfg.AIchat.triggerMode = modeMap[modeText] || 'both'
    const ok = Config.setConfig(cfg)
    if (!ok) {
      return this.reply('触发方式保存失败，请查看日志')
    }
    return this.reply(`AIchat触发方式已设置为：${modeText}`)
  }

  async chatByAt() {
    const msg = (this.e.msg || '').trim()
    if (!msg || msg.startsWith('#')) {
      return false
    }
    if (!this.isAtBot()) {
      return false
    }
    const cfg = await this.getConfig()
    const AIchatCfg = this.getAIchatConfig(cfg)
    if (!this.canUseInPrivate(cfg)) {
      return false
    }
    if (!['at', 'both'].includes(AIchatCfg.triggerMode)) {
      return false
    }
    return this.chat()
  }

  getTTSConfig(cfg = {}) {
    const tts = cfg.tts || {}
    return {
      enable: tts.enable === true,
      mode: tts.mode || 'vits',
      ttsSpace: tts.ttsSpace || '',
      azureKey: tts.azureKey || '',
      azureRegion: tts.azureRegion || '',
      azureSpeaker: tts.azureSpeaker || 'zh-CN-XiaochenNeural',
      alsoSendText: tts.alsoSendText === true,
      autoFallbackThreshold: Number(tts.autoFallbackThreshold) || 300,
      vitsDefaultSpeaker: (tts.vitsDefaultSpeaker || '随机').trim(),
      userRoleEnabled: tts.userRoleEnabled !== false,
      vitsSpeakers: VITS_SPEAKERS
    }
  }

  normalizeSpeakerName(name = '') {
    const speaker = String(name || '').trim()
    if (!speaker || speaker === '随机' || speaker === '重置' || speaker === '默认') {
      return '随机'
    }
    return convertVitsSpeaker(speaker)
  }

  async getActiveVitsSpeaker(cfg = {}) {
    const ttsCfg = this.getTTSConfig(cfg)
    if (ttsCfg.mode !== 'vits') {
      return '随机'
    }
    if (ttsCfg.userRoleEnabled) {
      const userRole = Config.getUserTTSRole(this.e.user_id)
      if (userRole) {
        const normalizedUserRole = this.normalizeSpeakerName(userRole)
        if (normalizedUserRole === '随机' || ttsCfg.vitsSpeakers.includes(normalizedUserRole)) {
          return normalizedUserRole
        }
      }
    }
    return this.normalizeSpeakerName(ttsCfg.vitsDefaultSpeaker)
  }

  async makeForwardMsg(messages = [], title = 'VITS语音角色列表') {
    const nickname = this.e.bot?.nickname || 'AIchat'
    const userId = Number(this.e.self_id || this.e.bot?.uin || this.e.bot?.user_id || this.e.user_id || 80000000)
    const nodes = messages.map(msg => ({
      nickname,
      user_id: userId,
      message: msg
    }))

    let forwardMsg = null
    if (this.e.group?.makeForwardMsg) {
      forwardMsg = await this.e.group.makeForwardMsg(nodes)
    } else if (this.e.friend?.makeForwardMsg) {
      forwardMsg = await this.e.friend.makeForwardMsg(nodes)
    } else if (globalThis.Bot?.makeForwardMsg) {
      forwardMsg = await globalThis.Bot.makeForwardMsg(nodes)
    }

    if (forwardMsg && typeof forwardMsg.data === 'object') {
      const detail = forwardMsg.data?.meta?.detail
      if (detail) {
        detail.summary = title
        if (Array.isArray(detail.news) && detail.news.length > 0) {
          detail.news[0].text = title
        }
      }
    }

    return forwardMsg
  }

  async ttsRoleList() {
    const cfg = await this.getConfig()
    const ttsCfg = this.getTTSConfig(cfg)
    const list = ttsCfg.vitsSpeakers
    const chunkSize = 60
    const total = Math.ceil(list.length / chunkSize)
    const chunks = []

    for (let i = 0; i < total; i++) {
      const start = i * chunkSize
      const end = start + chunkSize
      const chunk = list.slice(start, end)
      chunks.push(`VITS语音角色列表（${i + 1}/${total}）：\n${chunk.join('、')}`)
    }

    const forwardMsg = await this.makeForwardMsg(chunks, `VITS语音角色列表（共${list.length}个）`)
    if (forwardMsg) {
      return this.reply(forwardMsg)
    }

    // 部分适配器可能不支持合并转发，降级为分段文本
    for (const chunkText of chunks) {
      await this.reply(chunkText)
    }

    return true
  }

  async ttsRoleStatus() {
    const cfg = await this.getConfig()
    const ttsCfg = this.getTTSConfig(cfg)
    const personal = Config.getUserTTSRole(this.e.user_id) || '未设置'
    const active = await this.getActiveVitsSpeaker(cfg)
    return this.reply([
      `TTS模式：${ttsCfg.mode}`,
      `全局VITS角色：${this.normalizeSpeakerName(ttsCfg.vitsDefaultSpeaker)}`,
      `个人VITS角色：${personal}`,
      `当前生效角色：${active}`,
      `个人角色开关：${ttsCfg.userRoleEnabled ? '开启' : '关闭'}`
    ].join('\n'))
  }

  async setGlobalTTSRole() {
    const cfg = await this.getConfig()
    const ttsCfg = this.getTTSConfig(cfg)
    const speaker = this.normalizeSpeakerName(this.e.msg.replace(/^#?(?:AIchat|aichat)全局语音角色\s*/, ''))
    if (speaker !== '随机' && !ttsCfg.vitsSpeakers.includes(speaker)) {
      return this.reply('设置失败：该角色不在可选列表中，请使用 #AIchat语音角色列表 查看')
    }
    cfg.tts = cfg.tts || {}
    cfg.tts.vitsDefaultSpeaker = speaker
    const ok = Config.setConfig(cfg)
    if (!ok) {
      return this.reply('全局语音角色保存失败，请查看日志')
    }
    return this.reply(`全局VITS语音角色已设置为：${speaker}`)
  }

  async setUserTTSRole() {
    const cfg = await this.getConfig()
    const ttsCfg = this.getTTSConfig(cfg)
    if (!ttsCfg.userRoleEnabled) {
      return this.reply('管理员已关闭个人语音角色配置')
    }
    const speaker = this.normalizeSpeakerName(this.e.msg.replace(/^#?(?:AIchat|aichat)(?:设置)?语音角色\s*/, ''))
    if (speaker !== '随机' && !ttsCfg.vitsSpeakers.includes(speaker)) {
      return this.reply('设置失败：该角色不在可选列表中，请使用 #AIchat语音角色列表 查看')
    }
    const ok = Config.setUserTTSRole(this.e.user_id, speaker)
    if (!ok) {
      return this.reply('个人语音角色保存失败，请查看日志')
    }
    return this.reply(`你的VITS语音角色已设置为：${speaker}`)
  }

  getBymConfig(cfg = {}) {
    const bym = cfg.bym || {}
    const bymRate = Number(bym.bymRate)
    const maxTokens = Number(bym.maxTokens)
    let hit = []
    if (Array.isArray(bym.hit)) {
      hit = bym.hit.map(item => (typeof item === 'string' ? item : item?.keyword)).filter(Boolean)
    } else if (typeof bym.hit === 'string') {
      hit = bym.hit.split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
    }
    let fuckList = []
    if (Array.isArray(bym.fuckList)) {
      fuckList = bym.fuckList.filter(Boolean)
    } else if (typeof bym.fuckList === 'string') {
      fuckList = bym.fuckList.split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
    }
    let disableGroups = []
    if (Array.isArray(bym.disableGroups)) {
      disableGroups = bym.disableGroups.map(String).filter(Boolean)
    } else if (typeof bym.disableGroups === 'string') {
      disableGroups = bym.disableGroups.split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
    }
    let whitelistGroups = []
    if (Array.isArray(bym.whitelistGroups)) {
      whitelistGroups = bym.whitelistGroups.map(String).filter(Boolean)
    } else if (typeof bym.whitelistGroups === 'string') {
      whitelistGroups = bym.whitelistGroups.split(/[，,\n]/).map(s => s.trim()).filter(Boolean)
    }
    return {
      enable: bym.enable === true,
      bymRate: Number.isFinite(bymRate) ? Math.max(0, Math.min(100, bymRate)) : 5,
      enableSearch: bym.enableSearch !== false,
      hit: hit.length > 0 ? hit : ['在吗', '你好', '早', '晚安'],
      systemPrompt: bym.systemPrompt || '你正在群里自然聊天。回复要像真人，简短、口语化，不要自称AI，不要解释规则。',
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 512,
      fuckList: fuckList.length > 0 ? fuckList : ['骂', '你妈', '他妈', '尼玛', '艹'],
      fuckPrompt: bym.fuckPrompt || '你的性格暴躁，乖张，戾气特别重，睚眦必报，别人与你几乎不能沟通，你喜欢用各种国骂和祖安语录骂回去，骂人花样不重复。',
      fuckRecall: bym.fuckRecall === true,
      disableGroups,
      whitelistGroups
    }
  }

  async toggleBym() {
    const cfg = await this.getConfig()
    if (!cfg.bym) {
      cfg.bym = {}
    }
    const enable = this.e.msg.includes('开启')
    cfg.bym.enable = enable
    const ok = Config.setConfig(cfg)
    if (!ok) {
      return this.reply('伪人模式设置失败，请查看日志')
    }
    return this.reply(`伪人模式已${enable ? '开启' : '关闭'}`)
  }

  async bymStatus() {
    const cfg = await this.getConfig()
    const bymCfg = this.getBymConfig(cfg)
    return this.reply([
      `伪人模式：${bymCfg.enable ? '已开启' : '已关闭'}`,
      `触发概率：${bymCfg.bymRate}%`,
      `伪人联网搜索：${bymCfg.enableSearch ? '开启' : '关闭'}`,
      `关键词必中：${bymCfg.hit.join('、') || '无'}`,
      `最大输出：${bymCfg.maxTokens} tokens`,
      `骂人反击词：${bymCfg.fuckList.join('、')}`,
      `骂人反击后撤回：${bymCfg.fuckRecall ? '是' : '否'}`,
      `白名单群：${bymCfg.whitelistGroups.join('、') || '无'}`,
      `禁用群：${bymCfg.disableGroups.join('、') || '无'}`
    ].join('\n'))
  }

  async bym() {
    const msg = (this.e.msg || '').trim()
    const images = this.e.img
    const isAIchatCommand = /^#?(?:AIchat|aichat)/.test(msg)
    // 无文字且无图片，或以#开头的命令，跳过
    if ((!msg && !images) || msg.startsWith('#') || isAIchatCommand) {
      return false
    }
    // 艾特机器人消息交由AIchat对话处理，不触发伪人模式
    if (this.isAtBot()) {
      return false
    }
    if (this.e.user_id === this.e.self_id || this.e.user_id === this.e.bot?.uin) {
      return false
    }

    const cfg = await this.getConfig()
    if (!this.canUseInPrivate(cfg)) {
      return false
    }
    const bymCfg = this.getBymConfig(cfg)
    if (!bymCfg.enable) {
      return false
    }

    // 群组白名单/黑名单检查（白名单优先）
    const groupId = String(this.e.group_id || '')
    if (bymCfg.whitelistGroups.length > 0) {
      // 配置白名单时，仅白名单群可触发（私聊与其他群都不触发）
      if (!groupId || !bymCfg.whitelistGroups.includes(groupId)) {
        return false
      }
    } else if (groupId && bymCfg.disableGroups.includes(groupId)) {
      // 未配置白名单时，黑名单生效
      return false
    }

    // 骂人反击检查（仅对文字消息生效）
    const fuck = msg ? bymCfg.fuckList.some(keyword => msg.includes(keyword)) : false
    logger.info(`[AIchat] 伪人模式触发 - msg:'${msg}' fuckList:[${bymCfg.fuckList.join(',')}] fuck:${fuck}`)

    // 触发概率（百分比整数）
    let rate = bymCfg.bymRate
    if (msg && bymCfg.hit.some(keyword => msg.includes(keyword))) {
      rate = 100
    }
    if (Math.floor(Math.random() * 100) >= rate) {
      return false
    }

  // 构建系统提示词：骂人模式使用骂人提示词，否则使用伪人提示词
    let systemPrompt
    if (fuck) {
      // 骂人模式：仅使用骂人提示词
      systemPrompt = bymCfg.fuckPrompt
      logger.info(`[AIchat] 骂人模式已激活`)
    } else {
  // 伪人模式：使用伪人提示词
      systemPrompt = bymCfg.systemPrompt
    }
    logger.info(`[AIchat] 系统提示词长度: ${systemPrompt.length} 字符`)

    const AIchatCfg = this.getAIchatConfig(cfg)
    const AIchat = new AIchatAPI({
      apiKey: AIchatCfg.apiKey,
      baseUrl: AIchatCfg.baseUrl,
      model: AIchatCfg.model,
      enableSearch: bymCfg.enableSearch
    })

    try {
      // 构建消息内容（支持图片+文字）
      const content = []
      if (images) {
        const imgArray = Array.isArray(images) ? images : [images]
        for (const img of imgArray) {
          try {
            const base64 = await this.downloadImage(img)
            if (base64) {
              content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } })
            }
          } catch (e) {
            logger.error('[AIchat] 伪人模式图片处理错误:', e)
          }
        }
      }
      if (msg) {
        content.push({ type: 'text', text: msg })
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ]
      const response = await AIchat.chat(messages, { max_tokens: bymCfg.maxTokens })
      if (!response) {
        return false
      }
      const recallOpt = (fuck && bymCfg.fuckRecall) ? { recallMsg: 10 } : undefined
      return await this.sendResponse(response, recallOpt)
    } catch (err) {
      logger.error('[AIchat] 伪人模式调用错误:', err)
      return false
    }
  }

  // 获取会话 key（群号+用户ID，开启群组合并时同群共享上下文）
  getSessionKey(cfg = {}) {
    const groupId = this.e.group_id || 'private'
    const userId = this.e.user_id
    const AIchatCfg = this.getAIchatConfig(cfg)
    if (groupId !== 'private' && AIchatCfg.groupMerge) {
      return `group:${groupId}`
    }
    return `${groupId}:${userId}`
  }

  // 获取历史消息
  getHistory(cfg) {
    const key = this.getSessionKey(cfg)
    return chatHistory.get(key) || []
  }

  // 保存消息到历史
  saveHistory(role, content, cfg) {
    const key = this.getSessionKey(cfg)
    if (!chatHistory.has(key)) {
      chatHistory.set(key, [])
    }
    const history = chatHistory.get(key)
    history.push({ role, content })
    
    // 限制历史长度
    if (history.length > MAX_HISTORY * 2) {
      history.splice(0, history.length - MAX_HISTORY * 2)
    }
  }

  // 清除历史
  async clearHistory() {
    const cfg = await this.getConfig()
    const key = this.getSessionKey(cfg)
    chatHistory.delete(key)
    return this.reply('已清除对话上下文')
  }

  async chat() {
    const raw = (this.e.msg || '').trim()
    const cfg = await this.getConfig()
    if (!this.canUseInPrivate(cfg)) {
      return this.reply('当前已关闭私聊使用（主人不受限制）')
    }
    const AIchatCfg = this.getAIchatConfig(cfg)
    const isPrefixTrigger = /^#?(?:AIchat|aichat)/.test(raw)
    const isAtTrigger = !isPrefixTrigger && this.isAtBot()
    if (isPrefixTrigger && !['prefix', 'both'].includes(AIchatCfg.triggerMode)) {
      return this.reply('当前未开启指令触发，请使用艾特机器人触发，或让主人执行：#AIchat触发方式 全部')
    }
    const msg = raw.replace(/^#?(?:AIchat|aichat)/, '').trim()
    
    // 获取图片
    const images = this.e.img
    if (!msg && !images) {
      return this.reply('请输入对话内容，例如：#AIchat 你好\n或发送图片+#AIchat 描述图片')
    }

    const AIchat = new AIchatAPI({
      apiKey: AIchatCfg.apiKey,
      baseUrl: AIchatCfg.baseUrl,
      model: AIchatCfg.model,
      enableSearch: AIchatCfg.enableSearch
    })

    try {
      logger.info(`[AIchat] 正常模式触发 - trigger:${isPrefixTrigger ? 'prefix' : isAtTrigger ? 'at' : 'unknown'} group:${this.e.group_id || 'private'} user:${this.e.user_id} msgLen:${msg.length} images:${images ? (Array.isArray(images) ? images.length : 1) : 0} search:${AIchatCfg.enableSearch}`)
      if (AIchatCfg.showThinking) {
        await this.reply('AIchat 思考中...')
      }
      
      // 构建消息内容
      const content = []
      
      // 添加图片（如果有）
      if (images) {
        const imgArray = Array.isArray(images) ? images : [images]
        for (const img of imgArray) {
          try {
            const base64 = await this.downloadImage(img)
            if (base64) {
              content.push({
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`
                }
              })
            }
          } catch (e) {
            logger.error('[AIchat] 图片处理错误:', e)
          }
        }
      }
      
      // 添加文字
      if (msg) {
        content.push({
          type: 'text',
          text: msg
        })
      }

      // 构建消息历史
      const messages = [
        { role: 'system', content: AIchatCfg.personaPrompt }
      ]
      logger.info(`[AIchat] 正常模式系统提示词长度: ${String(messages[0].content).length} 字符`)
      
      // 添加历史消息
      const history = this.getHistory(cfg)
      for (const h of history) {
        messages.push(h)
      }
      
      // 添加当前消息
      messages.push({ role: 'user', content })

      const response = await AIchat.chat(messages)
      
      // 保存到历史
      this.saveHistory('user', content, cfg)
      this.saveHistory('assistant', response, cfg)
      
      // 处理回复（支持 TTS 和图片）
      return await this.sendResponseWithTTS(response, cfg)
    } catch (err) {
      logger.error('[AIchat] 调用错误:', err)
      return this.reply(`调用失败: ${err.message}`)
    }
  }

  /**
   * 处理带 TTS 的回复
   */
  async sendResponseWithTTS(response, cfg) {
    const ttsCfg = this.getTTSConfig(cfg)
    const hasSource = (ttsCfg.mode === 'vits' && !!ttsCfg.ttsSpace) || (ttsCfg.mode === 'azure' && !!ttsCfg.azureKey)
    const ttsEnabled = ttsCfg.enable && hasSource

    if (ttsEnabled) {
      try {
        // 提取文本（移除 Markdown 格式）
        let ttsText = response
          .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '')
          .replace(/"((?:https?):\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi, '')
          .replace(/(?:https?):\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi, '')
          .replace(/[-:_；*;\n]/g, '，')
          .trim()

        // 超长文本自动降级
        if (ttsText.length > (ttsCfg.autoFallbackThreshold || 300)) {
          if (!ttsCfg.alsoSendText) {
            await this.reply('回复内容过长，已转为文本模式')
          }
          return await this.sendResponse(response)
        }

        // 先发送文字（如果配置为同时发送）
        if (ttsCfg.alsoSendText) {
          await this.sendResponse(response)
        }

        // 调用 TTS 生成语音
        const tts = new TTS({
          mode: ttsCfg.mode,
          ttsSpace: ttsCfg.ttsSpace,
          vitsSpeaker: await this.getActiveVitsSpeaker(cfg),
          azureKey: ttsCfg.azureKey,
          azureRegion: ttsCfg.azureRegion,
          azureSpeaker: ttsCfg.azureSpeaker
        })

        const speaker = await this.getActiveVitsSpeaker(cfg)
        const audioSegment = await tts.generateAudio(ttsText, { speaker })
        if (audioSegment) {
          await this.reply(audioSegment)
          return true
        } else {
          if (!ttsCfg.alsoSendText) {
            await this.reply('语音生成失败，请查看日志')
          }
          return true
        }
      } catch (err) {
        logger.error('[AIchat] TTS 处理错误:', err)
        // 降级为纯文字
        return await this.sendResponse(response)
      }
    } else {
      // TTS 未启用，直接发送回复
      return await this.sendResponse(response)
    }
  }

  async downloadImage(url) {
    try {
      const response = await fetch(url)
      const buffer = await response.arrayBuffer()
      return Buffer.from(buffer).toString('base64')
    } catch (e) {
      logger.error('[AIchat] 下载图片失败:', e)
      return null
    }
  }

  async sendResponse(response, replyOptions = undefined) {
    if (!response) {
      return this.reply('未收到有效回复')
    }

    // 匹配多种图片格式：
    // 1. 直接图片URL: https://xxx.jpg
    // 2. Markdown图片: ![alt](url)
    // 3. 带引号的图片: "https://xxx.png"
    const imagePatterns = [
      /!\[([^\]]*)\]\(([^)]+)\)/g,  // Markdown 图片
      /"((?:https?):\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi,  // 引号中的图片
      /(?:https?):\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi  // 直接图片URL
    ]

    const imageUrls = new Set()
    for (const pattern of imagePatterns) {
      let match
      while ((match = pattern.exec(response)) !== null) {
        // 获取URL（可能是第2或第3个捕获组）
        const url = match[2] || match[1] || match[0]
        if (url && !url.startsWith('data:')) {
          imageUrls.add(url)
        }
      }
    }

    if (imageUrls.size > 0) {
      // 移除所有图片相关内容，只保留文字
      let text = response
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '')
        .replace(/"((?:https?):\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi, '')
        .replace(/(?:https?):\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi, '')
        .trim()
      
      if (text) {
        await this.reply(text, false, replyOptions)
      }
      for (const url of imageUrls) {
        await this.reply(segment.image(url), false, replyOptions)
      }
    } else {
      return this.reply(response, false, replyOptions)
    }
  }

  async getConfig() {
    return Config.getConfig() || {}
  }
}