import './style.css'
import { orchestrator } from './orchestrator'
import { realAppiumClient, DeviceCapabilities } from './realAppium'

// Export orchestrator globally for easy testing
(window as any).orchestrator = orchestrator;

// Story 14: Real Appium Integration
let useRealAppium = false // Toggle for real vs mock mode
let realDeviceCapabilities: DeviceCapabilities = {
  platformName: 'Android',
  platformVersion: '13',
  deviceName: 'emulator-5554', // Default emulator port
  automationName: 'UiAutomator2',
  noReset: true,
  newCommandTimeout: 300
}

// Story 13: Orchestrator API & Session Management
let currentSession: any = null
let currentToken: string | null = null
let streamSubscription: (() => void) | null = null

// Story 13: Orchestrator API Functions
function initializeApiSession(): void {
  // Generate demo token for testing
  currentToken = orchestrator.authenticate('demo-user-123').data?.token || null
  console.log('🔑 API Token generated:', currentToken)
}

function startApiSession(): void {
  if (!currentToken) {
    initializeApiSession()
  }
  
  const command = (document.querySelector('#commandInput') as HTMLTextAreaElement)?.value || 'Search for "laptop"'
  const response = orchestrator.startSession(currentToken!, command, 'smoke')
  
  if (response.success && response.data) {
    currentSession = response.data
    console.log('🚀 Session started:', currentSession.id)
    
    // Subscribe to real-time updates
    streamSubscription = orchestrator.subscribeToSession(currentToken!, currentSession.id, handleStreamUpdate)
    
    // Update UI to reflect API session state
    updateSessionUI()
  } else {
    console.error('❌ Failed to start session:', response.error)
  }
}

function pauseApiSession(): void {
  if (!currentToken || !currentSession) return
  
  const response = orchestrator.pauseSession(currentToken, currentSession.id)
  if (response.success) {
    currentSession = response.data
    console.log('⏸️ Session paused:', currentSession.id)
    updateSessionUI()
  }
}

function resumeApiSession(): void {
  if (!currentToken || !currentSession) return
  
  const response = orchestrator.resumeSession(currentToken, currentSession.id)
  if (response.success) {
    currentSession = response.data
    console.log('▶️ Session resumed:', currentSession.id)
    updateSessionUI()
  }
}

function abortApiSession(): void {
  if (!currentToken || !currentSession) return
  
  const response = orchestrator.abortSession(currentToken, currentSession.id)
  if (response.success) {
    currentSession = response.data
    console.log('🛑 Session aborted:', currentSession.id)
    
    // Unsubscribe from updates
    if (streamSubscription) {
      streamSubscription()
      streamSubscription = null
    }
    updateSessionUI()
  }
}

function handleStreamUpdate(update: any): void {
  console.log('📡 Stream update:', update.type, update.data)
  
  switch (update.type) {
    case 'status':
      currentSession = update.data
      updateSessionUI()
      break
    case 'step':
      // Handle step updates - integrate with existing execution log
      if (update.data.description) {
        const step: ExecutionStep = {
          id: ++stepIdCounter,
          description: update.data.description,
          action: update.data.action || 'API Update',
          status: update.data.status || 'completed',
          timestamp: new Date(update.timestamp).toISOString(),
          screenshot: update.data.screenshot || false
        }
        executionSteps.push(step)
        renderExecutionSteps()
      }
      break
    case 'screenshot':
      // Handle screenshot updates
      if (update.data.base64) {
        updateEmulatorScreenshot(update.data.base64)
      }
      break
    case 'log':
      console.log('📝 Session log:', update.data)
      break
    case 'error':
      console.error('❌ Session error:', update.data)
      break
  }
}

function updateSessionUI(): void {
  if (!currentSession) return
  
  const statusElement = document.querySelector('#sessionStatus')
  const progressElement = document.querySelector('#sessionProgress')
  
  if (statusElement) {
    statusElement.textContent = `Session: ${currentSession.status} (${currentSession.progress.toFixed(1)}%)`
  }
  
  if (progressElement) {
    (progressElement as HTMLElement).style.width = `${currentSession.progress}%`
  }
  
  // Update button states based on session status
  updateExecutionControlsForApi()
}

function updateExecutionControlsForApi(): void {
  const startBtn = document.querySelector('#startBtn') as HTMLButtonElement
  const pauseBtn = document.querySelector('#pauseBtn') as HTMLButtonElement
  const stepBtn = document.querySelector('#stepBtn') as HTMLButtonElement
  const abortBtn = document.querySelector('#abortBtn') as HTMLButtonElement
  const rerunBtn = document.querySelector('#rerunBtn') as HTMLButtonElement
  
  if (!currentSession) {
    startBtn.disabled = false
    pauseBtn.disabled = true
    stepBtn.disabled = true
    abortBtn.disabled = true
    rerunBtn.disabled = false
    return
  }
  
  switch (currentSession.status) {
    case 'idle':
      startBtn.disabled = false
      pauseBtn.disabled = true
      stepBtn.disabled = true
      abortBtn.disabled = true
      rerunBtn.disabled = false
      break
    case 'running':
      startBtn.disabled = true
      pauseBtn.disabled = false
      stepBtn.disabled = false
      abortBtn.disabled = false
      rerunBtn.disabled = true
      break
    case 'paused':
      startBtn.disabled = false
      startBtn.textContent = 'Resume'
      pauseBtn.disabled = true
      stepBtn.disabled = false
      abortBtn.disabled = false
      rerunBtn.disabled = true
      break
    case 'completed':
    case 'aborted':
    case 'failed':
      startBtn.disabled = false
      startBtn.textContent = 'Start'
      pauseBtn.disabled = true
      stepBtn.disabled = true
      abortBtn.disabled = true
      rerunBtn.disabled = false
      break
  }
}

// Export API functions for testing
(window as any).apiSession = {
  start: startApiSession,
  pause: pauseApiSession,
  resume: resumeApiSession,
  abort: abortApiSession,
  status: () => currentSession,
  token: () => currentToken
}

// Story 11: Appium Integration Types
interface AppiumConnection {
  sessionId: string | null
  isConnected: boolean
  lastPing: Date | null
  retryCount: number
  capabilities: AppiumCapabilities
}

interface AppiumCapabilities {
  platformName: string
  deviceName: string
  appPackage?: string
  appActivity?: string
  noReset?: boolean
  fullReset?: boolean
  automationName: string
  newCommandTimeout: number
}

interface ActionResult {
  success: boolean
  errorMessage?: string
  screenshot?: string
  pageSource?: string
  duration: number
  retryCount: number
}

interface DeviceAction {
  type: 'tap' | 'type' | 'swipe' | 'wait' | 'screenshot' | 'source'
  selector?: string
  text?: string
  coordinates?: { x: number; y: number }
  timeout?: number
  retries?: number
}

// Story 11: Appium State Management
let appiumConnection: AppiumConnection = {
  sessionId: null,
  isConnected: false,
  lastPing: null,
  retryCount: 0,
  capabilities: {
    platformName: 'Android',
    deviceName: 'Pixel_7_API_33',
    automationName: 'UiAutomator2',
    newCommandTimeout: 300
  }
}

let screenshotStream: {
  interval: number | null
  lastScreenshot: Date | null
  throttleMs: number
} = {
  interval: null,
  lastScreenshot: null,
  throttleMs: 2000
}

// Story 12: End-to-End Validation Types
interface TestCase {
  id: string
  name: string
  description: string
  commands: string[]
  expectedResults: string[]
  complexity: 'simple' | 'medium' | 'complex'
  category: 'smoke' | 'regression' | 'integration'
}

interface TestExecution {
  id: string
  testCase: TestCase
  startTime: Date
  endTime?: Date
  status: 'running' | 'passed' | 'failed' | 'skipped'
  duration?: number
  steps: TestStep[]
  screenshots: string[]
  errors: string[]
  performance: PerformanceMetrics
}

interface TestStep {
  stepNumber: number
  description: string
  action: string
  status: 'pending' | 'running' | 'passed' | 'failed'
  duration?: number
  screenshot?: string
  error?: string
}

interface PerformanceMetrics {
  totalDuration: number
  stepAverageDuration: number
  successRate: number
  screenshotCaptureTimes: number[]
  replanningCount: number
  appiumActionTimes: number[]
}

interface TestReport {
  id: string
  generatedAt: Date
  testSuite: string
  summary: {
    totalTests: number
    passed: number
    failed: number
    skipped: number
    successRate: number
    totalDuration: number
  }
  executions: TestExecution[]
  performance: {
    avgStepDuration: number
    avgReplanningTime: number
    screenshotCaptureAvg: number
  }
  mvpTargets: {
    successRateTarget: number
    successRateActual: number
    meets80PercentTarget: boolean
  }
}

// Story 12: Validation State Management
let testExecutions: TestExecution[] = []
let currentTestExecution: TestExecution | null = null
let validationMode = false
let performanceStartTime: number = 0

