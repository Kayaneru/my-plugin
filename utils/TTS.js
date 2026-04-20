import fetch from 'node-fetch'
import { segment } from 'oicq'
import { VITS_SPEAKERS, convertVitsSpeaker } from './VitsSpeakers.js'

export class TTS {
  constructor(config = {}) {
    this.mode = config.mode || 'vits'
    this.ttsSpace = config.ttsSpace || ''
    this.vitsSpeaker = config.vitsSpeaker || '随机'
    this.azureKey = config.azureKey || ''
    this.azureRegion = config.azureRegion || ''
    this.azureSpeaker = config.azureSpeaker || 'zh-CN-XiaochenNeural'
  }

  /**
   * 文字转语音
   * @param {string} text - 要转换的文本
   * @returns {Promise<Object>} - 可发送的语音段
   */
  async generateAudio(text, options = {}) {
    if (!text) return null

    try {
      if (this.mode === 'vits' && this.ttsSpace) {
        const speaker = options.speaker || this.vitsSpeaker || '随机'
        return await this.generateVitsAudio(text, speaker)
      } else if (this.mode === 'azure' && this.azureKey) {
        return await this.generateAzureAudio(text)
      }
    } catch (err) {
      logger.error('[TTS] 转换失败:', err)
    }
    return null
  }

  /**
   * VITS 模式文字转语音
   */
  async generateVitsAudio(text, speaker = '随机') {
    try {
      let finalSpeaker = convertVitsSpeaker(speaker || '随机')
      if (!finalSpeaker || finalSpeaker === '随机') {
        finalSpeaker = VITS_SPEAKERS[Math.floor(Math.random() * VITS_SPEAKERS.length)]
      }

      let space = this.ttsSpace
      if (space.endsWith('/')) {
        space = space.slice(0, -1)
      }
      if (space.endsWith('/api/generate')) {
        space = space.slice(0, -13)
      }

      const url = `${space}/api/generate`
      const body = {
        data: [
          text,
          '中文',
          finalSpeaker,
          0.6,
          0.668,
          1.2
        ]
      }

      logger.info(`[TTS] 使用 VITS 模式生成语音, 角色: ${finalSpeaker}, 文本: ${text.slice(0, 20)}...`)

      const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        timeout: 60000
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = await response.json()
      const audioInfo = json?.data?.[1]

      if (!audioInfo?.name) {
        throw new Error('无法获取音频信息')
      }

      const audioLink = `${space}/file=${audioInfo.name}`
      logger.info(`[TTS] VITS 音频生成成功: ${audioLink}`)

      // 直接返回图片段（oicq 会自动处理 URL）
      return segment.record(audioLink)
    } catch (err) {
      logger.error('[TTS] VITS 转换失败:', err)
      return null
    }
  }

  /**
   * Azure 模式文字转语音
   */
  async generateAzureAudio(text) {
    try {
      logger.info(`[TTS] 使用 Azure 模式生成语音: ${text.slice(0, 20)}...`)

      const url = `https://${this.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`

      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
        <voice name="${this.azureSpeaker}">
          ${text}
        </voice>
      </speak>`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3'
        },
        body: ssml,
        timeout: 30000
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const buffer = await response.buffer()
      logger.info(`[TTS] Azure 音频生成成功: ${buffer.length} 字节`)

      // 返回 Buffer 类型的语音段
      return segment.record(buffer)
    } catch (err) {
      logger.error('[TTS] Azure 转换失败:', err)
      return null
    }
  }
}
