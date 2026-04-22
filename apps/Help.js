import plugin from '../../../lib/plugins/plugin.js'
import Render from '../components/Render.js'
import { style } from '../resources/help/config.js'

export class help extends plugin {
    constructor() {
        super({
            name: 'AIchat帮助',
            dsc: 'AIchat帮助',
            event: 'message',
            priority: 1009,
            rule: [
                {
                    reg: '^(/|#)?AIchat帮助$',
                    fnc: 'help'
                }
            ]
        })
    }

    async help() {
        const helpCfg = {
            "themeSet": false,
            "title": "AIchat",
            "subTitle": "使用说明",
            "colWidth": 265,
            "theme": "all",
            "themeExclude": ["default"],
            "colCount": 2,
            "bgBlur": true
        }
        const helpList = [
            {
                "group": "基础指令",
                "list": [
                    {
                        "icon": 1,
                        "title": "AIchat帮助",
                        "desc": "显示本帮助信息"
                    }
                ]
            },
            {
                "group": "AIchat",
                "list": [
                    {
                        "icon": 2,
                        "title": "@我+聊天内容",
                        "desc": "与机器人聊天"
                    },
                    {
                        "icon": 3,
                        "title": "AIchat(设置)语音角色+角色名",
                        "desc": "设置个人语音角色"
                    },
                    {
                        "icon": 4,
                        "title": "AIchat(查看)语音角色列表",
                        "desc": "查看可用的语音角色列表"
                    }
                ]
            }
        ]

        return await Render.render('help/index.html', {
            helpCfg,
            helpGroup: helpList,
            style
        }, { e: this.e })
    }
}