// Story 14: Real Appium Integration with Android SDK
// Complete implementation for real device automation testing

import { remote, RemoteOptions } from 'webdriverio'

export interface DeviceCapabilities {
  platformName: string
  platformVersion: string
  deviceName: string
  automationName: string
  noReset: boolean
  newCommandTimeout: number
  appPackage?: string
  appActivity?: string
  app?: string
}

export interface ActionResult {
  success: boolean
  errorMessage?: string
  screenshot?: string
  pageSource?: string
  duration: number
  retryCount: number
}

export interface DeviceAction {
  type: 'tap' | 'type' | 'swipe' | 'wait' | 'screenshot' | 'source' | 'launch' | 'back'
  selector?: string
  text?: string
  coordinates?: { x: number; y: number }
  timeout?: number
  retries?: number
  by?: 'id' | 'xpath' | 'class' | 'text' | 'accessibility-id'
}

export interface ConnectionStatus {
  isConnected: boolean
  sessionId: string | null
  deviceInfo?: any
  lastPing?: Date
}

class RealAppiumClient {
  private driver: any = null
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    sessionId: null
  }

  async connect(capabilities: DeviceCapabilities): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    try {
      console.log('🔌 Connecting to Appium server with capabilities:', capabilities)
      
      const options: RemoteOptions = {
        protocol: 'http',
        hostname: 'localhost',
        port: 4723,
        path: '/',
        capabilities: {
          platformName: capabilities.platformName,
          'appium:platformVersion': capabilities.platformVersion,
          'appium:deviceName': capabilities.deviceName,
          'appium:automationName': capabilities.automationName,
          'appium:noReset': capabilities.noReset,
          'appium:newCommandTimeout': capabilities.newCommandTimeout,
          'appium:appPackage': capabilities.appPackage,
          'appium:appActivity': capabilities.appActivity,
          'appium:app': capabilities.app
        }
      }

      // Filter out undefined values
      Object.keys(options.capabilities).forEach(key => {
        if (options.capabilities[key] === undefined) {
          delete options.capabilities[key]
        }
      })

      this.driver = await remote(options)
      this.connectionStatus = {
        isConnected: true,
        sessionId: this.driver.sessionId,
        lastPing: new Date()
      }

      console.log('✅ Successfully connected to Appium server')
      console.log('📱 Session ID:', this.driver.sessionId)
      
      return {
        success: true,
        sessionId: this.driver.sessionId
      }
    } catch (error) {
      console.error('❌ Failed to connect to Appium server:', error)
      return {
        success: false,
        error: error.message || 'Unknown connection error'
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.driver) {
        await this.driver.deleteSession()
        console.log('✅ Appium session closed successfully')
      }
    } catch (error) {
      console.error('❌ Error closing Appium session:', error)
    } finally {
      this.driver = null
      this.connectionStatus = {
        isConnected: false,
        sessionId: null
      }
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus }
  }

  async executeAction(action: DeviceAction): Promise<ActionResult> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      return {
        success: false,
        errorMessage: 'Not connected to Appium server',
        duration: 0,
        retryCount: 0
      }
    }

    const startTime = Date.now()
    let retryCount = 0
    const maxRetries = action.retries || 2

    while (retryCount <= maxRetries) {
      try {
        let result: any = null

        switch (action.type) {
          case 'tap':
            result = await this.performTap(action)
            break
          case 'type':
            result = await this.performType(action)
            break
          case 'swipe':
            result = await this.performSwipe(action)
            break
          case 'wait':
            result = await this.performWait(action)
            break
          case 'screenshot':
            result = await this.takeScreenshot()
            break
          case 'source':
            result = await this.getPageSource()
            break
          case 'launch':
            result = await this.launchApp(action)
            break
          case 'back':
            result = await this.pressBack()
            break
          default:
            throw new Error(`Unsupported action type: ${action.type}`)
        }

        const duration = Date.now() - startTime
        return {
          success: true,
          duration,
          retryCount,
          screenshot: action.type !== 'screenshot' ? await this.takeScreenshot() : result
        }
      } catch (error) {
        retryCount++
        console.warn(`⚠️ Action failed (attempt ${retryCount}/${maxRetries + 1}):`, error.message)
        
        if (retryCount > maxRetries) {
          const duration = Date.now() - startTime
          return {
            success: false,
            errorMessage: error.message,
            duration,
            retryCount,
            screenshot: await this.takeScreenshot()
          }
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
      }
    }

    // This should never be reached
    return {
      success: false,
      errorMessage: 'Unexpected execution path',
      duration: Date.now() - startTime,
      retryCount
    }
  }

  private async performTap(action: DeviceAction): Promise<void> {
    if (action.coordinates) {
      // Tap by coordinates
      await this.driver.touchAction({
        action: 'tap',
        x: action.coordinates.x,
        y: action.coordinates.y
      })
    } else if (action.selector && action.by) {
      // Tap by element selector
      const element = await this.findElement(action.selector, action.by, action.timeout)
      await element.click()
    } else {
      throw new Error('Tap action requires either coordinates or selector with by strategy')
    }
  }

  private async performType(action: DeviceAction): Promise<void> {
    if (!action.text) {
      throw new Error('Type action requires text property')
    }

    if (action.selector && action.by) {
      const element = await this.findElement(action.selector, action.by, action.timeout)
      await element.clearValue()
      await element.setValue(action.text)
    } else {
      // Type into currently focused element
      await this.driver.keys(action.text)
    }
  }

  private async performSwipe(action: DeviceAction): Promise<void> {
    if (!action.coordinates) {
      throw new Error('Swipe action requires coordinates property with start and end points')
    }

    // For simple swipe, assume coordinates contains start point and we swipe down/up
    const startX = action.coordinates.x
    const startY = action.coordinates.y
    const endX = startX
    const endY = startY + 300 // Default swipe distance

    await this.driver.touchAction([
      { action: 'press', x: startX, y: startY },
      { action: 'wait', ms: 100 },
      { action: 'moveTo', x: endX, y: endY },
      { action: 'release' }
    ])
  }

  private async performWait(action: DeviceAction): Promise<void> {
    const timeout = action.timeout || 5000
    
    if (action.selector && action.by) {
      // Wait for element to appear
      await this.findElement(action.selector, action.by, timeout)
    } else {
      // Simple time-based wait
      await new Promise(resolve => setTimeout(resolve, timeout))
    }
  }

  private async launchApp(action: DeviceAction): Promise<void> {
    if (action.selector) {
      // Launch specific app by package name
      await this.driver.activateApp(action.selector)
    } else {
      // Launch current app
      await this.driver.launchApp()
    }
  }

  private async pressBack(): Promise<void> {
    await this.driver.back()
  }

  private async findElement(selector: string, by: string, timeout: number = 10000): Promise<any> {
    let locatorStrategy: string
    let locatorValue: string

    switch (by) {
      case 'id':
        locatorStrategy = 'id'
        locatorValue = selector
        break
      case 'xpath':
        locatorStrategy = 'xpath'
        locatorValue = selector
        break
      case 'class':
        locatorStrategy = 'class name'
        locatorValue = selector
        break
      case 'text':
        locatorStrategy = 'xpath'
        locatorValue = `//*[@text="${selector}"]`
        break
      case 'accessibility-id':
        locatorStrategy = 'accessibility id'
        locatorValue = selector
        break
      default:
        throw new Error(`Unsupported selector strategy: ${by}`)
    }

    try {
      await this.driver.waitUntil(async () => {
        const elements = await this.driver.$$(locatorStrategy + '=' + locatorValue)
        return elements.length > 0
      }, {
        timeout,
        timeoutMsg: `Element not found: ${by}=${selector}`
      })

      return await this.driver.$(locatorStrategy + '=' + locatorValue)
    } catch (error) {
      throw new Error(`Element not found after ${timeout}ms: ${by}=${selector}`)
    }
  }

  async takeScreenshot(): Promise<string> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      throw new Error('Not connected to device')
    }

    try {
      const screenshot = await this.driver.takeScreenshot()
      return screenshot
    } catch (error) {
      console.error('❌ Screenshot capture failed:', error)
      throw error
    }
  }

  async getPageSource(): Promise<string> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      throw new Error('Not connected to device')
    }

    try {
      return await this.driver.getPageSource()
    } catch (error) {
      console.error('❌ Page source capture failed:', error)
      throw error
    }
  }

  async getDeviceInfo(): Promise<any> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      throw new Error('Not connected to device')
    }

    try {
      const deviceInfo = {
        platformName: await this.driver.getPlatform(),
        platformVersion: await this.driver.getCapabilities()['appium:platformVersion'],
        deviceName: await this.driver.getCapabilities()['appium:deviceName'],
        sessionId: this.driver.sessionId
      }
      return deviceInfo
    } catch (error) {
      console.error('❌ Failed to get device info:', error)
      throw error
    }
  }

  async installApp(appPath: string): Promise<boolean> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      return false
    }

    try {
      await this.driver.installApp(appPath)
      console.log('✅ App installed successfully:', appPath)
      return true
    } catch (error) {
      console.error('❌ App installation failed:', error)
      return false
    }
  }

  async getCurrentActivity(): Promise<string | null> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      return null
    }

    try {
      return await this.driver.getCurrentActivity()
    } catch (error) {
      console.error('❌ Failed to get current activity:', error)
      return null
    }
  }

  async getCurrentPackage(): Promise<string | null> {
    if (!this.driver || !this.connectionStatus.isConnected) {
      return null
    }

    try {
      return await this.driver.getCurrentPackage()
    } catch (error) {
      console.error('❌ Failed to get current package:', error)
      return null
    }
  }

  // Health check for connection
  async ping(): Promise<boolean> {
    try {
      if (!this.driver || !this.connectionStatus.isConnected) {
        return false
      }
      
      // Simple operation to check if connection is alive
      await this.driver.getWindowRect()
      this.connectionStatus.lastPing = new Date()
      return true
    } catch (error) {
      console.warn('⚠️ Connection health check failed:', error.message)
      return false
    }
  }
}

// Export singleton instance
export const realAppiumClient = new RealAppiumClient()