// Story 12: Predefined Test Cases
const sampleTestCases: TestCase[] = [
  {
    id: 'smoke-001',
    name: 'Basic App Launch and Search',
    description: 'Launch app, perform basic search, verify results',
    commands: [
      'launch app',
      'search for "test query"',
      'verify search results',
      'take screenshot'
    ],
    expectedResults: [
      'App launches successfully',
      'Search input accepts text',
      'Search results displayed',
      'No crashes or errors'
    ],
    complexity: 'simple',
    category: 'smoke'
  },
  {
    id: 'smoke-002',
    name: 'Navigation Flow',
    description: 'Navigate through multiple screens and return to home',
    commands: [
      'open navigation menu',
      'tap on settings',
      'navigate back to home',
      'verify home screen'
    ],
    expectedResults: [
      'Navigation menu opens',
      'Settings screen loads',
      'Back navigation works',
      'Home screen restored'
    ],
    complexity: 'simple',
    category: 'smoke'
  },
  {
    id: 'integration-001',
    name: 'Form Input and Submission',
    description: 'Fill out form fields and submit data',
    commands: [
      'tap on login form',
      'type username "testuser"',
      'type password "password123"',
      'tap submit button',
      'verify successful login'
    ],
    expectedResults: [
      'Form fields accept input',
      'Submit button responds',
      'Login process completes',
      'User authenticated'
    ],
    complexity: 'medium',
    category: 'integration'
  },
  {
    id: 'integration-002',
    name: 'Shopping Cart Workflow',
    description: 'Add items to cart, modify quantities, and checkout',
    commands: [
      'browse product catalog',
      'add item to cart',
      'modify cart quantity',
      'proceed to checkout',
      'complete purchase flow'
    ],
    expectedResults: [
      'Products displayed correctly',
      'Cart functionality works',
      'Quantity updates properly',
      'Checkout process succeeds',
      'Order confirmation shown'
    ],
    complexity: 'medium',
    category: 'integration'
  }
]

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="min-h-screen flex flex-col">
    <!-- Top toolbar -->
    <div class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <h1 class="text-xl font-semibold text-gray-800">AI-QA Agent</h1>
        <div class="flex items-center space-x-2">
          <span class="text-sm text-gray-500">Device</span>
          <select id="deviceSelect" class="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="Pixel_7_API_33">Pixel 7 API 33</option>
            <option value="Galaxy_S23_API_34">Galaxy S23 API 34</option>
            <option value="Nexus_5X_API_30">Nexus 5X API 30</option>
          </select>
        </div>
        <div class="flex items-center space-x-2">
          <input id="apkInput" type="file" accept=".apk" class="hidden" />
          <label for="apkInput" id="apkLabel" class="cursor-pointer border border-gray-300 rounded px-2 py-1 text-sm bg-gray-50 hover:bg-gray-100">
            Upload APK
          </label>
        </div>
        <!-- Story 11: Appium Connection Controls -->
        <div class="flex items-center space-x-2">
          <button id="connectButton" class="border border-green-300 rounded px-2 py-1 text-sm text-green-700 bg-green-50 hover:bg-green-100">
            Connect Device
          </button>
          <button id="disconnectButton" class="border border-red-300 rounded px-2 py-1 text-sm text-red-700 bg-red-50 hover:bg-red-100 hidden">
            Disconnect
          </button>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <label class="flex items-center space-x-2 text-sm">
          <input id="verboseToggle" type="checkbox" class="rounded" />
          <span>Verbose Logging</span>
        </label>
        <button class="p-2 text-gray-500 hover:text-gray-700" title="Settings">⚙️</button>
      </div>
    </div>

    <!-- Main content: 60/40 split -->
    <div class="flex flex-1">
      <!-- Emulator (left 60%) -->
      <div class="w-3/5 bg-black p-4 flex items-center justify-center">
        <div class="relative bg-gray-800 rounded-lg p-6" style="width: 320px; height: 640px;">
          <div class="w-full h-full bg-white rounded flex items-center justify-center relative overflow-hidden">
            <div class="w-full h-full bg-gradient-to-b from-blue-500 to-blue-600">
              <div class="h-6 bg-black bg-opacity-20 flex items-center justify-between px-2">
                <span class="text-white text-xs">9:41</span>
                <div class="flex space-x-1">
                  <div class="w-4 h-2 bg-white rounded-sm opacity-80"></div>
                  <div class="w-4 h-2 bg-white rounded-sm opacity-60"></div>
                  <div class="w-4 h-2 bg-white rounded-sm opacity-40"></div>
                </div>
              </div>
              <div class="p-4 space-y-4">
                <div class="text-white text-center">
                  <h2 class="text-lg font-semibold">Swiggy</h2>
                </div>
                <div class="bg-white bg-opacity-20 rounded p-2">
                  <span class="text-white text-sm">📍 Bengaluru, Karnataka</span>
                </div>
                <div class="bg-white rounded-lg p-3 shadow-lg">
                  <div class="flex items-center space-x-2">
                    <span class="w-4 h-4 text-gray-400">🔎</span>
                    <input 
                      id="emulatorSearchInput"
                      type="text" 
                      placeholder="Search for restaurants"
                      class="flex-1 outline-none text-sm"
                      value=""
                      readonly
                    />
                  </div>
                </div>
                <div class="bg-white bg-opacity-20 rounded-lg h-20 flex items-center justify-center">
                  <span class="text-white text-sm">Special Offers</span>
                </div>
              </div>
              
              <!-- Execution Indicator (Loading Spinner) -->
              <div id="executionSpinner" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden">
                <div class="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
          <div class="absolute inset-0 border-8 border-gray-700 rounded-2xl pointer-events-none"></div>
          <div class="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-600 rounded-full"></div>
          <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-8 border-2 border-gray-600 rounded-full"></div>
        </div>
      </div>
      <!-- Console (right 40%) -->
      <div class="w-2/5 bg-white border-l border-gray-200 flex flex-col">
        <!-- Command Input Section -->
        <div class="p-4 border-b border-gray-200">
          <div class="space-y-3">
            <label class="block text-sm font-medium text-gray-700">Test Command</label>
            <textarea
              id="commandInput"
              placeholder="Enter natural language test command..."
              class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows="3"
            ></textarea>
            
            <!-- Quick Commands -->
            <div class="space-y-2">
              <span class="text-xs text-gray-500">Quick Commands:</span>
              <div class="grid gap-1">
                <button class="quick-command text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded">
                  Search for McDonald's and open its page
                </button>
                <button class="quick-command text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded">
                  Login with valid credentials
                </button>
                <button class="quick-command text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded">
                  Add item to cart and checkout
                </button>
                <button class="quick-command text-left text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded">
                  Navigate to profile settings
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Plan Preview Section -->
        <div id="planPreview" class="p-4 border-b border-gray-200 bg-gray-50 hidden">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-gray-700">Generated Plan</span>
              <span id="confidenceScore" class="text-xs text-gray-500">Confidence: 92%</span>
            </div>
            
            <div id="planSteps" class="space-y-1">
              <!-- Plan steps will be populated by JavaScript -->
            </div>
            
            <!-- Execution Controls -->
            <div class="flex space-x-2 pt-2">
              <button
                id="startBtn"
                class="flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400"
                disabled
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Start</span>
              </button>
              
              <button
                id="pauseBtn"
                class="flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400"
                disabled
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
                <span>Pause</span>
              </button>
              
              <button
                id="stepBtn"
                class="flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400"
                disabled
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                </svg>
                <span>Step</span>
              </button>
              
              <button
                id="abortBtn"
                class="flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400"
                disabled
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <span>Abort</span>
              </button>
              
              <button
                id="rerunBtn"
                class="flex items-center space-x-1 px-3 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1 4v6h6M23 20v-6h-6"/>
                  <path d="m20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                <span>Rerun</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Story 5: Execution Log & Step Timeline -->
        <div class="flex-1 flex flex-col">
          <!-- Tab Headers -->
          <div class="flex border-b border-gray-200">
            <button 
              id="executionLogTab"
              class="px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600"
            >
              Execution Log
            </button>
            <button 
              id="inspectorTab"
              class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            >
              <div class="flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                </svg>
                <span>Inspector</span>
              </div>
            </button>
            <button 
              id="historyTab"
              class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"
            >
              <div class="flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>History</span>
              </div>
            </button>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 overflow-auto">
            <!-- Execution Log Tab Content -->
            <div id="executionLogContent" class="p-4 space-y-3">
              <div class="flex items-center justify-between mb-4">
                <span class="text-sm font-medium text-gray-700">Execution Progress</span>
                <span id="executionStatusDisplay" class="text-xs text-gray-500">Idle</span>
              </div>
              
              <!-- Execution Steps List -->
              <div id="executionStepsList" class="space-y-2">
                <!-- Steps will be populated by JavaScript -->
              </div>
              
              <!-- When no execution -->
              <div id="noExecutionMessage" class="text-center py-8 text-gray-500 text-sm">
                No execution in progress. Click "Start" to begin.
              </div>
            </div>

            <!-- Inspector Tab Content -->
            <div id="inspectorContent" class="hidden p-4">
              <div class="text-center py-8 text-gray-500 text-sm">
                <div class="mb-4">
                  <svg class="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </div>
                <p class="mb-2">UI Context Inspector</p>
                <p class="text-xs">Start execution to see UI element analysis and context data.</p>
              </div>
            </div>

            <!-- History Tab Content -->
            <div id="historyContent" class="hidden p-4">
              <!-- Story 12: Validation and Reports Section -->
              <div class="space-y-4">
                <div class="border-b border-gray-200 pb-4">
                  <h3 class="text-lg font-medium text-gray-800 mb-3">Validation & Testing</h3>
                  <div class="flex items-center space-x-4">
                    <button id="runValidationBtn" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm">
                      Run Validation Suite
                    </button>
                    <button id="runSmokeTestsBtn" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 text-sm">
                      Run Smoke Tests
                    </button>
                    <button id="runIntegrationTestsBtn" class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 text-sm">
                      Run Integration Tests
                    </button>
                  </div>
                </div>
                
                <div id="validationResults" class="hidden">
                  <h4 class="text-md font-medium text-gray-700 mb-2">Latest Validation Results</h4>
                  <div id="validationSummary" class="bg-gray-50 rounded-lg p-3 mb-4"></div>
                </div>
                
                <div>
                  <h4 class="text-md font-medium text-gray-700 mb-3">Test Reports</h4>
                  <div id="reportsList" class="space-y-2">
                    <p class="text-sm text-gray-500">No test reports available. Run validation suite to generate reports.</p>
                  </div>
                </div>
                
                <div class="mt-6">
                  <h4 class="text-md font-medium text-gray-700 mb-3">Execution History</h4>
                  <div class="text-center py-8 text-gray-500 text-sm">
                    Execution history will be available in future stories.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom status bar -->
    <div id="statusBar" class="bg-gray-50 border-t border-gray-200 px-4 py-2 text-sm text-gray-600 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <span>Device: Pixel_7_API_33</span>
        <span>App: None</span>
        <!-- Story 13: API Session Status -->
        <span id="sessionStatus" class="hidden">Session: <span class="font-medium">Not Connected</span></span>
      </div>
      <div class="flex items-center gap-2">
        <!-- Story 13: Session Progress Bar -->
        <div id="sessionProgressContainer" class="hidden flex items-center gap-2">
          <span class="text-xs">Progress:</span>
          <div class="bg-gray-200 rounded-full h-2 w-20">
            <div id="sessionProgress" class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
        </div>
        <!-- Story 13: API Controls -->
        <div id="apiControls" class="flex items-center gap-1">
          <button id="initApiBtn" class="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">Init API</button>
          <button id="apiStatusBtn" class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors">Status</button>
        </div>
        <!-- Story 14: Real Appium Toggle -->
        <div id="appiumModeControls" class="flex items-center gap-1">
          <button id="toggleAppiumMode" class="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">Mock Mode</button>
          <button id="checkAppiumServer" class="px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors">Check Server</button>
        </div>
      </div>
    </div>
  </div>
