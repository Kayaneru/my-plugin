import fetch from 'node-fetch'

// AIchat 内置联网搜索工具（使用 builtin_function）
const webSearchTool = {
  type: 'builtin_function',
  function: {
    name: '$web_search',
  }
}

export class AIchatAPI {
  constructor(config = {}) {
    this.apiKey = config.apiKey || ''
    this.baseUrl = config.baseUrl || 'https://api.moonshot.cn/v1'
    this.model = config.model || 'kimi-k2.5'
    this.enableSearch = config.enableSearch !== false // 默认开启联网搜索
  }

  /**
  * 调用 AIchat API（OpenAI 兼容格式）
   * @param {Array} messages - 消息数组 [{role: 'user'|'assistant'|'system', content: '...'}]
   * @param {Object} options - 可选参数 { max_tokens, stream, enableSearch }
   * @returns {Promise<Object|string>}
   */
  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('请先配置 AIchat API Key')
    }

    const { max_tokens = 4096, stream = false, enableSearch = this.enableSearch } = options

    // 构建请求体
    const requestBody = {
      model: this.model,
      messages,
      max_tokens,
      stream
    }

    // 启用联网搜索（仅对 k2 系列模型启用）
    if (enableSearch && this.model.includes('k2')) {
      requestBody.tools = [webSearchTool]
      // 必须禁用思考能力
      requestBody.thinking = { type: "disabled" }
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || `API 请求失败: ${response.status}`)
    }

    if (stream) {
      return response
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message

    // 检查是否有工具调用
    if (message?.tool_calls && message.tool_calls.length > 0) {
      return await this.handleToolCalls(message.tool_calls, messages)
    }

    return message?.content || ''
  }

  // 处理工具调用 - AIchat 内置工具直接返回参数
  async handleToolCalls(toolCalls, originalMessages) {
    const toolResults = []

    for (const toolCall of toolCalls) {
      const { function: fn } = toolCall
      
      // AIchat 内置工具名称是 $web_search
      if (fn.name === '$web_search') {
        // AIchat 内置工具直接返回 arguments 作为结果
        const args = fn.arguments
        logger.info(`[AIchat] 联网搜索参数: ${args}`)
        
        toolResults.push({
          tool_call_id: toolCall.id,
          content: args  // 直接返回 arguments 字符串
        })
      }
    }

    // 将工具结果添加到消息中并再次调用
    if (toolResults.length > 0) {
      const messagesWithTools = [
        ...originalMessages,
        { role: 'assistant', content: null, tool_calls: toolCalls },
        ...toolResults.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }))
      ]

      // 再次调用 API 获取最终结果（需要包含 thinking: disabled）
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: messagesWithTools,
          max_tokens: 4096,
          thinking: { type: "disabled" }
        })
      })

      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    }

    return ''
  }

  /**
   * 流式调用
   * @param {Array} messages - 消息数组
   * @param {Function} onChunk - 流式回调函数
   */
  async chatStream(messages, onChunk) {
    const response = await this.chat(messages, { stream: true })
    
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const content = json.choices?.[0]?.delta?.content
            if (content && onChunk) {
              onChunk(content)
            }
          } catch (e) {}
        }
      }
    }
  }
}

// 兼容旧导出名
export const KimiAPI = AIchatAPI
export default AIchatAPI
