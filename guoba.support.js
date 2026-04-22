import Config from "./components/Config.js";
import lodash from "lodash";
import path from "path";
import { pluginRoot } from "./model/path.js";
import { VITS_SPEAKERS } from "./utils/VitsSpeakers.js";

function getJoinedGroupOptions() {
  const options = []
  const groupMap = globalThis.Bot?.gl

  if (!groupMap || typeof groupMap.forEach !== 'function') {
    return options
  }

  groupMap.forEach((group, groupId) => {
    const id = String(group?.group_id || groupId || '').trim()
    if (!id) {
      return
    }
    const name = String(group?.group_name || group?.name || id).trim()
    options.push({
      label: `${name}(${id})`,
      value: id
    })
  })

  options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  return options
}

export function supportGuoba() {
  const joinedGroupOptions = getJoinedGroupOptions()

  return {
    pluginInfo: {
      name: 'my-plugin',
      title: '我的插件',
      author: ['YourName'],
      authorLink: ['https://github.com/YourName'],
      link: 'https://github.com/YourName/my-plugin',
      isV3: true,
      isV2: false,
      showInMenu: true,
      description: '基于 Yunzai-Bot 的我的插件',
      icon: 'twemoji:robot',
      iconColor: '#5C7AEA',
    },
    configInfo: {
      schemas: [
        {
          component: "Divider",
          label: "AIchat API 配置"
        },
        {
          field: "AIchat.apiKey",
          label: "API Key",
          component: "Input",
          componentProps: {
            type: "password",
            placeholder: "请输入 AIchat API Key"
          }
        },
        {
          field: "AIchat.baseUrl",
          label: "API 地址",
          component: "Input",
          componentProps: {
            placeholder: "默认: https://api.moonshot.cn/v1"
          }
        },
        {
          field: "AIchat.model",
          label: "模型",
          component: "Input",
          componentProps: {
            placeholder: "默认: moonshot-v1-8k"
          }
        },
        {
          field: "AIchat.allowPrivate",
          label: "允许私聊使用",
          component: "Switch",
          componentProps: {
            placeholder: "关闭后仅主人可在私聊使用"
          }
        },
        {
          field: "AIchat.enableSearch",
          label: "联网搜索",
          component: "Switch",
          componentProps: {
            placeholder: "仅控制 #AIchat/@触发的正常对话联网搜索"
          }
        },
        {
          field: "AIchat.showThinking",
          label: "显示“思考中”提示",
          component: "Switch",
          componentProps: {
            placeholder: "关闭后不再发送“AIchat 思考中...”"
          }
        },
        {
          field: "AIchat.groupMerge",
          label: "群组消息合并",
          component: "Switch",
          componentProps: {
            placeholder: "开启后同群所有人共享同一对话上下文"
          }
        },
        {
          field: "AIchat.triggerMode",
          label: "触发方式",
          component: "Select",
          componentProps: {
            options: [
              { label: "指令(#AIchat)", value: "prefix" },
              { label: "艾特(@机器人)", value: "at" },
              { label: "全部", value: "both" }
            ]
          }
        },
        {
          field: "AIchat.personaPrompt",
          label: "人格提示词",
          component: "InputTextArea",
          componentProps: {
            rows: 4,
            placeholder: "正常 #AIchat/@ 对话使用的人格提示词"
          }
        },
        {
          component: "Divider",
          label: "文字转语音 (TTS) 配置"
        },
        {
          field: "tts.enable",
          label: "启用 TTS",
          component: "Switch",
          componentProps: {
            placeholder: "启用后回复会转换为语音"
          }
        },
        {
          field: "tts.mode",
          label: "TTS 模式",
          component: "Select",
          componentProps: {
            options: [
              { label: "VITS (HuggingFace)", value: "vits" },
              { label: "Azure TTS", value: "azure" }
            ]
          }
        },
        {
          field: "tts.ttsSpace",
          label: "VITS HuggingFace Space",
          component: "Input",
          componentProps: {
            type: "password",
            placeholder: "例如: https://huggingface.co/spaces/username/vits-uma-genshin-honkai"
          }
        },
        {
          field: "tts.vitsDefaultSpeaker",
          label: "VITS 全局语音角色",
          component: "Select",
          componentProps: {
            options: [
              { label: "随机", value: "随机" },
              ...VITS_SPEAKERS.map(s => ({ label: s, value: s }))
            ]
          }
        },
        {
          field: "tts.userRoleEnabled",
          label: "允许个人语音角色",
          component: "Switch",
          componentProps: {
            placeholder: "开启后用户可单独设置自己的语音角色"
          }
        },
        {
          field: "tts.azureKey",
          label: "Azure TTS Key",
          component: "Input",
          componentProps: {
            type: "password",
            placeholder: "Microsoft Azure TTS API Key"
          }
        },
        {
          field: "tts.azureRegion",
          label: "Azure 地区",
          component: "Input",
          componentProps: {
            placeholder: "例如: eastasia, southeastasia 等"
          }
        },
        {
          field: "tts.azureSpeaker",
          label: "Azure 发言人",
          component: "Input",
          componentProps: {
            placeholder: "例如: zh-CN-XiaochenNeural"
          }
        },
        {
          field: "tts.alsoSendText",
          label: "同时发送文字",
          component: "Switch",
          componentProps: {
            placeholder: "启用后会同时发送文字和语音"
          }
        },
        {
          field: "tts.autoFallbackThreshold",
          label: "文字超长自动转文本",
          component: "InputNumber",
          componentProps: {
            min: 100,
            max: 1000,
            step: 50,
            placeholder: "超过此字数自动降级为文本"
          }
        },
        {
          component: "Divider",
          label: "伪人模式配置"
        },
        {
          field: "bym.enable",
          label: "启用伪人模式",
          component: "Switch"
        },
        {
          field: "bym.bymRate",
          label: "触发概率(%)",
          component: "InputNumber",
          componentProps: {
            min: 0,
            max: 100,
            step: 1,
            placeholder: "0~100，如5表示5%"
          }
        },
        {
          field: "bym.enableSearch",
          label: "伪人联网搜索",
          component: "Switch",
          componentProps: {
            placeholder: "仅控制伪人模式的联网搜索"
          }
        },
        {
          field: "bym.whitelistGroups",
          label: "白名单群",
          bottomHelpMessage: "仅这些群可触发伪人；配置后禁用群不再生效",
          component: "Select",
          componentProps: {
            mode: "multiple",
            showSearch: true,
            options: joinedGroupOptions,
            placeholder: joinedGroupOptions.length > 0 ? "请选择已加入的群聊" : "暂无可选群聊，请确认机器人已入群"
          }
        },
        {
          field: "bym.disableGroups",
          label: "禁用群",
          bottomHelpMessage: "设置在该群禁用伪人模式",
          component: "Select",
          componentProps: {
            mode: "multiple",
            showSearch: true,
            options: joinedGroupOptions,
            placeholder: joinedGroupOptions.length > 0 ? "请选择已加入的群聊" : "暂无可选群聊，请确认机器人已入群"
          }
        },
        {
          field: "bym.hit",
          label: "关键词必中",
          bottomHelpMessage: "命中这些关键词时，伪人模式概率按 100% 处理",
          component: "GTags",
          componentProps: {
            placeholder: "请输入关键词",
            allowAdd: true,
            allowDel: true,
            showPrompt: true,
            promptProps: {
              content: "添加新的必中关键词",
              okText: "添加",
              rules: [
                { required: true, message: "关键词不能为空" }
              ]
            },
            valueParser: (value) => String(value || '').split(/[，,\n]/).map(v => v.trim()).filter(Boolean)
          }
        },
        {
          field: "bym.systemPrompt",
          label: "伪人人格提示词",
          component: "InputTextArea",
          componentProps: {
            rows: 4,
            placeholder: "用于约束伪人回复风格"
          }
        },
        {
          field: "bym.fuckList",
          label: "骂人触发词",
          bottomHelpMessage: "请输入用于伪人模式下骂人反击的触发词，每个词将被单独处理",
          component: "GTags",
          componentProps: {
            placeholder: "请输入触发词",
            allowAdd: true,
            allowDel: true,
            showPrompt: true,
            promptProps: {
              content: "添加新的触发词",
              okText: "添加",
              rules: [
                { required: true, message: "触发词不能为空" }
              ]
            },
            valueParser: (value) => String(value || '').split(/[，,\n]/).map(v => v.trim()).filter(Boolean)
          }
        },
        {
          field: "bym.fuckPrompt",
          label: "骂人模式提示词",
          component: "InputTextArea",
          componentProps: {
            rows: 3
          }
        },
        {
          field: "bym.fuckRecall",
          label: "骂人后自动撤回",
          component: "Switch"
        },
        {
          field: "bym.maxTokens",
          label: "伪人最大输出",
          component: "InputNumber",
          componentProps: {
            min: 64,
            max: 2048,
            step: 64
          }
        },

      ],
      translateKey: {},
      getConfigData() {
        let config = Config.getConfig()
        if (config?.kimi && !config?.AIchat) {
          config.AIchat = config.kimi
        }
        return config
      },
      setConfigData(data, { Result }) {
        let config = {}
        for (let [keyPath, value] of Object.entries(data)) {
          if (["bym.whitelistGroups", "bym.disableGroups"].includes(keyPath)) {
            if (Array.isArray(value)) {
              value = value.map(v => String(v || '').trim()).filter(Boolean)
            } else {
              value = String(value || '').split(/[，,\n]/).map(v => v.trim()).filter(Boolean)
            }
          }
          lodash.set(config, keyPath, value)
        }
        config = lodash.merge({}, Config.getConfig(), config)
        Config.setConfig(config)
        return Result.ok({}, '保存成功~')
      },
    },
  };
}