`

// Wire minimal interactions for Story 1
const deviceSelect = document.getElementById('deviceSelect') as HTMLSelectElement
const apkInput = document.getElementById('apkInput') as HTMLInputElement
const apkLabel = document.getElementById('apkLabel') as HTMLLabelElement
const statusBar = document.getElementById('statusBar') as HTMLDivElement

// Story 11: Appium Connection Controls
const connectButton = document.getElementById('connectButton') as HTMLButtonElement

// Story 13: API Controls
const initApiBtn = document.getElementById('initApiBtn') as HTMLButtonElement
const apiStatusBtn = document.getElementById('apiStatusBtn') as HTMLButtonElement

// Story 14: Real Appium Controls
const toggleAppiumModeBtn = document.getElementById('toggleAppiumMode') as HTMLButtonElement
const checkAppiumServerBtn = document.getElementById('checkAppiumServer') as HTMLButtonElement

// Story 13: API Event Handlers
initApiBtn?.addEventListener('click', () => {
  initializeApiSession()
  const sessionStatusEl = document.getElementById('sessionStatus')
  const sessionProgressEl = document.getElementById('sessionProgressContainer')
  
  if (sessionStatusEl && sessionProgressEl) {
    sessionStatusEl.classList.remove('hidden')
    sessionProgressEl.classList.remove('hidden')
    sessionStatusEl.innerHTML = `Session: <span class="font-medium text-green-600">API Ready</span>`
  }
  
  console.log('🎯 Orchestrator API initialized - ready to manage sessions')
})

apiStatusBtn?.addEventListener('click', () => {
  if (currentSession) {
    const response = orchestrator.getSessionStatus(currentToken!, currentSession.id)
    if (response.success) {
      console.log('📊 Current session status:', response.data)
      alert(`Session Status:\nID: ${response.data?.id}\nStatus: ${response.data?.status}\nProgress: ${response.data?.progress.toFixed(1)}%\nSteps: ${response.data?.currentStep}/${response.data?.totalSteps}`)
    }
  } else {
    console.log('❌ No active session')
    alert('No active session found. Click "Init API" and then start a session.')
  }
})

// Story 14: Real Appium Event Handlers
toggleAppiumModeBtn?.addEventListener('click', () => {
  useRealAppium = !useRealAppium
  
  if (useRealAppium) {
    toggleAppiumModeBtn.textContent = 'Real Mode'
    toggleAppiumModeBtn.classList.remove('bg-purple-500', 'hover:bg-purple-600')
    toggleAppiumModeBtn.classList.add('bg-green-500', 'hover:bg-green-600')
    console.log('🚀 Switched to Real Appium Mode')
    alert('🚀 Real Appium Mode Enabled\n\nMake sure:\n1. Appium server is running on localhost:4723\n2. Android emulator or device is connected\n3. USB debugging is enabled')
  } else {
    toggleAppiumModeBtn.textContent = 'Mock Mode'
    toggleAppiumModeBtn.classList.remove('bg-green-500', 'hover:bg-green-600')
    toggleAppiumModeBtn.classList.add('bg-purple-500', 'hover:bg-purple-600')
    console.log('🎭 Switched to Mock Appium Mode')
    alert('🎭 Mock Appium Mode Enabled\n\nUsing simulated device interactions for testing.')
  }
})

checkAppiumServerBtn?.addEventListener('click', async () => {
  console.log('🔍 Checking Appium server status...')
  checkAppiumServerBtn.textContent = 'Checking...'
  checkAppiumServerBtn.disabled = true
  
  try {
    const isServerReady = await realAppiumClient.checkAppiumServer()
    
    if (isServerReady) {
      console.log('✅ Appium server is ready')
      alert('✅ Appium Server Status: READY\n\nServer is running on http://localhost:4723\nReady to accept connections.')
    } else {
      console.log('❌ Appium server is not ready')
      alert('❌ Appium Server Status: NOT READY\n\nPlease start Appium server:\n1. Run "appium" in terminal\n2. Ensure it starts on localhost:4723\n3. Check for any error messages')
    }
  } catch (error) {
    console.error('❌ Failed to check Appium server:', error)
    alert('❌ Failed to check Appium server\n\nError: ' + (error instanceof Error ? error.message : 'Unknown error'))
  } finally {
    checkAppiumServerBtn.textContent = 'Check Server'
    checkAppiumServerBtn.disabled = false
  }
})
const disconnectButton = document.getElementById('disconnectButton') as HTMLButtonElement

deviceSelect?.addEventListener('change', () => {
  const spans = statusBar.querySelectorAll('span')
  if (spans[0]) spans[0].textContent = `Device: ${deviceSelect.value}`
  
  // Update Appium capabilities when device changes
  if (appiumConnection.capabilities) {
    appiumConnection.capabilities.deviceName = deviceSelect.value
  }
})

apkInput?.addEventListener('change', async () => {
  const fileName = apkInput.files && apkInput.files[0] ? apkInput.files[0].name : 'Upload APK'
  apkLabel.textContent = fileName
  const spans = statusBar.querySelectorAll('span')
  if (spans[1]) spans[1].textContent = `App: ${fileName === 'Upload APK' ? 'None' : fileName}`
  
  // Story 11: Auto-install APK when uploaded and connected
  if (fileName !== 'Upload APK' && appiumConnection.isConnected) {
    console.log('Installing APK automatically...')
    const success = await installAndLaunchApp(fileName, 'noReset')
    if (success) {
      console.log('APK installed and launched successfully')
    }
  }
})

// Story 11: Appium Connection Event Handlers
connectButton?.addEventListener('click', async () => {
  connectButton.disabled = true
  connectButton.textContent = 'Connecting...'
  
  const success = await connectToAppium()
  
  if (success) {
    connectButton.classList.add('hidden')
    disconnectButton.classList.remove('hidden')
  } else {
    connectButton.disabled = false
    connectButton.textContent = 'Connect Device'
  }
})

disconnectButton?.addEventListener('click', async () => {
  disconnectButton.disabled = true
  disconnectButton.textContent = 'Disconnecting...'
  
  await disconnectFromAppium()
  
  connectButton.classList.remove('hidden')
  disconnectButton.classList.add('hidden')
  connectButton.disabled = false
  connectButton.textContent = 'Connect Device'
  disconnectButton.disabled = false
  disconnectButton.textContent = 'Disconnect'
})

// Story 2: Command Input & Plan Generation Interface
const commandInput = document.getElementById('commandInput') as HTMLTextAreaElement
const planPreview = document.getElementById('planPreview') as HTMLDivElement
const planSteps = document.getElementById('planSteps') as HTMLDivElement
const confidenceScore = document.getElementById('confidenceScore') as HTMLSpanElement
const quickCommandButtons = document.querySelectorAll('.quick-command') as NodeListOf<HTMLButtonElement>

// Mock plan data - Enhanced for Story 6
const mockPlans = {
  "search": {
    confidence: 0.92,
    steps: [
      { action: "launch_app", description: "Launch Swiggy app" },
      { action: "click_element", description: "Click search bar" },
      { action: "type_text", description: "Type search query" },
      { action: "wait_for_results", description: "Wait for search results" },
      { action: "take_screenshot", description: "Capture search results" }
    ]
  },
  "order": {
    confidence: 0.87,
    steps: [
      { action: "launch_app", description: "Launch Swiggy app" },
      { action: "click_element", description: "Click search bar" },
      { action: "type_text", description: "Search for restaurant" },
      { action: "click_element", description: "Select restaurant" },
      { action: "wait_for_element", description: "Wait for menu to load" },
      { action: "click_element", description: "Select menu item" },
      { action: "click_element", description: "Add to cart" },
      { action: "click_element", description: "Proceed to checkout" }
    ]
  },
  "login": {
    confidence: 0.78,
    steps: [
      { action: "launch_app", description: "Launch Swiggy app" },
      { action: "click_element", description: "Click profile/login" },
      { action: "type_text", description: "Enter phone number" },
      { action: "click_element", description: "Send OTP" },
      { action: "wait_for_element", description: "Wait for OTP screen" },
      { action: "type_text", description: "Enter OTP code" },
      { action: "click_element", description: "Verify and login" }
    ]
  },
  "fallback": {
    confidence: 0.65,
    steps: [
      { action: "launch_app", description: "Launch Swiggy app" },
      { action: "take_screenshot", description: "Capture current state" },
      { action: "wait_for_element", description: "Wait for app to load" },
      { action: "navigate_back", description: "Go back if needed" }
    ]
  }
}

// Story 7: AI-Powered Execution Replanning
interface ReplanningContext {
  originalCommand: string
  currentStep: number
  totalSteps: number
  failureReason: string
  attemptNumber: number
  maxAttempts: number
  previousPlan: any
  uiContext?: string
}

interface ReplanningResult {
  success: boolean
  newPlan?: any
  confidence: number
  reason: string
  shouldContinue: boolean
}

// Replanning state management
let replanningAttempts = 0
const MAX_REPLANNING_ATTEMPTS = 3
let isReplanning = false
let replanningHistory: ReplanningContext[] = []

// Story 6: Enhanced Plan Generation with AI-like Intelligence
interface PlanGenerationContext {
  command: string
  previousAttempts: number
  lastFailure?: string
  uiContext?: string
}

interface PlanSchema {
  confidence: number
  steps: Array<{
    action: string
    description: string
    selector?: string
    text?: string
    timeout?: number
  }>
  metadata?: {
    complexity: 'simple' | 'medium' | 'complex'
    estimatedDuration: number
    requiresAuth: boolean
  }
}

let planGenerationAttempts = 0
let isGeneratingPlan = false

// Function to generate and display plan


// Wire quick command buttons
quickCommandButtons.forEach(button => {
  button.addEventListener('click', () => {
    const commandText = button.textContent?.trim() || ''
    commandInput.value = commandText
    generatePlan(commandText)
  })
})

// Wire command input with debounced plan generation
let planGenerationTimeout: number | null = null
commandInput?.addEventListener('input', () => {
  const command = commandInput.value
  
  // Update control buttons immediately when command changes
  updateControlButtons()
  
  // Debounce plan generation
  if (planGenerationTimeout) {
    clearTimeout(planGenerationTimeout)
  }
  
  planGenerationTimeout = setTimeout(() => {
    generatePlan(command)
  }, 500) // 500ms debounce
})

// Story 3: Emulator Display & Device Simulation
const emulatorSearchInput = document.getElementById('emulatorSearchInput') as HTMLInputElement
const executionSpinner = document.getElementById('executionSpinner') as HTMLDivElement

// Story 4: Execution Controls & Test Management
const startBtn = document.getElementById('startBtn') as HTMLButtonElement
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement
const stepBtn = document.getElementById('stepBtn') as HTMLButtonElement
const abortBtn = document.getElementById('abortBtn') as HTMLButtonElement
const rerunBtn = document.getElementById('rerunBtn') as HTMLButtonElement
const executionStatusDisplay = document.getElementById('executionStatusDisplay') as HTMLSpanElement
const currentStepDisplay = document.getElementById('currentStepDisplay') as HTMLSpanElement

// Execution state management
let executionStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed' = 'idle'
let currentStep = 0
let isExecuting = false
let executionInterval: number | null = null

// Update button states based on execution status
function updateControlButtons() {
  const hasCommand = commandInput && commandInput.value.trim().length > 0
  
  // Update button colors and states
  if (executionStatus === 'idle') {
    // Start button
    if (hasCommand) {
      startBtn.disabled = false
      startBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700'
      startBtn.querySelector('span')!.textContent = 'Start'
    } else {
      startBtn.disabled = true
      startBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    }
    
    // Other buttons disabled
    pauseBtn.disabled = true
    pauseBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    stepBtn.disabled = true
    stepBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    abortBtn.disabled = true
    abortBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    
    // Rerun enabled
    rerunBtn.disabled = false
    rerunBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-700'
    
  } else if (executionStatus === 'running') {
    // Start button disabled
    startBtn.disabled = true
    startBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    
    // Control buttons enabled
    pauseBtn.disabled = false
    pauseBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700'
    stepBtn.disabled = false
    stepBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700'
    abortBtn.disabled = false
    abortBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700'
    
  } else if (executionStatus === 'paused') {
    // Start button becomes Resume
    startBtn.disabled = false
    startBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700'
    startBtn.querySelector('span')!.textContent = 'Resume'
    
    // Pause disabled, others enabled
    pauseBtn.disabled = true
    pauseBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-gray-400 text-white rounded text-sm disabled:bg-gray-400'
    stepBtn.disabled = false
    stepBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700'
    abortBtn.disabled = false
    abortBtn.className = 'flex items-center space-x-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700'
  }
  
  // Update status display
  executionStatusDisplay.textContent = executionStatus.charAt(0).toUpperCase() + executionStatus.slice(1)
  currentStepDisplay.textContent = currentStep.toString()
}

// Function to update emulator display based on execution state
function updateEmulatorDisplay() {
  if (!emulatorSearchInput || !executionSpinner) return

  switch (executionStatus) {
    case 'idle':
      emulatorSearchInput.value = ''
      executionSpinner.classList.add('hidden')
      break
    
    case 'running':
      executionSpinner.classList.remove('hidden')
      // Show typed text based on current step (step 2 is typically "type" action)
      if (currentStep >= 2) {
        emulatorSearchInput.value = "McDonald's"
      }
      break
    
    case 'paused':
      executionSpinner.classList.add('hidden')
      // Keep any typed text
      break
    
    case 'completed':
    case 'failed':
      executionSpinner.classList.add('hidden')
      // Keep final state
      break
  }
  
  // Update control buttons whenever emulator display updates
  updateControlButtons()
}

// Story 4: Execution Control Handlers
function handleStart() {
  // Story 13: Use Orchestrator API if session management is enabled
  if (currentToken && currentSession) {
    if (currentSession.status === 'paused') {
      resumeApiSession()
      return
    } else if (currentSession.status === 'idle') {
      startApiSession()
      return
    }
  } else if (currentToken) {
    // Start new API session if we have token but no session
    startApiSession()
    return
  }
  
  // Fallback to original execution system
  if (executionStatus === 'paused') {
    // Resume execution
    executionStatus = 'running'
    isExecuting = true
    updateEmulatorDisplay()
    
    // Continue from current step
    continueExecution()
  } else {
    // Start new execution
    // Reset replanning state for new execution
    replanningAttempts = 0
    replanningHistory = []
    isReplanning = false
    
    executionStatus = 'running'
    currentStep = 0
    isExecuting = true
    
    // Initialize execution steps for Story 5
    initializeExecutionSteps()
    
    updateEmulatorDisplay()
    
    // Start execution from beginning
    startExecution()
  }
}

function handlePause() {
  executionStatus = 'paused'
  isExecuting = false
  if (executionInterval) {
    clearInterval(executionInterval)
    executionInterval = null
  }
  
  // Update current running step to completed
  updateCurrentStepStatus('completed')
  
  updateEmulatorDisplay()
}

function handleStep() {
  if (executionStatus === 'running') {
    // Pause first
    handlePause()
  }
  
  // Execute single step
  executeNextStep()
  
  // Check if execution is complete
  if (currentStep >= 4) {
    executionStatus = 'completed'
    isExecuting = false
    updateEmulatorDisplay()
  }
}

function handleAbort() {
  executionStatus = 'idle'
  currentStep = 0
  isExecuting = false
  if (executionInterval) {
    clearInterval(executionInterval)
    executionInterval = null
  }
  
  // Reset replanning state
  replanningAttempts = 0
  replanningHistory = []
  isReplanning = false
  
  // Mark all running steps as failed
  executionSteps.forEach(step => {
    if (step.status === 'running') {
      step.status = 'failed'
    }
  })
  renderExecutionSteps()
  
  updateEmulatorDisplay()
}

function handleRerun() {
  // Stop current execution if running
  if (isExecuting) {
    handleAbort()
  }
  
  // Wait a moment then restart
  setTimeout(() => {
    handleStart()
  }, 100)
}

// Story 5: Execution step management
function initializeExecutionSteps() {
  stepIdCounter = 0
  executionSteps = [
    {
      id: ++stepIdCounter,
      description: 'Launch Swiggy app',
      action: 'launch_app',
      status: 'pending',
      screenshot: true
    },
    {
      id: ++stepIdCounter,
      description: 'Click search bar',
      action: 'click_element',
      status: 'pending',
      screenshot: true
    },
    {
      id: ++stepIdCounter,
      description: 'Type "McDonald\'s"',
      action: 'type_text',
      status: 'pending',
      screenshot: true
    },
    {
      id: ++stepIdCounter,
      description: 'Select McDonald\'s from suggestions',
      action: 'click_element',
      status: 'pending',
      screenshot: true
    }
  ]
  
  // Ensure executionStepsList exists before rendering
  if (executionStepsList) {
    renderExecutionSteps()
  }
}

function updateCurrentStepStatus(status: ExecutionStep['status'], duration?: string) {
  if (currentStep > 0 && currentStep <= executionSteps.length) {
    const step = executionSteps[currentStep - 1]
    step.status = status
    if (duration) step.duration = duration
    if (status === 'completed' || status === 'failed') {
      step.timestamp = new Date().toLocaleTimeString()
    }
    renderExecutionSteps()
  }
}

function executeNextStep() {
  currentStep++
  if (currentStep <= executionSteps.length) {
    const step = executionSteps[currentStep - 1]
    step.status = 'running'
    step.timestamp = new Date().toLocaleTimeString()
    renderExecutionSteps()
    
    // Story 8: Collect UI context before step execution
    if (contextCollectionEnabled) {
      try {
        const contextPayload = collectContextForStep(step.description)
        console.log(`Context collected for step ${currentStep}: ${contextPayload.trimmedElements.length} elements`)
        
        // Update inspector tab with current context
        updateInspectorContent(contextPayload)
      } catch (error) {
        console.error('Failed to collect UI context:', error)
      }
    }
    
    // Story 11: Execute step with real device action when connected
    const executeStep = async () => {
      const startTime = Date.now()
      
      try {
        let actionResult: ActionResult | null = null
        
        // Use real Appium actions if connected, otherwise simulate
        if (appiumConnection.isConnected) {
          const deviceAction = convertStepToDeviceAction(step)
          actionResult = await executeDeviceAction(deviceAction)
          
          if (!actionResult.success) {
            throw new Error(actionResult.errorMessage || 'Device action failed')
          }
        } else {
          // Simulate action delay for non-connected mode
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
        }
        
        // 20% chance of failure to demonstrate replanning (only in simulation mode)
        const shouldFail = !appiumConnection.isConnected && 
                          Math.random() < 0.2 && 
                          currentStep >= 2 && 
                          replanningAttempts < MAX_REPLANNING_ATTEMPTS
        
        if (shouldFail) {
          throw new Error('Simulated step failure for replanning demonstration')
        }
        
        // Step completed successfully
        const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's'
        updateCurrentStepStatus('completed', duration)
        
        // Update emulator with screenshot if available
        if (actionResult?.screenshot) {
          updateEmulatorScreenshot(actionResult.screenshot)
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.warn(`Step ${currentStep} failed:`, errorMessage)
        
        // Handle failure and potentially trigger replanning
        const duration = ((Date.now() - startTime) / 1000).toFixed(1) + 's'
        
        // Check if we should attempt replanning
        if (replanningAttempts < MAX_REPLANNING_ATTEMPTS) {
          updateCurrentStepStatus('failed', duration)
          
          // Start replanning process
          isReplanning = true
          replanningAttempts++
          
          // Create replanning context
          const command = commandInput?.value || 'current command'
          const failure = {
            reason: errorMessage,
            stepIndex: currentStep - 1,
            shouldReplan: true
          }
          const context = createReplanningContext(command, currentStep - 1, failure.reason)
          
          // Generate new plan
          const replanResult = generateReplan(context)
          
          // Add replanning log entry
          addReplanningLogEntry(context, replanResult)
          
          if (replanResult.success && replanResult.shouldContinue) {
            // Apply new plan - add recovery steps
            const recoverySteps = replanResult.newPlan.steps.slice(0, 2).map((step: any) => ({
              id: ++stepIdCounter,
              description: step.description,
              action: step.action,
              status: 'pending' as const,
              screenshot: false,
              expanded: false
            }))
            
            // Insert recovery steps after current position
            executionSteps.splice(currentStep, 0, ...recoverySteps)
            renderExecutionSteps()
            
            // Continue execution after a brief pause
            setTimeout(() => {
              isReplanning = false
              executeNextStep()
            }, 2000)
            
            return
          }
        }
        
        // Replanning failed or max attempts reached
        updateCurrentStepStatus('failed', duration)
        executionStatus = 'failed'
        isExecuting = false
        isReplanning = false
        updateEmulatorDisplay()
        updateControlButtons()
        return
      }
    }
    
    // Execute the step
    executeStep()
  }
  updateEmulatorDisplay()
}

// Execution flow functions
function startExecution() {
  executionInterval = setInterval(() => {
    executeNextStep()
    
    // Complete after 4 steps
    if (currentStep >= 4) {
      clearInterval(executionInterval!)
      executionInterval = null
      executionStatus = 'completed'
      isExecuting = false
      updateEmulatorDisplay()
    }
  }, 1500) // 1.5 seconds per step
}

function continueExecution() {
  const remainingSteps = 4 - currentStep
  if (remainingSteps > 0) {
    executionInterval = setInterval(() => {
      executeNextStep()
      
      // Complete after reaching step 4
      if (currentStep >= 4) {
        clearInterval(executionInterval!)
        executionInterval = null
        executionStatus = 'completed'
        isExecuting = false
        updateEmulatorDisplay()
      }
    }, 1500) // 1.5 seconds per step
  }
}

// Wire up button event listeners
startBtn?.addEventListener('click', handleStart)
pauseBtn?.addEventListener('click', handlePause)
stepBtn?.addEventListener('click', handleStep)
abortBtn?.addEventListener('click', handleAbort)
rerunBtn?.addEventListener('click', handleRerun)

// Story 5: Execution Log & Step Timeline
const executionLogTab = document.getElementById('executionLogTab') as HTMLButtonElement
const inspectorTab = document.getElementById('inspectorTab') as HTMLButtonElement
const historyTab = document.getElementById('historyTab') as HTMLButtonElement
const executionLogContent = document.getElementById('executionLogContent') as HTMLDivElement
const inspectorContent = document.getElementById('inspectorContent') as HTMLDivElement
const historyContent = document.getElementById('historyContent') as HTMLDivElement
const executionStepsList = document.getElementById('executionStepsList') as HTMLDivElement
const noExecutionMessage = document.getElementById('noExecutionMessage') as HTMLDivElement

// Tab state management
let activeTab: 'execution' | 'inspector' | 'history' = 'execution'

// Execution steps data
interface ExecutionStep {
  id: number
  description: string
  action: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  timestamp?: string
  duration?: string
  screenshot?: boolean
  expanded?: boolean
}

let executionSteps: ExecutionStep[] = []
let stepIdCounter = 0

// Tab switching functionality
function switchTab(newTab: 'execution' | 'inspector' | 'history') {
  activeTab = newTab
  
  // Update tab buttons
  const tabs = [executionLogTab, inspectorTab, historyTab]
  const tabNames = ['execution', 'inspector', 'history']
  
  tabs.forEach((tab, index) => {
    if (tabNames[index] === newTab) {
      tab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-blue-500 text-blue-600'
    } else {
      tab.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700'
    }
  })
  
  // Update content visibility
  executionLogContent.classList.toggle('hidden', newTab !== 'execution')
  inspectorContent.classList.toggle('hidden', newTab !== 'inspector')
  historyContent.classList.toggle('hidden', newTab !== 'history')
}

// Wire up tab event listeners
executionLogTab?.addEventListener('click', () => switchTab('execution'))
inspectorTab?.addEventListener('click', () => switchTab('inspector'))
historyTab?.addEventListener('click', () => switchTab('history'))

// Story 12: Validation button event handlers
const runValidationBtn = document.getElementById('runValidationBtn') as HTMLButtonElement
const runSmokeTestsBtn = document.getElementById('runSmokeTestsBtn') as HTMLButtonElement
const runIntegrationTestsBtn = document.getElementById('runIntegrationTestsBtn') as HTMLButtonElement
const validationResults = document.getElementById('validationResults') as HTMLDivElement
const validationSummary = document.getElementById('validationSummary') as HTMLDivElement
const reportsList = document.getElementById('reportsList') as HTMLDivElement

runValidationBtn?.addEventListener('click', async () => {
  runValidationBtn.disabled = true
  runValidationBtn.textContent = 'Running Full Suite...'
  
  try {
    const report = await startValidationSuite()
    displayValidationResults(report)
    updateReportsList()
  } catch (error) {
    console.error('Validation suite failed:', error)
    alert(`Validation suite failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    runValidationBtn.disabled = false
    runValidationBtn.textContent = 'Run Validation Suite'
  }
})

