/**
 * Represents a file in the Monaco editor
 */
export interface MonacoFile {
  name: string
  language: string
  value: string
  isChanged?: boolean
}

/**
 * Map of Monaco files by path
 */
export interface MonacoFilesMap {
  [key: string]: MonacoFile
}

/**
 * State of the player
 */
export enum PlayerState {
  UNSTARTED = -1,
  ENDED = 0,
  PLAYING = 1,
  PAUSED = 2,
  BUFFERING = 3,
	SEEKING = 5,
}

/**
 * A record of content changes
 */
export interface ContentRecord {
  sequence: number
  startTime: number
  endTime: number
  file: string
  text: string
  language: string
}

/**
 * Props for the VSCodePlayer component
 */
export interface VSCodePlayerProps {
  /**
   * Array of content records to play
   */
  content: ContentRecord[]
  
  /**
   * Current time of the player
   */
  currentTime: number
  
  /**
   * Whether to show the controls
   * @default true
   */
  showControls?: boolean
  
  /**
   * Initial playback speed
   * @default 1
   */
  initialSpeed?: number
  
  /**
   * Height of the editor in pixels or CSS value
   * @default "300px"
   */
  height?: string | number
  
  /**
   * Width of the editor in pixels or CSS value
   * @default "100%"
   */ 
  width?: string | number
  
  /**
   * Theme for the Monaco editor
   * @default "vs-dark"
   */
  theme?: string
  
  /**
   * Callback when playback state changes
   */
  onStateChange?: (state: PlayerState) => void
  
  /**
   * Callback when current time changes
   */
  onTimeUpdate?: (time: number) => void
}

/**
 * A single step of a change in the recorded content
 */
export interface ChangeStep {
	sequence: number
	timeStart: number
	timeEnd: number
	text: string
  language: string
}