import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import CodeEditor, { type MonacoFile } from "./CodeEditor"
import type { ChangeStep } from "../types"
import * as Diff from "diff"
import type { editor } from "monaco-editor"
import { PlayerState } from "../types"
import type { Monaco } from "@monaco-editor/react"
import { throttle } from "../utils"
import Controls from "./Controls"

interface VsCodePlayerOptions {
	editor?: {
		editingEnabled?: boolean
		tabChangeEnabled?: boolean
	}
	controls?: {
		enabled?: boolean
		progressBarEnabled?: boolean
		speedControlEnabled?: boolean
		goForwardEnabled?: boolean
		goBackwardEnabled?: boolean
		playPauseEnabled?: boolean
	}
}

/**
 * Represents the props for the VSCodePlayer component.
 * @property {string} sourceCode - The source code to be displayed in the code editor.
 * @property {number} currentTime - The current time of the player.
 * @property {PlayerState} playerState - The state of the player.
 * @property {number} currentSpeed - The current speed of the player.
 * @property {Options} options - The options for the player.
 * @property {React.ReactNode} children - Children components
 */
interface VsCodePlayerProps {
	/** The source code to be displayed in the code editor. */
	sourceCode: string
	/** The current time of the player. */
	currentTime: number
	/** The state of the player. */
	playerState: PlayerState
	/** The current speed of the player. */
	currentSpeed?: number
	/** The options for the player. */
	options?: VsCodePlayerOptions
	/** Children components */
	children?: React.ReactNode
}
/**
 * Represents a line of text from a subtitle file (SRT) along with the file it belongs to.
 * @property {string} text - The text content of the subtitle line.
 * @property {string} file - The file that the subtitle line belongs to.
 */
interface StepText {
	text: string
	file: string
}

/**
 * Represents the options for a change event in a Monaco editor.
 * @property {editor.IIdentifiedSingleEditOperation["range"]} range - The range of the edit operation.
 * @property {string} text - The new text to be inserted.
 * @property {string} targetText - The text that was replaced.
 */
interface MonacoEditorChangeOptions {
	range: editor.IIdentifiedSingleEditOperation["range"]
	text: string
	targetText: string
}

/**
 * Represents the changes made to a range of text in a document.
 * @property {number} rangeOffset - The offset of the changed range from the start of the document.
 * @property {number} rangeLength - The length of the changed range.
 * @property {string} rangeText - The new text that was inserted or replaced.
 * @property {string} originalText - The original text that was replaced.
 * @property {string} targetText - The text that the range was changed to.
 */
interface Changes2DRange {
	rangeOffset: number
	rangeLength: number
	rangeText: string
	originalText: string
	targetText: string
}

interface PlayerContextType {
	currentTime: number
	duration: number
	playerState: PlayerState
	currentSpeed: number
	onSeek?: (time: number) => void
	onSpeedChange?: (speed: number) => void
	onPlayPause?: () => void
}

const PlayerContext = React.createContext<PlayerContextType | null>(null)

// Hook personalizzato per utilizzare il contesto
export const usePlayer = () => {
	const context = useContext(PlayerContext)
	if (!context) {
		throw new Error("usePlayer must be used within a VSCodePlayer")
	}
	return context
}