runSmokeTestsBtn?.addEventListener('click', async () => {
  runSmokeTestsBtn.disabled = true
  runSmokeTestsBtn.textContent = 'Running Smoke Tests...'
  
  try {
    const smokeTestIds = sampleTestCases.filter(tc => tc.category === 'smoke').map(tc => tc.id)
    const report = await startValidationSuite(smokeTestIds)
    displayValidationResults(report)
    updateReportsList()
  } catch (error) {
    console.error('Smoke tests failed:', error)
    alert(`Smoke tests failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    runSmokeTestsBtn.disabled = false
    runSmokeTestsBtn.textContent = 'Run Smoke Tests'
  }
})

runIntegrationTestsBtn?.addEventListener('click', async () => {
  runIntegrationTestsBtn.disabled = true
  runIntegrationTestsBtn.textContent = 'Running Integration Tests...'
  
  try {
    const integrationTestIds = sampleTestCases.filter(tc => tc.category === 'integration').map(tc => tc.id)
    const report = await startValidationSuite(integrationTestIds)
    displayValidationResults(report)
    updateReportsList()
  } catch (error) {
    console.error('Integration tests failed:', error)
    alert(`Integration tests failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    runIntegrationTestsBtn.disabled = false
    runIntegrationTestsBtn.textContent = 'Run Integration Tests'
  }
})

function displayValidationResults(report: TestReport): void {
  if (!validationResults || !validationSummary) return
  
  validationResults.classList.remove('hidden')
  
  const successRate = report.summary.successRate.toFixed(1)
  const duration = (report.summary.totalDuration / 1000).toFixed(1)
  const mvpStatus = report.mvpTargets.meets80PercentTarget
  
  validationSummary.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
      <div class="bg-white p-3 rounded border">
        <div class="text-2xl font-bold text-gray-800">${report.summary.totalTests}</div>
        <div class="text-xs text-gray-500">Total Tests</div>
      </div>
      <div class="bg-white p-3 rounded border">
        <div class="text-2xl font-bold text-green-600">${report.summary.passed}</div>
        <div class="text-xs text-gray-500">Passed</div>
      </div>
      <div class="bg-white p-3 rounded border">
        <div class="text-2xl font-bold text-red-600">${report.summary.failed}</div>
        <div class="text-xs text-gray-500">Failed</div>
      </div>
      <div class="bg-white p-3 rounded border">
        <div class="text-2xl font-bold ${mvpStatus ? 'text-green-600' : 'text-red-600'}">${successRate}%</div>
        <div class="text-xs text-gray-500">Success Rate</div>
      </div>
    </div>
    <div class="mt-4 p-3 rounded ${mvpStatus ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
      <div class="flex items-center">
        <span class="text-lg mr-2">${mvpStatus ? '✅' : '❌'}</span>
        <div>
          <div class="font-medium ${mvpStatus ? 'text-green-800' : 'text-red-800'}">
            MVP Target: ${mvpStatus ? 'PASSED' : 'FAILED'}
          </div>
          <div class="text-sm ${mvpStatus ? 'text-green-600' : 'text-red-600'}">
            Target: ≥80% success rate | Actual: ${successRate}% | Duration: ${duration}s
          </div>
        </div>
      </div>
    </div>
  `
}

function updateReportsList(): void {
  if (!reportsList) return
  
  const reports = getStoredReports()
  
  if (reports.length === 0) {
    reportsList.innerHTML = '<p class="text-sm text-gray-500">No test reports available. Run validation suite to generate reports.</p>'
    return
  }
  
  reportsList.innerHTML = reports.map(report => {
    const timestamp = report.generatedAt.toLocaleString()
    const successRate = report.summary.successRate.toFixed(1)
    const statusColor = report.mvpTargets.meets80PercentTarget ? 'text-green-600' : 'text-red-600'
    
    return `
      <div class="border border-gray-200 rounded-lg p-3 bg-white">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-800">${report.testSuite}</div>
            <div class="text-sm text-gray-500">${timestamp}</div>
            <div class="text-sm">
              <span class="${statusColor}">${successRate}% success</span>
              <span class="text-gray-500">• ${report.summary.totalTests} tests • ${(report.summary.totalDuration / 1000).toFixed(1)}s</span>
            </div>
          </div>
          <div class="flex space-x-2">
            <button onclick="downloadReport('${report.id}', 'html')" 
                    class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
              HTML
            </button>
            <button onclick="downloadReport('${report.id}', 'json')" 
                    class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200">
              JSON
            </button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

// Initialize reports list on page load
document.addEventListener('DOMContentLoaded', () => {
  updateReportsList()
})

// Get status icon HTML
function getStatusIcon(status: ExecutionStep['status']): string {
  switch (status) {
    case 'completed':
      return '<svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>'
    case 'failed':
      return '<svg class="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>'
    case 'running':
      return '<svg class="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>'
    case 'pending':
    default:
      return '<svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"></path></svg>'
  }
}

// Toggle step expansion
function toggleStepExpansion(stepId: number) {
  const step = executionSteps.find(s => s.id === stepId)
  if (step) {
    step.expanded = !step.expanded
    renderExecutionSteps()
  }
}

// Render execution steps
function renderExecutionSteps() {
  // Check if required elements exist
  if (!executionStepsList || !noExecutionMessage) {
    console.error('executionStepsList or noExecutionMessage elements not found')
    return
  }
  
  if (executionSteps.length === 0) {
    noExecutionMessage.classList.remove('hidden')
    executionStepsList.innerHTML = ''
    return
  }
  
  noExecutionMessage.classList.add('hidden')
  
  try {
    executionStepsList.innerHTML = executionSteps.map(step => `
      <div class="border border-gray-200 rounded-lg">
        <div 
          class="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
          onclick="toggleStepExpansion(${step.id})"
        >
          <div class="flex items-center space-x-3">
            ${getStatusIcon(step.status)}
            <div>
              <div class="text-sm font-medium">${step.description}</div>
              <div class="text-xs text-gray-500 flex space-x-2">
                ${step.timestamp ? `<span>${step.timestamp}</span>` : ''}
                ${step.duration ? `<span>(${step.duration})</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            ${step.screenshot ? '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>' : ''}
            ${step.expanded ? 
              '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>' :
              '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>'
            }
          </div>
        </div>
        
        ${step.expanded ? `
          <div class="px-3 pb-3 border-t border-gray-100 bg-gray-50">
            <div class="pt-3 space-y-2">
              <div class="text-xs">
                <strong>Action:</strong> <code class="bg-gray-200 px-1 rounded">${step.action}</code>
              </div>
              ${step.screenshot ? `
                <div class="text-xs">
                  <strong>Screenshot:</strong> 
                  <button class="ml-2 text-blue-600 hover:text-blue-800">View</button>
                </div>
              ` : ''}
              <div class="text-xs">
                <strong>Page Source:</strong> 
                <button class="ml-2 text-blue-600 hover:text-blue-800">View XML</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `).join('')
  } catch (error) {
    console.error('Error rendering execution steps:', error)
    executionStepsList.innerHTML = '<div class="text-red-500 p-2">Error rendering steps</div>'
  }
}

// Make toggleStepExpansion available globally
;(window as any).toggleStepExpansion = toggleStepExpansion

// Story 6: Enhanced Plan Generation with AI-like Intelligence
// Story 8: AI Context Collection & UI Analysis
interface UIElement {
  id: string
  type: string
  text?: string
  contentDesc?: string
  resourceId?: string
  className?: string
  bounds?: { x: number; y: number; width: number; height: number }
  visible: boolean
  enabled: boolean
  clickable: boolean
  priority: number
  selectors: ElementSelector[]
  pinned?: boolean // Story 9: Pin/unpin functionality
  preferredSelector?: ElementSelector // Story 9: Preferred selector
}

interface ElementSelector {
  type: 'id' | 'text' | 'xpath' | 'accessibility' | 'className'
  value: string
  confidence: number
}

interface UIContext {
  timestamp: string
  screenshot: string // base64 or URL
  pageSource: string // XML source
  elements: UIElement[]
  appPackage: string
  currentActivity: string
  deviceInfo: {
    width: number
    height: number
    density: number
  }
}

interface ContextPayload {
  context: UIContext
  trimmedElements: UIElement[]
  payloadSize: number
  maxElements: number
}

// Story 9: Pin/Unpin Management
interface PinnedElement {
  elementId: string
  preferredSelector: ElementSelector
  pinnedAt: string
  usageCount: number
  lastUsed?: string
}

// Context collection state
let currentUIContext: UIContext | null = null
let contextCollectionEnabled = true
const MAX_CONTEXT_ELEMENTS = 15
const MAX_PAYLOAD_SIZE = 50000 // 50KB limit

// Story 9: Pinned elements state
let pinnedElements: PinnedElement[] = []
let highlightedElementId: string | null = null

// Mock UI elements for demonstration
const mockUIElements: UIElement[] = [
  {
    id: "search_bar",
    type: "EditText",
    text: "",
    contentDesc: "Search for food and restaurants",
    resourceId: "com.swiggy.android:id/search_edittext",
    className: "android.widget.EditText",
    bounds: { x: 20, y: 150, width: 320, height: 48 },
    visible: true,
    enabled: true,
    clickable: true,
    priority: 10,
    selectors: [
      { type: 'id', value: 'com.swiggy.android:id/search_edittext', confidence: 0.95 },
      { type: 'accessibility', value: 'Search for food and restaurants', confidence: 0.90 },
      { type: 'className', value: 'EditText', confidence: 0.75 },
      { type: 'xpath', value: '//android.widget.EditText[@resource-id="com.swiggy.android:id/search_edittext"]', confidence: 0.85 }
    ]
  },
  {
    id: "location_button",
    type: "TextView", 
    text: "Current Location",
    contentDesc: "Select delivery location",
    resourceId: "com.swiggy.android:id/location_text",
    className: "android.widget.TextView",
    bounds: { x: 20, y: 80, width: 200, height: 32 },
    visible: true,
    enabled: true,
    clickable: true,
    priority: 8,
    selectors: [
      { type: 'text', value: 'Current Location', confidence: 0.92 },
      { type: 'id', value: 'com.swiggy.android:id/location_text', confidence: 0.88 },
      { type: 'accessibility', value: 'Select delivery location', confidence: 0.85 }
    ]
  },
  {
    id: "menu_button",
    type: "ImageButton",
    contentDesc: "Open navigation menu",
    resourceId: "com.swiggy.android:id/menu_button",
    className: "android.widget.ImageButton",
    bounds: { x: 10, y: 40, width: 40, height: 40 },
    visible: true,
    enabled: true,
    clickable: true,
    priority: 6,
    selectors: [
      { type: 'accessibility', value: 'Open navigation menu', confidence: 0.95 },
      { type: 'id', value: 'com.swiggy.android:id/menu_button', confidence: 0.90 },
      { type: 'className', value: 'ImageButton', confidence: 0.70 }
    ]
  },
  {
    id: "cart_button",
    type: "FrameLayout",
    text: "Cart",
    contentDesc: "Shopping cart",
    resourceId: "com.swiggy.android:id/cart_container",
    className: "android.widget.FrameLayout",
    bounds: { x: 300, y: 40, width: 60, height: 40 },
    visible: true,
    enabled: true,
    clickable: true,
    priority: 7,
    selectors: [
      { type: 'text', value: 'Cart', confidence: 0.90 },
      { type: 'accessibility', value: 'Shopping cart', confidence: 0.88 },
      { type: 'id', value: 'com.swiggy.android:id/cart_container', confidence: 0.85 }
    ]
  },
  {
    id: "restaurant_card_1",
    type: "LinearLayout",
    text: "McDonald's",
    resourceId: "com.swiggy.android:id/restaurant_card",
    className: "android.widget.LinearLayout",
    bounds: { x: 20, y: 220, width: 320, height: 120 },
    visible: true,
    enabled: true,
    clickable: true,
    priority: 9,
    selectors: [
      { type: 'text', value: "McDonald's", confidence: 0.95 },
      { type: 'id', value: 'com.swiggy.android:id/restaurant_card', confidence: 0.80 },
      { type: 'xpath', value: '//android.widget.LinearLayout[contains(@text, "McDonald\'s")]', confidence: 0.85 }
    ]
  }
]

// Story 8: Context Collection Functions
function captureUIContext(): UIContext {
  console.log('Capturing UI context...')
  
  const context: UIContext = {
    timestamp: new Date().toISOString(),
    screenshot: generateMockScreenshot(),
    pageSource: generateMockPageSource(),
    elements: mockUIElements,
    appPackage: "com.swiggy.android",
    currentActivity: "com.swiggy.android.activities.HomeActivity",
    deviceInfo: {
      width: 360,
      height: 640,
      density: 2.0
    }
  }
  
  currentUIContext = context
  return context
}

function generateMockScreenshot(): string {
  // In real implementation, this would be base64 screenshot data
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
}

function generateMockPageSource(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <android.widget.FrameLayout resource-id="android:id/content">
    <android.widget.LinearLayout>
      <android.widget.EditText resource-id="com.swiggy.android:id/search_edittext" 
                               content-desc="Search for food and restaurants" 
                               bounds="[20,150][340,198]" 
                               clickable="true" enabled="true" />
      <android.widget.TextView resource-id="com.swiggy.android:id/location_text" 
                              text="Current Location" 
                              bounds="[20,80][220,112]" 
                              clickable="true" />
      <android.widget.LinearLayout resource-id="com.swiggy.android:id/restaurant_card" 
                                   bounds="[20,220][340,340]" 
                                   clickable="true">
        <android.widget.TextView text="McDonald's" />
      </android.widget.LinearLayout>
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>`
}

function prioritizeElements(elements: UIElement[]): UIElement[] {
  console.log(`Prioritizing ${elements.length} elements...`)
  
  // Sort by priority (higher priority first) and other factors
  return elements
    .filter(el => el.visible && el.enabled) // Only visible and enabled elements
    .sort((a, b) => {
      // Primary sort: priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      
      // Secondary sort: clickable elements first
      if (a.clickable !== b.clickable) {
        return a.clickable ? -1 : 1
      }
      
      // Tertiary sort: elements with text/content-desc first
      const aHasText = !!(a.text || a.contentDesc)
      const bHasText = !!(b.text || b.contentDesc)
      if (aHasText !== bHasText) {
        return aHasText ? -1 : 1
      }
      
      return 0
    })
    .slice(0, MAX_CONTEXT_ELEMENTS) // Limit to max elements
}

function generateMultiSelectors(element: UIElement): ElementSelector[] {
  console.log(`Generating selectors for element: ${element.id}`)
  
  const selectors: ElementSelector[] = []
  
  // ID selector (highest confidence if available)
  if (element.resourceId) {
    selectors.push({
      type: 'id',
      value: element.resourceId,
      confidence: element.resourceId.includes('android:id') ? 0.85 : 0.95
    })
  }
  
  // Text selector
  if (element.text && element.text.trim()) {
    selectors.push({
      type: 'text',
      value: element.text.trim(),
      confidence: 0.90
    })
  }
  
  // Accessibility selector
  if (element.contentDesc) {
    selectors.push({
      type: 'accessibility',
      value: element.contentDesc,
      confidence: 0.88
    })
  }
  
  // XPath selector
  if (element.resourceId || element.text) {
    let xpath = `//${element.className || '*'}`
    if (element.resourceId) {
      xpath += `[@resource-id="${element.resourceId}"]`
    }
    if (element.text) {
      xpath += `[contains(@text, "${element.text}")]`
    }
    
    selectors.push({
      type: 'xpath',
      value: xpath,
      confidence: 0.82
    })
  }
  
  // ClassName selector (lowest confidence)
  if (element.className) {
    selectors.push({
      type: 'className',
      value: element.className.split('.').pop() || element.className,
      confidence: 0.70
    })
  }
  
  // Sort by confidence (highest first)
  return selectors.sort((a, b) => b.confidence - a.confidence)
}

function trimContextForAI(context: UIContext): ContextPayload {
  console.log('Trimming context for AI consumption...')
  
  // Prioritize elements
  const prioritizedElements = prioritizeElements(context.elements)
  
  // Generate selectors for each element
  const elementsWithSelectors = prioritizedElements.map(element => ({
    ...element,
    selectors: generateMultiSelectors(element)
  }))
  
  // Calculate payload size (approximate)
  const payload = {
    context: {
      ...context,
      elements: elementsWithSelectors
    },
    trimmedElements: elementsWithSelectors,
    payloadSize: 0,
    maxElements: MAX_CONTEXT_ELEMENTS
  }
  
  // Estimate payload size
  const payloadJSON = JSON.stringify(payload)
  payload.payloadSize = payloadJSON.length
  
  console.log(`Context trimmed: ${elementsWithSelectors.length} elements, ~${payload.payloadSize} bytes`)
  
  // If still too large, remove screenshot data
  if (payload.payloadSize > MAX_PAYLOAD_SIZE) {
    payload.context.screenshot = "[Screenshot data omitted - size limit]"
    payload.payloadSize = JSON.stringify(payload).length
    console.log(`Size reduced to: ${payload.payloadSize} bytes`)
  }
  
  return payload
}

function collectContextForStep(stepDescription: string): ContextPayload {
  console.log(`Collecting context for step: ${stepDescription}`)
  
  if (!contextCollectionEnabled) {
    console.log('Context collection disabled')
    return {
      context: {} as UIContext,
      trimmedElements: [],
      payloadSize: 0,
      maxElements: 0
    }
  }
  
  // Capture current UI context
  const context = captureUIContext()
  
  // Trim and optimize for AI
  const payload = trimContextForAI(context)
  
  return payload
}

// Story 9: Pin/Unpin and Element Management Functions
function pinElement(elementId: string, preferredSelectorIndex: number = 0) {
  console.log(`Pinning element: ${elementId}`)
  
  if (!currentUIContext) {
    console.error('No UI context available for pinning')
    return
  }
  
  const element = currentUIContext.elements.find(el => el.id === elementId)
  if (!element) {
    console.error(`Element ${elementId} not found`)
    return
  }
  
  // Remove if already pinned
  pinnedElements = pinnedElements.filter(pe => pe.elementId !== elementId)
  
  // Add to pinned elements
  const preferredSelector = element.selectors[preferredSelectorIndex] || element.selectors[0]
  const pinnedElement: PinnedElement = {
    elementId,
    preferredSelector,
    pinnedAt: new Date().toISOString(),
    usageCount: 0
  }
  
  pinnedElements.push(pinnedElement)
  
  // Update element in context
  element.pinned = true
  element.preferredSelector = preferredSelector
  
  console.log(`Element pinned: ${elementId} using ${preferredSelector.type} selector`)
  
  // Refresh inspector display
  if (currentUIContext) {
    const payload = trimContextForAI(currentUIContext)
    updateInspectorContent(payload)
  }
}

function unpinElement(elementId: string) {
  console.log(`Unpinning element: ${elementId}`)
  
  // Remove from pinned elements
  pinnedElements = pinnedElements.filter(pe => pe.elementId !== elementId)
  
  // Update element in context
  if (currentUIContext) {
    const element = currentUIContext.elements.find(el => el.id === elementId)
    if (element) {
      element.pinned = false
      element.preferredSelector = undefined
    }
  }
  
  console.log(`Element unpinned: ${elementId}`)
  
  // Refresh inspector display
  if (currentUIContext) {
    const payload = trimContextForAI(currentUIContext)
    updateInspectorContent(payload)
  }
}

function highlightElement(elementId: string) {
  console.log(`Highlighting element: ${elementId}`)
  
  if (!currentUIContext) {
    console.error('No UI context available for highlighting')
    return
  }
  
  const element = currentUIContext.elements.find(el => el.id === elementId)
  if (!element || !element.bounds) {
    console.error(`Element ${elementId} not found or has no bounds`)
    return
  }
  
  highlightedElementId = elementId
  
  // Update emulator display with highlight
  updateEmulatorWithHighlight(element.bounds)
  
  // Auto-remove highlight after 3 seconds
  setTimeout(() => {
    if (highlightedElementId === elementId) {
      clearElementHighlight()
    }
  }, 3000)
}

function clearElementHighlight() {
  highlightedElementId = null
  updateEmulatorDisplay() // Reset to normal display
}

function updateEmulatorWithHighlight(bounds: { x: number; y: number; width: number; height: number }) {
  const emulatorContainer = document.querySelector('.relative.bg-gray-800') as HTMLElement
  if (!emulatorContainer) return
  
  // Remove existing highlight
  const existingHighlight = emulatorContainer.querySelector('.element-highlight')
  if (existingHighlight) {
    existingHighlight.remove()
  }
  
  // Create highlight overlay
  const highlight = document.createElement('div')
  highlight.className = 'element-highlight absolute border-2 border-red-500 bg-red-200 bg-opacity-30 pointer-events-none'
  highlight.style.cssText = `
    left: ${bounds.x}px;
    top: ${bounds.y}px;
    width: ${bounds.width}px;
    height: ${bounds.height}px;
    z-index: 10;
    border-radius: 2px;
  `
  
  // Add to emulator
  const emulatorScreen = emulatorContainer.querySelector('.w-full.h-full.bg-white')
  if (emulatorScreen) {
    emulatorScreen.appendChild(highlight)
  }
}

function getPinnedElementsForPlanning(): PinnedElement[] {
  return pinnedElements.filter(pe => {
    // Update usage count when used in planning
    pe.usageCount++
    pe.lastUsed = new Date().toISOString()
    return true
  })
}

function applyPinnedSelectorsToStep(stepDescription: string): string {
  let enhancedDescription = stepDescription
  
  // Check if step mentions any pinned elements
  pinnedElements.forEach(pe => {
    const element = currentUIContext?.elements.find(el => el.id === pe.elementId)
    if (element) {
      // If step mentions element text or description, enhance with preferred selector
      if (element.text && enhancedDescription.toLowerCase().includes(element.text.toLowerCase())) {
        enhancedDescription += ` [Using pinned selector: ${pe.preferredSelector.type}="${pe.preferredSelector.value}"]`
      } else if (element.contentDesc && enhancedDescription.toLowerCase().includes(element.contentDesc.toLowerCase())) {
        enhancedDescription += ` [Using pinned selector: ${pe.preferredSelector.type}="${pe.preferredSelector.value}"]`
      }
    }
  })
  
  return enhancedDescription
}

// Story 11: Appium Integration Functions
async function connectToAppium(): Promise<boolean> {
  console.log('Attempting to connect to Appium server...')
  
  try {
    let response
    if (useRealAppium) {
      // Story 14: Use Real Appium Client
      console.log('🚀 Using Real Appium Connection')
      response = await realAppiumClient.connect(realDeviceCapabilities)
    } else {
      // Fallback to mock for compatibility
      console.log('🎭 Using Mock Appium Connection')
      response = await mockAppiumConnection()
    }
    
    if (response.success) {
      appiumConnection.sessionId = response.sessionId || null
      appiumConnection.isConnected = true
      appiumConnection.lastPing = new Date()
      appiumConnection.retryCount = 0
      
      if (useRealAppium) {
        // Get real device info
        const deviceInfo = await realAppiumClient.getDeviceInfo()
        console.log('📱 Connected to real device:', deviceInfo)
        console.log(`✅ Real Appium Connected - Session ID: ${response.sessionId}`)
        
        // Start real screenshot streaming
        startRealScreenshotStream()
      } else {
        console.log(`✅ Mock Appium Connected - Session ID: ${response.sessionId}`)
        // Start mock screenshot streaming
        startScreenshotStream()
      }
      
      updateDeviceConnectionStatus(true)
      return true
    } else {
      throw new Error(response.error || 'Connection failed')
    }
  } catch (error) {
    console.error('Appium connection failed:', error)
    appiumConnection.retryCount++
    updateDeviceConnectionStatus(false)
    
    // Retry logic with exponential backoff
    if (appiumConnection.retryCount < 3) {
      const retryDelay = Math.pow(2, appiumConnection.retryCount) * 1000
      console.log(`Retrying connection in ${retryDelay}ms (attempt ${appiumConnection.retryCount}/3)`)
      
      setTimeout(() => {
        connectToAppium()
      }, retryDelay)
    }
    
    return false
  }
}

async function disconnectFromAppium(): Promise<void> {
  console.log('Disconnecting from Appium...')
  
  // Stop screenshot streaming
  stopScreenshotStream()
  
  if (appiumConnection.sessionId) {
    try {
      await mockAppiumDisconnection(appiumConnection.sessionId)
      console.log('Appium session closed successfully')
    } catch (error) {
      console.error('Error closing Appium session:', error)
    }
  }
  
  appiumConnection.sessionId = null
  appiumConnection.isConnected = false
  appiumConnection.lastPing = null
  appiumConnection.retryCount = 0
  
  updateDeviceConnectionStatus(false)
}

async function executeDeviceAction(action: DeviceAction): Promise<ActionResult> {
  console.log(`Executing device action: ${action.type}`, action)
  
  if (!appiumConnection.isConnected) {
    throw new Error('Not connected to Appium server')
  }
  
  const startTime = Date.now()
  const maxRetries = action.retries || 3
  let lastError: string = ''
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Add pre-action UI state validation
      if (action.type !== 'screenshot' && action.type !== 'source') {
        await validateUIState()
      }
      
      let result
      if (useRealAppium) {
        // Story 14: Use Real Appium Client
        console.log('🚀 Executing real device action')
        const realResult = await realAppiumClient.executeAction(action)
        result = {
          success: realResult.success,
          screenshot: realResult.result?.screenshot,
          pageSource: await realAppiumClient.getPageSource().catch(() => ''),
          error: realResult.error
        }
      } else {
        // Fallback to mock action
        console.log('🎭 Executing mock device action')
        result = await performAction(action, attempt)
      }
      
      // Add post-action UI state validation
      if (result.success && action.type !== 'screenshot' && action.type !== 'source') {
        await validateUIState()
      }
      
      return {
        success: result.success,
        screenshot: result.screenshot,
        pageSource: result.pageSource,
        duration: Date.now() - startTime,
        retryCount: attempt,
        errorMessage: result.errorMessage
      }
      
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`Action attempt ${attempt + 1}/${maxRetries} failed:`, lastError)
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff between retries
        const backoffMs = Math.pow(2, attempt) * 500
        console.log(`Waiting ${backoffMs}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
  }
  
  return {
    success: false,
    errorMessage: `Action failed after ${maxRetries} attempts. Last error: ${lastError}`,
    duration: Date.now() - startTime,
    retryCount: maxRetries
  }
}

async function performAction(action: DeviceAction, attempt: number): Promise<ActionResult> {
  // Mock implementation for MVP - replace with real Appium calls
  console.log(`Performing ${action.type} action (attempt ${attempt + 1})`)
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200))
  
  // Simulate occasional failures for testing retry logic
  if (Math.random() < 0.1 && attempt === 0) {
    throw new Error('Simulated network timeout')
  }
  
  switch (action.type) {
    case 'tap':
      if (action.coordinates) {
        console.log(`Tapping at coordinates (${action.coordinates.x}, ${action.coordinates.y})`)
      } else if (action.selector) {
        console.log(`Tapping element with selector: ${action.selector}`)
      }
      return { success: true, duration: 0, retryCount: 0 }
      
    case 'type':
      console.log(`Typing text: "${action.text}" into element: ${action.selector}`)
      return { success: true, duration: 0, retryCount: 0 }
      
    case 'swipe':
      console.log(`Swiping on element: ${action.selector}`)
      return { success: true, duration: 0, retryCount: 0 }
      
    case 'screenshot':
      const screenshot = await captureScreenshot()
      return { success: true, screenshot, duration: 0, retryCount: 0 }
      
    case 'source':
      const pageSource = await capturePageSource()
      return { success: true, pageSource, duration: 0, retryCount: 0 }
      
    case 'wait':
      const waitMs = action.timeout || 1000
      console.log(`Waiting ${waitMs}ms`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      return { success: true, duration: 0, retryCount: 0 }
      
    default:
      throw new Error(`Unknown action type: ${action.type}`)
  }
}

async function validateUIState(): Promise<boolean> {
  // Pre/post action UI state validation
  try {
    const result = await performAction({ type: 'source' }, 0)
    if (result.pageSource) {
      // Basic validation - check if page source is not empty and contains UI elements
      const hasUIElements = result.pageSource.includes('<android.widget.') || 
                           result.pageSource.includes('<android.view.')
      return hasUIElements
    }
    return false
  } catch (error) {
    console.warn('UI state validation failed:', error)
    return false
  }
}

// Story 14: Real screenshot streaming function
function startRealScreenshotStream(): void {
  console.log('📸 Starting real screenshot stream...')
  
  if (screenshotStream.interval) {
    clearInterval(screenshotStream.interval)
  }
  
  screenshotStream.interval = setInterval(async () => {
    if (!realAppiumClient.getConnectionStatus().isConnected) {
      console.log('⚠️ Device disconnected, stopping screenshot stream')
      stopScreenshotStream()
      return
    }
    
    try {
      const screenshot = await realAppiumClient.takeScreenshot()
      updateEmulatorScreenshot(screenshot)
      screenshotStream.lastScreenshot = new Date()
    } catch (error) {
      console.error('❌ Real screenshot capture failed:', error)
    }
  }, screenshotStream.throttleMs)
  
  console.log('✅ Real screenshot stream started')
}

// Story 11: Mock screenshot streaming (fallback)
function startScreenshotStream(): void {
  if (screenshotStream.interval) {
    clearInterval(screenshotStream.interval)
  }
  
  console.log(`Starting screenshot stream (every ${screenshotStream.throttleMs}ms)`)
  
  screenshotStream.interval = setInterval(async () => {
    try {
      if (appiumConnection.isConnected) {
        const result = await executeDeviceAction({ type: 'screenshot' })
        if (result.success && result.screenshot) {
          updateEmulatorScreenshot(result.screenshot)
          screenshotStream.lastScreenshot = new Date()
        }
      }
    } catch (error) {
      console.warn('Screenshot capture failed:', error)
    }
  }, screenshotStream.throttleMs)
}

function stopScreenshotStream(): void {
  if (screenshotStream.interval) {
    clearInterval(screenshotStream.interval)
    screenshotStream.interval = null
  }
  console.log('Screenshot stream stopped')
}

async function installAndLaunchApp(apkPath: string, resetPolicy: 'noReset' | 'fullReset' = 'noReset'): Promise<boolean> {
  console.log(`Installing and launching app: ${apkPath} with policy: ${resetPolicy}`)
  
  try {
    // Update capabilities based on reset policy
    appiumConnection.capabilities.noReset = resetPolicy === 'noReset'
    appiumConnection.capabilities.fullReset = resetPolicy === 'fullReset'
    
    // Mock app installation and launch
    const installResult = await mockAppInstallation(apkPath, resetPolicy)
    
    if (installResult.success) {
      // Extract app package and activity from APK (mocked)
      appiumConnection.capabilities.appPackage = installResult.appPackage
      appiumConnection.capabilities.appActivity = installResult.appActivity
      
      console.log(`App launched successfully - Package: ${installResult.appPackage}`)
      return true
    } else {
      throw new Error(installResult.error || 'App installation failed')
    }
  } catch (error) {
    console.error('App installation/launch failed:', error)
    return false
  }
}

// Story 11: Mock Appium API Functions (replace with real Appium client)
async function mockAppiumConnection(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  // Simulate connection attempt
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  // 90% success rate for testing
  if (Math.random() < 0.9) {
    return {
      success: true,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  } else {
    return {
      success: false,
      error: 'Appium server not reachable on http://localhost:4723'
    }
  }
}

async function mockAppiumDisconnection(sessionId: string): Promise<void> {
  console.log(`Closing Appium session: ${sessionId}`)
  await new Promise(resolve => setTimeout(resolve, 500))
}

async function mockAppInstallation(apkPath: string, resetPolicy: string): Promise<{ 
  success: boolean; 
  appPackage?: string; 
  appActivity?: string; 
  error?: string 
}> {
  console.log(`Mock installing APK: ${apkPath} with ${resetPolicy}`)
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  // Extract filename for mock package name
  const filename = apkPath.split(/[\\/]/).pop() || 'unknown.apk'
  const packageName = `com.example.${filename.replace('.apk', '').toLowerCase()}`
  
  return {
    success: true,
    appPackage: packageName,
    appActivity: `${packageName}.MainActivity`
  }
}

async function captureScreenshot(): Promise<string> {
  // Mock screenshot as base64 data
  await new Promise(resolve => setTimeout(resolve, 200))
  
  // Return mock screenshot data (in real implementation, this would be from Appium)
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
}

async function capturePageSource(): Promise<string> {
  // Mock page source XML
  await new Promise(resolve => setTimeout(resolve, 300))
  
  return `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <android.widget.FrameLayout resource-id="android:id/content">
    <android.widget.LinearLayout orientation="vertical">
      <android.widget.TextView text="Sample App" clickable="false" />
      <android.widget.EditText resource-id="com.example:id/search_input" text="" hint="Search..." clickable="true" />
      <android.widget.Button resource-id="com.example:id/search_button" text="Search" clickable="true" />
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>`
}

function updateDeviceConnectionStatus(connected: boolean): void {
  // Update UI to show connection status
  const statusBar = document.querySelector('.bg-gray-200') as HTMLElement
  if (statusBar) {
    const connectionIndicator = statusBar.querySelector('.connection-status') || document.createElement('span')
    connectionIndicator.className = 'connection-status text-xs'
    
    if (connected) {
      connectionIndicator.innerHTML = `<span class="text-green-600">● Connected</span>`
    } else {
      connectionIndicator.innerHTML = `<span class="text-red-600">● Disconnected</span>`
    }
    
    if (!statusBar.querySelector('.connection-status')) {
      statusBar.appendChild(connectionIndicator)
    }
  }
}

function updateEmulatorScreenshot(screenshotData: string): void {
  const emulatorScreen = document.querySelector('.w-full.h-full.bg-white') as HTMLElement
  if (emulatorScreen && screenshotData !== emulatorScreen.dataset.lastScreenshot) {
    // Update emulator with real screenshot
    emulatorScreen.style.backgroundImage = `url(${screenshotData})`
    emulatorScreen.style.backgroundSize = 'contain'
    emulatorScreen.style.backgroundRepeat = 'no-repeat'
    emulatorScreen.style.backgroundPosition = 'center'
    emulatorScreen.dataset.lastScreenshot = screenshotData
    
    console.log('Emulator screenshot updated')
  }
}

// Story 11: Convert execution step to device action
function convertStepToDeviceAction(step: ExecutionStep): DeviceAction {
  const description = step.description.toLowerCase()
  const action = step.action.toLowerCase()
  
  // Extract selectors from pinned elements if available
  let selector = extractSelectorFromStep(step)
  
  if (action.includes('tap') || action.includes('click')) {
    return {
      type: 'tap',
      selector: selector || `[text="${extractTextFromDescription(description)}"]`,
      timeout: 5000,
      retries: 3
    }
  } else if (action.includes('type') || action.includes('input')) {
    const text = extractTextFromDescription(description)
    return {
      type: 'type',
      selector: selector || 'android.widget.EditText',
      text: text,
      timeout: 5000,
      retries: 3
    }
  } else if (action.includes('swipe') || action.includes('scroll')) {
    return {
      type: 'swipe',
      selector: selector || 'android.widget.ScrollView',
      timeout: 3000,
      retries: 2
    }
  } else if (action.includes('wait')) {
    return {
      type: 'wait',
      timeout: 2000
    }
  } else {
    // Default to taking screenshot for observation
    return {
      type: 'screenshot',
      timeout: 3000,
      retries: 1
    }
  }
}

function extractSelectorFromStep(step: ExecutionStep): string | undefined {
  // Check if step description mentions pinned selectors
  const pinnedMatch = step.description.match(/\[Using pinned selector: (\w+)="([^"]+)"\]/)
  if (pinnedMatch) {
    const [, selectorType, selectorValue] = pinnedMatch
    return formatSelector(selectorType, selectorValue)
  }
  
  // Look for element references in description
  if (step.description.includes('search') || step.description.includes('input')) {
    return 'android.widget.EditText'
  } else if (step.description.includes('button')) {
    return 'android.widget.Button'
  }
  
  return undefined
}

function extractTextFromDescription(description: string): string {
  // Extract quoted text from description
  const quotedMatch = description.match(/"([^"]+)"/)
  if (quotedMatch) {
    return quotedMatch[1]
  }
  
  // Extract text after "type" or "search"
  const typeMatch = description.match(/type\s+(.+)|search\s+(.+)/)
  if (typeMatch) {
    return typeMatch[1] || typeMatch[2] || ''
  }
  
  return ''
}

function formatSelector(selectorType: string, selectorValue: string): string {
  switch (selectorType.toLowerCase()) {
    case 'id':
    case 'resourceid':
      return `[resource-id="${selectorValue}"]`
    case 'text':
      return `[text="${selectorValue}"]`
    case 'xpath':
      return selectorValue
    case 'accessibility':
    case 'contentdesc':
      return `[content-desc="${selectorValue}"]`
    case 'classname':
      return selectorValue
    default:
      return `[text="${selectorValue}"]`
  }
}

// Story 12: End-to-End Validation Functions
async function startValidationSuite(testCaseIds?: string[]): Promise<TestReport> {
  console.log('Starting validation suite...')
  validationMode = true
  
  const testCasesToRun = testCaseIds 
    ? sampleTestCases.filter(tc => testCaseIds.includes(tc.id))
    : sampleTestCases
  
  const report: TestReport = {
    id: `report_${Date.now()}`,
    generatedAt: new Date(),
    testSuite: 'AI-QA Agent MVP Validation',
    summary: {
      totalTests: testCasesToRun.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      successRate: 0,
      totalDuration: 0
    },
    executions: [],
    performance: {
      avgStepDuration: 0,
      avgReplanningTime: 0,
      screenshotCaptureAvg: 0
    },
    mvpTargets: {
      successRateTarget: 80,
      successRateActual: 0,
      meets80PercentTarget: false
    }
  }
  
  const suiteStartTime = Date.now()
  
  for (const testCase of testCasesToRun) {
    console.log(`Running test case: ${testCase.name}`)
    const execution = await executeTestCase(testCase)
    report.executions.push(execution)
    
    if (execution.status === 'passed') {
      report.summary.passed++
    } else if (execution.status === 'failed') {
      report.summary.failed++
    } else {
      report.summary.skipped++
    }
  }
  
  report.summary.totalDuration = Date.now() - suiteStartTime
  report.summary.successRate = (report.summary.passed / report.summary.totalTests) * 100
  report.mvpTargets.successRateActual = report.summary.successRate
  report.mvpTargets.meets80PercentTarget = report.summary.successRate >= 80
  
  // Calculate performance metrics
  const allStepDurations = report.executions.flatMap(e => 
    e.steps.map(s => s.duration || 0)
  )
  report.performance.avgStepDuration = allStepDurations.length > 0 
    ? allStepDurations.reduce((a, b) => a + b) / allStepDurations.length 
    : 0
  
  const allReplanningTimes = report.executions.flatMap(e => 
    e.performance.replanningCount > 0 ? [2000] : [] // Average replanning time
  )
  report.performance.avgReplanningTime = allReplanningTimes.length > 0
    ? allReplanningTimes.reduce((a, b) => a + b) / allReplanningTimes.length
    : 0
  
  const allScreenshotTimes = report.executions.flatMap(e => e.performance.screenshotCaptureTimes)
  report.performance.screenshotCaptureAvg = allScreenshotTimes.length > 0
    ? allScreenshotTimes.reduce((a, b) => a + b) / allScreenshotTimes.length
    : 0
  
  // Save report
  saveTestReport(report)
  
  console.log(`Validation suite completed. Success rate: ${report.summary.successRate.toFixed(1)}%`)
  validationMode = false
  
  return report
}

async function executeTestCase(testCase: TestCase): Promise<TestExecution> {
  const execution: TestExecution = {
    id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    testCase,
    startTime: new Date(),
    status: 'running',
    steps: [],
    screenshots: [],
    errors: [],
    performance: {
      totalDuration: 0,
      stepAverageDuration: 0,
      successRate: 0,
      screenshotCaptureTimes: [],
      replanningCount: 0,
      appiumActionTimes: []
    }
  }
  
  currentTestExecution = execution
  testExecutions.push(execution)
  
  const startTime = Date.now()
  let stepNumber = 0
  
  try {
    for (const command of testCase.commands) {
      stepNumber++
      const stepStartTime = Date.now()
      
      const step: TestStep = {
        stepNumber,
        description: command,
        action: command.split(' ')[0], // Extract action verb
        status: 'running'
      }
      execution.steps.push(step)
      
      // Execute command using existing plan generation and execution
      await executeValidationCommand(command, execution)
      
      const stepDuration = Date.now() - stepStartTime
      step.duration = stepDuration
      step.status = 'passed' // Assume passed if no error thrown
      
      // Capture screenshot after each step
      if (appiumConnection.isConnected) {
        const screenshotStartTime = Date.now()
        const result = await executeDeviceAction({ type: 'screenshot' })
        const screenshotDuration = Date.now() - screenshotStartTime
        
        execution.performance.screenshotCaptureTimes.push(screenshotDuration)
        
        if (result.success && result.screenshot) {
          step.screenshot = result.screenshot
          execution.screenshots.push(result.screenshot)
        }
      }
      
      // Brief pause between steps
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    execution.status = 'passed'
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    execution.errors.push(errorMessage)
    execution.status = 'failed'
    
    // Mark current step as failed
    if (execution.steps.length > 0) {
      execution.steps[execution.steps.length - 1].status = 'failed'
      execution.steps[execution.steps.length - 1].error = errorMessage
    }
    
    console.error(`Test case ${testCase.id} failed:`, errorMessage)
  } finally {
    execution.endTime = new Date()
    execution.duration = Date.now() - startTime
    
    // Calculate performance metrics
    const stepDurations = execution.steps.map(s => s.duration || 0)
    execution.performance.totalDuration = execution.duration
    execution.performance.stepAverageDuration = stepDurations.length > 0
      ? stepDurations.reduce((a, b) => a + b) / stepDurations.length
      : 0
    execution.performance.successRate = (execution.steps.filter(s => s.status === 'passed').length / execution.steps.length) * 100
    
    currentTestExecution = null
  }
  
  return execution
}

async function executeValidationCommand(command: string, execution: TestExecution): Promise<void> {
  console.log(`Executing validation command: ${command}`)
  
  // Update command input to trigger plan generation
  if (commandInput) {
    commandInput.value = command
    
    // Trigger plan generation
    generatePlan(command)
    
    // Wait for plan generation to complete
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Start execution if connected to device
    if (appiumConnection.isConnected && executionStatus === 'idle') {
      const actionStartTime = Date.now()
      
      // Reset execution state
      currentStep = 0
      executionStatus = 'running'
      isExecuting = true
      
      // Execute plan steps
      while (currentStep < executionSteps.length && executionStatus === 'running') {
        await executeNextStepForValidation()
        
        const actionDuration = Date.now() - actionStartTime
        execution.performance.appiumActionTimes.push(actionDuration)
        
        // Check for replanning
        if (isReplanning) {
          execution.performance.replanningCount++
          // Wait for replanning to complete
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
        
        // Brief pause between steps
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      
      // Wait for execution to complete
      let waitTime = 0
      while (executionStatus === 'running' && waitTime < 30000) { // 30 second timeout
        await new Promise(resolve => setTimeout(resolve, 500))
        waitTime += 500
      }
      
      if (executionStatus === 'failed') {
        throw new Error('Execution failed during validation')
      }
    } else {
      // Simulate execution for non-connected mode
      await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000))
    }
  }
}

async function executeNextStepForValidation(): Promise<void> {
  return new Promise((resolve, reject) => {
    const originalCallback = executeNextStep
    
    // Override execution completion handling for validation
    const validationStep = () => {
      try {
        executeNextStep()
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    
    validationStep()
  })
}

function generateHTMLReport(report: TestReport): string {
  const timestamp = report.generatedAt.toLocaleString()
  const successRate = report.summary.successRate.toFixed(1)
  const duration = (report.summary.totalDuration / 1000).toFixed(1)
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI-QA Agent Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .header { border-bottom: 2px solid #e5e5e5; padding-bottom: 20px; margin-bottom: 20px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
        .metric h3 { margin: 0; color: #666; font-size: 14px; }
        .metric .value { font-size: 24px; font-weight: bold; margin: 5px 0; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .warning { color: #ffc107; }
        .test-case { border: 1px solid #e5e5e5; border-radius: 6px; margin-bottom: 20px; overflow: hidden; }
        .test-header { background: #f8f9fa; padding: 15px; font-weight: bold; }
        .test-content { padding: 15px; }
        .step { padding: 8px 0; border-bottom: 1px solid #eee; }
        .step:last-child { border-bottom: none; }
        .step-status { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 10px; }
        .status-passed { background: #28a745; }
        .status-failed { background: #dc3545; }
        .status-running { background: #ffc107; }
        .mvp-status { padding: 20px; border-radius: 6px; margin: 20px 0; }
        .mvp-pass { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .mvp-fail { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI-QA Agent Test Report</h1>
            <p><strong>Generated:</strong> ${timestamp}</p>
            <p><strong>Test Suite:</strong> ${report.testSuite}</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Tests</h3>
                <div class="value">${report.summary.totalTests}</div>
            </div>
            <div class="metric">
                <h3>Passed</h3>
                <div class="value passed">${report.summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div class="value failed">${report.summary.failed}</div>
            </div>
            <div class="metric">
                <h3>Success Rate</h3>
                <div class="value ${report.mvpTargets.meets80PercentTarget ? 'passed' : 'failed'}">${successRate}%</div>
            </div>
            <div class="metric">
                <h3>Duration</h3>
                <div class="value">${duration}s</div>
            </div>
            <div class="metric">
                <h3>Avg Step Time</h3>
                <div class="value">${report.performance.avgStepDuration.toFixed(0)}ms</div>
            </div>
        </div>
        
        <div class="mvp-status ${report.mvpTargets.meets80PercentTarget ? 'mvp-pass' : 'mvp-fail'}">
            <h3>MVP Target Validation</h3>
            <p><strong>Target:</strong> ≥${report.mvpTargets.successRateTarget}% success rate</p>
            <p><strong>Actual:</strong> ${report.mvpTargets.successRateActual.toFixed(1)}%</p>
            <p><strong>Status:</strong> ${report.mvpTargets.meets80PercentTarget ? '✅ PASSED' : '❌ FAILED'}</p>
        </div>
        
        <h2>Test Executions</h2>
        ${report.executions.map(execution => `
            <div class="test-case">
                <div class="test-header ${execution.status === 'passed' ? 'passed' : 'failed'}">
                    <span class="step-status status-${execution.status}"></span>
                    ${execution.testCase.name} (${execution.testCase.complexity})
                    <span style="float: right;">${execution.duration ? (execution.duration / 1000).toFixed(1) + 's' : ''}</span>
                </div>
                <div class="test-content">
                    <p><strong>Description:</strong> ${execution.testCase.description}</p>
                    <h4>Steps:</h4>
                    ${execution.steps.map(step => `
                        <div class="step">
                            <span class="step-status status-${step.status}"></span>
                            <strong>Step ${step.stepNumber}:</strong> ${step.description}
                            ${step.duration ? `<span style="float: right;">${step.duration}ms</span>` : ''}
                            ${step.error ? `<br><span style="color: #dc3545; margin-left: 22px;">Error: ${step.error}</span>` : ''}
                        </div>
                    `).join('')}
                    ${execution.errors.length > 0 ? `
                        <h4>Errors:</h4>
                        <ul>${execution.errors.map(error => `<li style="color: #dc3545;">${error}</li>`).join('')}</ul>
                    ` : ''}
                </div>
            </div>
        `).join('')}
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5; color: #666; text-align: center;">
            Generated by AI-QA Agent v1.0 | ${timestamp}
        </div>
    </div>
</body>
</html>`
}

function generateJSONReport(report: TestReport): string {
  return JSON.stringify(report, null, 2)
}

function saveTestReport(report: TestReport): void {
  // Save to localStorage for persistence
  const reports = getStoredReports()
  reports.push(report)
  
  try {
    localStorage.setItem('aiqa_test_reports', JSON.stringify(reports))
    console.log(`Test report saved: ${report.id}`)
  } catch (error) {
    console.error('Failed to save test report:', error)
  }
}

function getStoredReports(): TestReport[] {
  try {
    const stored = localStorage.getItem('aiqa_test_reports')
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Failed to load stored reports:', error)
    return []
  }
}

function downloadReport(reportId: string, format: 'html' | 'json' = 'html'): void {
  const reports = getStoredReports()
  const report = reports.find(r => r.id === reportId)
  
  if (!report) {
    console.error('Report not found:', reportId)
    return
  }
  
  const content = format === 'html' ? generateHTMLReport(report) : generateJSONReport(report)
  const mimeType = format === 'html' ? 'text/html' : 'application/json'
  const filename = `aiqa-report-${reportId}.${format}`
  
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  console.log(`Report downloaded: ${filename}`)
}

// Story 8: Inspector Tab Integration
function updateInspectorContent(contextPayload: ContextPayload) {
  if (!inspectorContent) {
    console.error('Inspector content element not found')
    return
  }
  
  const { context, trimmedElements, payloadSize } = contextPayload
  
  inspectorContent.innerHTML = `
    <div class="p-4 space-y-4">
      <!-- Context Summary -->
      <div class="bg-gray-50 rounded-lg p-3">
        <h3 class="text-sm font-medium text-gray-700 mb-2">UI Context Summary</h3>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div><span class="text-gray-500">Timestamp:</span> ${new Date(context.timestamp).toLocaleTimeString()}</div>
          <div><span class="text-gray-500">Activity:</span> ${context.currentActivity?.split('.').pop() || 'N/A'}</div>
          <div><span class="text-gray-500">Package:</span> ${context.appPackage}</div>
          <div><span class="text-gray-500">Device:</span> ${context.deviceInfo.width}x${context.deviceInfo.height}</div>
          <div><span class="text-gray-500">Elements:</span> ${trimmedElements.length}/${context.elements.length}</div>
          <div><span class="text-gray-500">Payload Size:</span> ${(payloadSize / 1024).toFixed(1)}KB</div>
        </div>
      </div>
      
      <!-- Context Controls -->
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-gray-700">UI Elements (Priority Order)</h3>
        <div class="flex items-center space-x-2">
          <label class="flex items-center text-xs">
            <input type="checkbox" ${contextCollectionEnabled ? 'checked' : ''} 
                   onchange="toggleContextCollection(this.checked)" class="mr-1 rounded">
            <span>Auto-collect</span>
          </label>
          <button onclick="refreshContext()" 
                  class="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">
            Refresh
          </button>
        </div>
      </div>
      
      <!-- Element List -->
      <div class="space-y-2 max-h-96 overflow-y-auto">
        ${trimmedElements.map((element, index) => `
          <div class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-2 mb-2">
                  <span class="text-xs bg-gray-100 px-2 py-1 rounded">${element.type}</span>
                  <span class="text-xs text-gray-500">Priority: ${element.priority}</span>
                  ${element.clickable ? '<span class="text-xs bg-green-100 text-green-700 px-1 rounded">Clickable</span>' : ''}
                </div>
                
                ${element.text ? `<div class="text-sm font-medium text-gray-800 mb-1">${element.text}</div>` : ''}
                ${element.contentDesc ? `<div class="text-xs text-gray-600 mb-1">${element.contentDesc}</div>` : ''}
                ${element.resourceId ? `<div class="text-xs text-blue-600 font-mono mb-1">${element.resourceId}</div>` : ''}
                
                <!-- Selectors -->
                <div class="mt-2">
                  <span class="text-xs text-gray-500">Selectors:</span>
                  <div class="mt-1 space-y-1">
                    ${element.selectors.slice(0, 3).map(selector => `
                      <div class="text-xs flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                        <span class="font-mono text-gray-700">${selector.type}: ${selector.value.length > 40 ? selector.value.substring(0, 40) + '...' : selector.value}</span>
                        <span class="text-gray-500">${Math.round(selector.confidence * 100)}%</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
              
              <div class="ml-2 text-right">
                <div class="text-xs text-gray-500 mb-1">#${index + 1}</div>
                ${element.bounds ? `
                  <div class="text-xs text-gray-400 mb-2">
                    ${element.bounds.x},${element.bounds.y}<br>
                    ${element.bounds.width}×${element.bounds.height}
                  </div>
                ` : ''}
                
                <!-- Pin/Unpin Controls -->
                <div class="flex flex-col space-y-1">
                  ${element.pinned ? `
                    <button onclick="unpinElement('${element.id}')" 
                            class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200">
                      Unpin
                    </button>
                  ` : `
                    <button onclick="pinElement('${element.id}', 0)" 
                            class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200">
                      Pin
                    </button>
                  `}
                  <button onclick="highlightElement('${element.id}')" 
                          class="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200">
                    Show
                  </button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- Page Source Preview -->
      <div class="mt-4">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium text-gray-700">Page Source</h4>
          <button onclick="togglePageSource()" 
                  class="text-xs text-blue-600 hover:text-blue-800">
            Toggle View
          </button>
        </div>
        <div id="pageSourceContainer" class="hidden">
          <pre class="text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-32">${context.pageSource.substring(0, 500)}${context.pageSource.length > 500 ? '...' : ''}</pre>
        </div>
      </div>
    </div>
  `
}

// Global functions for Inspector controls
;(window as any).toggleContextCollection = (enabled: boolean) => {
  contextCollectionEnabled = enabled
  console.log(`Context collection ${enabled ? 'enabled' : 'disabled'}`)
}

;(window as any).refreshContext = () => {
  if (currentUIContext) {
    const payload = trimContextForAI(currentUIContext)
    updateInspectorContent(payload)
    console.log('Context refreshed')
  } else {
    console.log('No context to refresh')
  }
}

;(window as any).togglePageSource = () => {
  const container = document.getElementById('pageSourceContainer')
  if (container) {
    container.classList.toggle('hidden')
  }
}

// Story 9: Make pin/unpin functions globally accessible
;(window as any).pinElement = pinElement
;(window as any).unpinElement = unpinElement
;(window as any).highlightElement = highlightElement

// Story 11: Make Appium functions globally accessible for testing
;(window as any).connectToAppium = connectToAppium
;(window as any).disconnectFromAppium = disconnectFromAppium
;(window as any).executeDeviceAction = executeDeviceAction
;(window as any).appiumConnection = appiumConnection

// Story 12: Make validation functions globally accessible
;(window as any).startValidationSuite = startValidationSuite
;(window as any).downloadReport = downloadReport
;(window as any).getStoredReports = getStoredReports
;(window as any).sampleTestCases = sampleTestCases

function simulateStepFailure(): { reason: string; shouldReplan: boolean } {
  const failures = [
    { reason: "Element not found: Search button missing", shouldReplan: true },
    { reason: "Network timeout: App failed to load", shouldReplan: true },
    { reason: "Permission popup appeared", shouldReplan: true },
    { reason: "App crashed during execution", shouldReplan: false },
    { reason: "Element click failed - UI changed", shouldReplan: true }
  ]
  
  return failures[Math.floor(Math.random() * failures.length)]
}

function createReplanningContext(command: string, stepIndex: number, failureReason: string): ReplanningContext {
  return {
    originalCommand: command,
    currentStep: stepIndex,
    totalSteps: executionSteps.length,
    failureReason,
    attemptNumber: replanningAttempts + 1,
    maxAttempts: MAX_REPLANNING_ATTEMPTS,
    previousPlan: executionSteps,
    uiContext: "Mock UI context - app state after failure"
  }
}

function generateReplan(context: ReplanningContext): ReplanningResult {
  console.log(`Generating replan for attempt ${context.attemptNumber}/${context.maxAttempts}`)
  
  // Reduce confidence with each attempt
  const confidenceReduction = (context.attemptNumber - 1) * 0.15
  let baseConfidence = 0.85
  const adjustedConfidence = Math.max(0.3, baseConfidence - confidenceReduction)
  
  // Different replanning strategies based on failure type
  let newSteps = []
  let reason = ""
  
  if (context.failureReason.includes("Element not found")) {
    // Strategy: Add wait and retry steps
    newSteps = [
      { action: "wait_for_element", description: "Wait for UI to stabilize" },
      { action: "take_screenshot", description: "Capture current state" },
      { action: "scroll_down", description: "Scroll to find element" },
      ...context.previousPlan.slice(context.currentStep)
    ]
    reason = "Added wait and scroll steps to handle missing element"
    
  } else if (context.failureReason.includes("Permission popup")) {
    // Strategy: Handle popup then continue
    newSteps = [
      { action: "click_element", description: "Accept permission popup" },
      { action: "wait_for_element", description: "Wait for popup to dismiss" },
      ...context.previousPlan.slice(context.currentStep)
    ]
    reason = "Added popup handling steps"
    
  } else if (context.failureReason.includes("Network timeout")) {
    // Strategy: Retry with longer waits
    newSteps = [
      { action: "wait_for_element", description: "Wait for network recovery" },
      { action: "refresh_app", description: "Refresh app if needed" },
      ...context.previousPlan.slice(context.currentStep).map((step: any) => ({
        ...step,
        description: step.description + " (with extended timeout)"
      }))
    ]
    reason = "Added network recovery and extended timeouts"
    
  } else {
    // Fallback strategy
    newSteps = [
      { action: "navigate_back", description: "Go back to safe state" },
      { action: "take_screenshot", description: "Capture recovery state" },
      ...context.previousPlan.slice(Math.max(0, context.currentStep - 1))
    ]
    reason = "Fallback recovery strategy - navigate back and retry"
  }
  
  return {
    success: true,
    newPlan: {
      confidence: adjustedConfidence,
      steps: newSteps,
      metadata: {
        replanReason: reason,
        attemptNumber: context.attemptNumber,
        originalFailure: context.failureReason
      }
    },
    confidence: adjustedConfidence,
    reason,
    shouldContinue: context.attemptNumber < context.maxAttempts
  }
}

function addReplanningLogEntry(context: ReplanningContext, result: ReplanningResult) {
  const replanStep: ExecutionStep = {
    id: ++stepIdCounter,
    description: `🔄 Replanning (Attempt ${context.attemptNumber}/${context.maxAttempts})`,
    action: 'replan',
    status: result.success ? 'completed' : 'failed',
    timestamp: new Date().toLocaleTimeString(),
    duration: '0.8s',
    screenshot: false,
    expanded: false
  }
  
  executionSteps.push(replanStep)
  replanningHistory.push(context)
  renderExecutionSteps()
}

function analyzeCommand(command: string): string {
  const cmd = command.toLowerCase()
  if (cmd.includes('search') || cmd.includes('find') || cmd.includes('look')) {
    return 'search'
  } else if (cmd.includes('order') || cmd.includes('buy') || cmd.includes('cart') || cmd.includes('checkout')) {
    return 'order'
  } else if (cmd.includes('login') || cmd.includes('sign in') || cmd.includes('account')) {
    return 'login'
  } else {
    return 'fallback'
  }
}

function validatePlanSchema(plan: any): boolean {
  if (!plan || typeof plan !== 'object') return false
  if (typeof plan.confidence !== 'number' || plan.confidence < 0 || plan.confidence > 1) return false
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return false
  
  return plan.steps.every((step: any) => 
    typeof step.action === 'string' && 
    typeof step.description === 'string'
  )
}

// For Story 6: Simplified and robust plan generation
function generatePlan(command: string) {
  console.log(`generatePlan called with command: "${command}"`)
  
  if (command.trim().length === 0) {
    if (planPreview) planPreview.classList.add('hidden')
    // Reset emulator to idle state
    executionStatus = 'idle'
    currentStep = 0
    updateEmulatorDisplay()
    // Reset plan generation attempts
    planGenerationAttempts = 0
    return
  }

  // Check if required DOM elements exist
  if (!planPreview || !planSteps || !confidenceScore) {
    console.error('Required DOM elements not found:', {
      planPreview: !!planPreview,
      planSteps: !!planSteps,
      confidenceScore: !!confidenceScore
    })
    return
  }

  // Show plan preview immediately
  planPreview.classList.remove('hidden')
  
  // Reset attempts for new command
  planGenerationAttempts = 0
  
  try {
    // Show loading state immediately
    planSteps.innerHTML = `
      <div class="text-xs text-gray-500 flex items-center space-x-2">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Generating AI plan...</span>
      </div>
    `
    
    // Generate plan after a short delay
    setTimeout(() => {
      try {
        generatePlanSync(command)
      } catch (error) {
        console.error('Error in generatePlanSync:', error)
        showPlanError(error)
      }
    }, 1000)
    
  } catch (error) {
    console.error('Error in generatePlan:', error)
    showPlanError(error)
  }
}

// Synchronous plan generation
function generatePlanSync(command: string) {
  console.log('Generating plan synchronously for:', command)
  
  // Analyze command to select appropriate plan template
  const planType = analyzeCommand(command) as keyof typeof mockPlans
  console.log(`Analyzed command type: ${planType}`)
  
  const basePlan = mockPlans[planType]
  console.log('Base plan selected:', basePlan)
  
  // Create customized plan
  const plan = {
    confidence: basePlan.confidence,
    steps: basePlan.steps.map((step: any) => ({
      ...step,
      // Customize descriptions based on actual command
      description: step.description.includes('search') || step.description.includes('Type') 
        ? step.description.replace(/search query|'.*?'/, `"${command.split(' ').slice(0, 3).join(' ')}"`)
        : applyPinnedSelectorsToStep(step.description) // Story 9: Apply pinned selectors
    })),
    metadata: {
      complexity: basePlan.steps.length <= 4 ? 'simple' as const : basePlan.steps.length <= 6 ? 'medium' as const : 'complex' as const,
      estimatedDuration: basePlan.steps.length * 2000,
      requiresAuth: planType === 'login',
      pinnedElements: getPinnedElementsForPlanning() // Story 9: Include pinned elements info
    }
  }
  
  console.log('Plan generated successfully:', plan)
  
  // Update confidence score with color coding
  const confidencePercent = Math.round(plan.confidence * 100)
  const confidenceColor = plan.confidence >= 0.8 ? 'text-green-600' : 
                        plan.confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
  confidenceScore.className = `text-xs ${confidenceColor}`
  confidenceScore.textContent = `Confidence: ${confidencePercent}%`
  
  // Generate plan steps with enhanced information
  planSteps.innerHTML = ''
  plan.steps.forEach((step, index) => {
    const stepElement = document.createElement('div')
    stepElement.className = 'text-xs p-2 bg-white rounded border relative'
    stepElement.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <span class="font-mono text-blue-600">${step.action}</span>
          <span class="ml-2 text-gray-600">${step.description}</span>
        </div>
        <span class="text-xs text-gray-400 ml-2">${index + 1}/${plan.steps.length}</span>
      </div>
      ${plan.metadata?.complexity === 'complex' && index === 0 ? 
        '<div class="text-xs text-orange-500 mt-1">⚠️ Complex flow detected</div>' : ''}
    `
    planSteps.appendChild(stepElement)
  })
  
  // Add metadata display
  if (plan.metadata) {
    const metadataElement = document.createElement('div')
    metadataElement.className = 'text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded'
    
    let pinnedInfo = ''
    if (plan.metadata.pinnedElements && plan.metadata.pinnedElements.length > 0) {
      pinnedInfo = `<span class="text-blue-600">📌 ${plan.metadata.pinnedElements.length} pinned element${plan.metadata.pinnedElements.length > 1 ? 's' : ''}</span>`
    }
    
    metadataElement.innerHTML = `
      <div class="flex space-x-4">
        <span>Complexity: ${plan.metadata.complexity}</span>
        <span>Est. Duration: ${Math.round(plan.metadata.estimatedDuration / 1000)}s</span>
        ${plan.metadata.requiresAuth ? '<span class="text-yellow-600">⚠️ Requires Auth</span>' : ''}
        ${pinnedInfo}
      </div>
    `
    planSteps.appendChild(metadataElement)
  }
  
  // Update control buttons now that we have a command
  updateControlButtons()
  
  console.log('Plan display updated successfully')
}

function showPlanError(error: any) {
  console.error('Showing plan error:', error)
  if (planSteps) {
    planSteps.innerHTML = `
      <div class="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200">
        ❌ Plan generation failed: ${error?.message || 'Unknown error'}. Please try a different command.
      </div>
    `
  }
}

// Initialize the UI state
function initializeUI() {
  console.log('Initializing UI...')
  
  // Check all required DOM elements
  const requiredElements = {
    planPreview: document.getElementById('planPreview'),
    planSteps: document.getElementById('planSteps'),
    confidenceScore: document.getElementById('confidenceScore'),
    commandInput: document.getElementById('commandInput'),
    startBtn: document.getElementById('startBtn'),
    executionStepsList: document.getElementById('executionStepsList'),
    noExecutionMessage: document.getElementById('noExecutionMessage')
  }
  
  const missingElements = Object.entries(requiredElements)
    .filter(([, element]) => !element)
    .map(([key]) => key)
  
  if (missingElements.length > 0) {
    console.error('Missing DOM elements:', missingElements)
    return false
  }
  
  console.log('All DOM elements found successfully')
  updateControlButtons()
  return true
}

// Debug function to check DOM elements
function debugDOMElements() {
  console.log('DOM Elements Check:', {
    planPreview: document.getElementById('planPreview'),
    planSteps: document.getElementById('planSteps'),
    confidenceScore: document.getElementById('confidenceScore'),
    commandInput: document.getElementById('commandInput')
  })
}

// Wait for DOM to be fully loaded before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    debugDOMElements()
    initializeUI()
  })
} else {
  // DOM is already loaded
  debugDOMElements()
  initializeUI()
}

