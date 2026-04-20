import YAML from 'yaml'
import fs from 'fs'
import { pluginRoot } from '../model/path.js'

class Config {
  getConfigDir() {
    return `${pluginRoot}/config/config`
  }

  ensureConfigDir() {
    const configDir = this.getConfigDir()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    return configDir
  }

  getConfig() {
    try {
      const configPath = `${pluginRoot}/config/config/config.yaml`
      if (!fs.existsSync(configPath)) {
        return this.getDefConfig()
      }
      const config_data = YAML.parse(fs.readFileSync(configPath, 'utf-8'))
      return config_data
    } catch (err) {
      logger.error('读取config.yaml失败', err)
      return false
    }
  }

  getDefConfig() {
    try {
      const config_default_data = YAML.parse(
        fs.readFileSync(`${pluginRoot}/config/config_default.yaml`, 'utf-8')
      )
      return config_default_data
    } catch (err) {
      logger.error('读取config_default.yaml失败', err)
      return false
    }
  }

  setConfig(config_data) {
    try {
      this.ensureConfigDir()
      fs.writeFileSync(
        `${pluginRoot}/config/config/config.yaml`,
        YAML.stringify(config_data),
      )
      return true
    } catch (err) {
      logger.error('写入config.yaml失败', err)
      return false
    }
  }

  getTTSUserPath() {
    return `${this.getConfigDir()}/tts_user.yaml`
  }

  getTTSUserRoles() {
    try {
      const path = this.getTTSUserPath()
      if (!fs.existsSync(path)) {
        return {}
      }
      return YAML.parse(fs.readFileSync(path, 'utf-8')) || {}
    } catch (err) {
      logger.error('读取tts_user.yaml失败', err)
      return {}
    }
  }

  setTTSUserRoles(data = {}) {
    try {
      this.ensureConfigDir()
      fs.writeFileSync(this.getTTSUserPath(), YAML.stringify(data))
      return true
    } catch (err) {
      logger.error('写入tts_user.yaml失败', err)
      return false
    }
  }

  getUserTTSRole(userId) {
    const data = this.getTTSUserRoles()
    return data?.[String(userId)] || ''
  }

  setUserTTSRole(userId, role) {
    const data = this.getTTSUserRoles()
    const uid = String(userId)
    if (!role || role === '随机') {
      delete data[uid]
    } else {
      data[uid] = role
    }
    return this.setTTSUserRoles(data)
  }
}

export default new Config()