function VsCodePlayer({
	sourceCode,
	currentTime,
	playerState,
	currentSpeed = 1,
	children,
	onSeek,
	onSpeedChange,
	onPlayPause,
}: Readonly<
	VsCodePlayerProps & {
		onSeek?: (time: number) => void
		onSpeedChange?: (speed: number) => void
		onPlayPause?: () => void
	}
>) {
	const currentFilePathRef = useRef("")
	const [currentFile, setCurrentFile] = useState("")
	const timeouts = useRef(new Map<number, NodeJS.Timeout>())
	const sourceCodeArray = useMemo(
		() => JSON.parse(sourceCode) as ChangeStep[],
		[sourceCode],
	)

	const [filteredArray, setFilteredArray] = useState([] as ChangeStep[])
	const files = useRef<
		Record<string, { model: editor.ITextModel } & MonacoFile>
	>({})
	const [editorState, setEditorState] =
		useState<editor.IStandaloneCodeEditor | null>(null)
	const [monacoState, setMonacoState] = useState<Monaco | null>(null)
	const prevVideoSpeed = useRef(1)
	const currentTimeRef = useRef(currentTime)
	const [toggleTabChange, setToggleTabChange] = useState(false)
	const lastUpdateTime = useRef(0)

	// Calcolo la durata totale dal sourceCode
	const duration = useMemo(() => {
		const array = JSON.parse(sourceCode) as ChangeStep[]
		if (array.length === 0) return 0
		return array[array.length - 1].timeEnd / 1000 // Converti da millisecondi a secondi
	}, [sourceCode])

	/**
	 * Determines the language mode for a given file based on its file extension.
	 *
	 * @param file - The file name, including the file extension.
	 * @returns The language mode for the file, or 'auto' if the extension is not recognized.
	 */
	const getLanguage = useCallback((file: string) => {
		const extension = file.split(".").pop()
		switch (extension) {
			case "js":
				return "javascript"
			case "ts":
				return "typescript"
			case "html":
				return "html"
			case "css":
				return "css"
			default:
				return "auto"
		}
	}, [])

	//simulate file onChange event with monaco editor with only changes not entire file
	const handleEditorChange = useCallback(
		(
			{ range, text, targetText }: MonacoEditorChangeOptions,
			fileChanged = false,
		) => {
			if (!editorState || !monacoState || !range) return
			const file = files.current[currentFilePathRef.current]
			if (!file) return

			const model = file.model
			if (!model) return

			if (fileChanged) {
				editorState.executeEdits("", [
					{
						range: model.getFullModelRange(),
						text: file.value,
					},
				])
			}

			//create edit operation
			const editOp: editor.IIdentifiedSingleEditOperation = {
				range,
				text,
				forceMoveMarkers: false,
			}
			monacoState.editor.setModelLanguage(model, file.language)

			//push changes to editor
			model.pushEditOperations([], [editOp], () => null)

			// ensure value is set
			if (model.getValue() !== targetText) {
				model.setValue(targetText)
			}
		},
		[editorState, monacoState],
	)

	/**
	 * Calculates the differences between two strings and returns a 2D range of changes.
	 *
	 * This function uses the `diff-match-patch` library to calculate the differences between the `originalText` and `text` strings. It returns an object containing the following properties:
	 *
	 * - `rangeOffset`: The starting offset of the changed range.
	 * - `rangeLength`: The length of the changed range.
	 * - `rangeText`: The text to be inserted at the changed range.
	 * - `originalText`: The original text.
	 * - `targetText`: The target text.
	 *
	 * If the `originalText` and `text` are the same, the function returns `null`.
	 *
	 * @param {string} text - The target text to compare against the original text.
	 * @param {string} originalText - The original text to compare against the target text.
	 * @returns {Changes2DRange | null} - An object containing the details of the changes, or `null` if there are no changes.
	 */
	const getTextDifference2DRanges = useCallback(
		(text: string, originalText: string): Changes2DRange | null => {
			if (originalText === text) return null

			const lineLengthsCache = new Map<string, number>()
			const getLineLength = (line: string) => {
				if (lineLengthsCache.has(line)) {
					const length = lineLengthsCache.get(line)
					if (length === undefined) return line.length
					return length
				}
				const length = line.length
				lineLengthsCache.set(line, length)
				return length
			}

			const processUnchangedPart = (
				part: Diff.Change,
				isLast: boolean,
				state: {
					changes: number
					additions: number
					deletions: number
					rangeOffset: number
					rangeLength: number
					rangeText: string
				},
			) => {
				if (!state.changes) {
					state.rangeOffset += getLineLength(part.value)
				}

				if (state.changes && !isLast) {
					state.rangeLength += getLineLength(part.value)
				}

				if (state.additions && !isLast) {
					state.rangeText += part.value
				}

				if (state.deletions && !state.additions && !isLast) {
					state.rangeLength -= getLineLength(part.value)
				}
			}

			const state = {
				rangeOffset: 0,
				rangeLength: 0,
				rangeText: "",
				changes: 0,
				deletions: 0,
				additions: 0,
			}

			const diff = Diff.diffChars(originalText, text)

			for (let i = 0; i < diff.length; i++) {
				const part = diff[i]
				const isLast = i === diff.length - 1

				if (part.added) {
					state.rangeText += part.value
					state.changes++
					state.additions++
				} else if (part.removed) {
					state.rangeLength += getLineLength(part.value)
					state.changes++
					state.deletions++
				} else {
					processUnchangedPart(part, isLast, state)
				}
				state.rangeOffset = state.changes
					? state.rangeOffset
					: state.rangeOffset + state.rangeLength
			}

			return {
				rangeOffset: state.rangeOffset,
				rangeLength: state.rangeLength,
				rangeText: state.rangeText,
				originalText,
				targetText: text,
			}
		},
		[],
	)

	/**
	 * Converts a 2D range of changes into Monaco editor change operations.
	 *
	 * @param {Changes2DRange} changes - An object containing the details of the changes, including the range offset, range length, range text, original text, and target text.
	 * @returns {MonacoEditorChangeOptions} - An object containing the Monaco editor change options, including the range and the replacement text.
	 */
	const convert2DChangesToMonacoOperations = useCallback(
		({
			rangeOffset = 0,
			rangeLength = 0,
			rangeText = "",
			originalText = "",
			targetText: targeText = "",
		}: Changes2DRange): MonacoEditorChangeOptions => {
			let start = rangeOffset
			let end = rangeOffset + rangeLength
			let startLineNumber = 0
			let startColumn = 0
			let endLineNumber = 0
			let endColumn = 0
			const eol = /\r\n|\n/
			const lines = originalText.split(eol)
			const eolMatch = eol.exec(originalText)
			const eolLength = eolMatch ? eolMatch[0].length : 1

			for (let i = 0; i < lines.length; i++) {
				const lineLength = lines[i].length + eolLength
				if (start >= lineLength) {
					start -= lineLength
					startLineNumber++
				} else if (start || (start === 0 && i === 0)) {
					startColumn = start + 1
					startLineNumber++
					start = 0
				}

				if (end >= lineLength) {
					end -= lineLength
					endLineNumber++
				} else if (end || (end === 0 && i === 0)) {
					endColumn = end + 1
					endLineNumber++
					break
				}
			}

			const monacoRange: editor.IIdentifiedSingleEditOperation["range"] = {
				startLineNumber,
				startColumn,
				endLineNumber,
				endColumn,
			}
			return { range: monacoRange, text: rangeText, targetText: targeText }
		},
		[],
	)

	const throttledUpdateFiles = useMemo(
		() =>
			throttle(
				(sourceText: string, init = false) => {
					const now = Date.now()
					if (now - lastUpdateTime.current < 50 && !init) return
					lastUpdateTime.current = now

					const { file, text } = JSON.parse(sourceText) as StepText
					const language = getLanguage(file)
					const path = `codePlayer/${file}`

					if (init) {
						if (files.current[path]) return
						if (!monacoState) return
						const model = monacoState.editor.createModel(
							text,
							language,
							monacoState.Uri.parse(path),
						)
						files.current[path] = {
							model,
							name: file,
							language,
							value: text,
							isChanged: false,
						}
						if (currentFilePathRef.current === "") {
							currentFilePathRef.current = path
							setCurrentFile(path)
						}
						return
					}

					if (!editorState) return
					const model = editorState.getModel()
					if (!model) return

					setToggleTabChange((prev) => !prev)
					const pervFileText = model.getValue()
					const fileChanged = currentFilePathRef.current !== path
					currentFilePathRef.current = path
					setCurrentFile(path)

					files.current[path] = {
						model,
						name: file,
						language,
						value: text,
						isChanged: true,
					}

					const diff = getTextDifference2DRanges(text, pervFileText)
					if (!diff) return

					const monacoOperation = convert2DChangesToMonacoOperations(diff)
					handleEditorChange(monacoOperation, fileChanged)
				},
				50,
				{ leading: true, trailing: true },
			),
		[
			convert2DChangesToMonacoOperations,
			editorState,
			getLanguage,
			getTextDifference2DRanges,
			handleEditorChange,
			monacoState,
		],
	)

	useEffect(() => {
		if (!editorState) return
		for (const element of sourceCodeArray) {
			throttledUpdateFiles(element.text, true)
		}
	}, [sourceCodeArray, throttledUpdateFiles, editorState])

	useEffect(() => {
		const time = currentTime * 1000
		const newFilteredArray = sourceCodeArray.filter((element) => {
			return element.timeStart >= time
		})

		const currentElement = sourceCodeArray.find(
			(element) => element.timeStart <= time && element.timeEnd > time,
		)

		if (currentElement) {
			newFilteredArray.unshift(currentElement)
		}

		setFilteredArray(newFilteredArray)
	}, [currentTime, sourceCodeArray])

	useEffect(() => {
		currentTimeRef.current = currentTime
	}, [currentTime])

	useEffect(() => {
		if (
			playerState !== PlayerState.PLAYING ||
			prevVideoSpeed.current !== currentSpeed
		) {
			Array.from(timeouts.current.values()).forEach(clearTimeout)
			timeouts.current.clear()
		}
	}, [currentSpeed, playerState])

	useEffect(() => {
		const time = currentTimeRef.current * 1000
		if (filteredArray.length === 0) return

		const currentTimeouts = timeouts.current
		Array.from(currentTimeouts.values()).forEach(clearTimeout)
		currentTimeouts.clear()

		for (const [index, element] of Array.from(filteredArray.entries())) {
			if (element === undefined) continue
			if (index === 0) {
				throttledUpdateFiles(element.text)
			}
			if (playerState === PlayerState.PLAYING) {
				const timeoutId = setTimeout(
					() => {
						throttledUpdateFiles(element.text)
					},
					element.timeStart / currentSpeed - time,
				)
				currentTimeouts.set(index, timeoutId)
			}
		}

		return () => {
			Array.from(currentTimeouts.values()).forEach(clearTimeout)
			currentTimeouts.clear()
		}
	}, [filteredArray, playerState, currentSpeed, throttledUpdateFiles])

	useEffect(() => {
		prevVideoSpeed.current = currentSpeed
	}, [currentSpeed])

	const contextValue = useMemo(
		() => ({
			currentTime,
			duration,
			playerState,
			currentSpeed,
			onSeek,
			onSpeedChange,
			onPlayPause,
		}),
		[
			currentTime,
			duration,
			playerState,
			currentSpeed,
			onSeek,
			onSpeedChange,
			onPlayPause,
		],
	)

	return (
		<PlayerContext.Provider value={contextValue}>
			<div className="vs-code-player">
				<CodeEditor
					key="code-player"
					currenFile={currentFile}
					files={files.current}
					externalEditor={editorState}
					externalSetEditor={setEditorState}
					externalMonaco={monacoState}
					externalSetMonaco={setMonacoState}
					toggleTabChange={toggleTabChange}
				/>
				{children}
			</div>
		</PlayerContext.Provider>
	)
}

// Modifico il componente Controls per utilizzare il context e gestire le callback opzionali
const ControlsWithContext = () => {
	const {
		currentTime,
		duration,
		playerState,
		currentSpeed,
		onSeek,
		onSpeedChange,
		onPlayPause,
	} = usePlayer()

	const handleSeek = useCallback(
		(time: number) => {
			onSeek?.(time)
		},
		[onSeek],
	)

	const handleSpeedChange = useCallback(
		(speed: number) => {
			onSpeedChange?.(speed)
		},
		[onSpeedChange],
	)

	const handlePlayPause = useCallback(() => {
		onPlayPause?.()
	}, [onPlayPause])

	return (
		<Controls
			currentTime={currentTime}
			duration={duration}
			currentSpeed={currentSpeed}
			playerState={playerState}
			onSeek={handleSeek}
			onSpeedChange={handleSpeedChange}
			onPlayPause={handlePlayPause}
		/>
	)
}

// Aggiungo il componente Controls come proprietà statica
VsCodePlayer.Controls = ControlsWithContext

export default VsCodePlayer
