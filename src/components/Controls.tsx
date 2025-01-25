import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
	IoChevronBackSharp,
	IoChevronForwardSharp,
	IoPauseSharp,
	IoPlaySharp,
} from "react-icons/io5"
import { PlayerState } from "../types"

interface ControlsProps {
	/**
	 * Current playback time in seconds
	 */
	currentTime: number

	/**
	 * Total duration in seconds
	 */
	duration: number

	/**
	 * Current playback speed
	 */
	currentSpeed: number

	/**
	 * Current player state
	 */
	playerState: PlayerState

	/**
	 * Callback when seeking to a specific time
	 */
	onSeek: (time: number) => void

	/**
	 * Callback when changing playback speed
	 */
	onSpeedChange: (speed: number) => void

	/**
	 * Callback when toggling play/pause
	 */
	onPlayPause: () => void
}

function formatTime(time: number) {
	const minutes = Math.floor(time / 60)
	const seconds = Math.floor(time % 60)
	const secondsText = seconds < 10 ? `0${seconds}` : seconds
	return `${minutes}:${secondsText}`
}

function formatPercentageTime(percentage: number, duration: number) {
	const time = (percentage / 100) * duration
	return formatTime(time)
}

export default function Controls({
	currentTime,
	duration,
	currentSpeed,
	playerState,
	onSeek,
	onSpeedChange,
	onPlayPause,
}: Readonly<ControlsProps>) {
	const [currentTimeText, setCurrentTimeText] = useState(
		formatTime(currentTime),
	)
	const durationText = useMemo(() => formatTime(duration), [duration])
	const [isHovering, setIsHovering] = useState(false)
	const progressBar = useRef<HTMLDivElement>(null)
	const hoverPercentage = useRef(0)
	const isDragging = useRef(false)
	const [isOptionsOpen, setIsOptionsOpen] = useState(false)
	const availableSpeeds = [0.25, 0.5, 1, 1.25, 1.5, 2]

	const getCursorPosition = useCallback((e: MouseEvent) => {
		if (!progressBar.current) return 0
		const rect = progressBar.current.getBoundingClientRect()
		const offsetX = e.clientX - rect.left
		const percentage = Math.min(Math.max(0, (offsetX / rect.width) * 100), 100)
		return percentage
	}, [])

	const seek = useCallback(
		(percentage?: number) => {
			const time = ((percentage ?? hoverPercentage.current) / 100) * duration
			onSeek(time)
		},
		[duration, onSeek],
	)

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			const percentage = getCursorPosition(e)
			hoverPercentage.current = percentage
			setCurrentTimeText(formatPercentageTime(percentage, duration))
			setIsHovering(true)
			if (isDragging.current) {
				seek()
			}
		},
		[duration, getCursorPosition, seek],
	)

	const handleMouseUp = useCallback(() => {
		setIsHovering(false)
		isDragging.current = false
		window.removeEventListener("mousemove", handleMouseMove)
		window.removeEventListener("mouseup", handleMouseUp)
		seek()
	}, [handleMouseMove, seek])

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.stopPropagation()
			isDragging.current = true
			const nativeEvent = e.nativeEvent
			handleMouseMove(nativeEvent)
			setIsOptionsOpen(false)
			window.addEventListener("mousemove", handleMouseMove)
			window.addEventListener("mouseup", handleMouseUp)
		},
		[handleMouseMove, handleMouseUp],
	)

	const seekBackward = useCallback(() => {
		onSeek(Math.max(currentTime - 5, 0))
	}, [currentTime, onSeek])

	const seekForward = useCallback(() => {
		onSeek(Math.min(currentTime + 5, duration))
	}, [currentTime, duration, onSeek])

	useEffect(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			switch (e.key) {
				case "ArrowRight":
				case "l":
				case "L":
					e.preventDefault()
					seekForward()
					break
				case "ArrowLeft":
				case "j":
				case "J":
					e.preventDefault()
					seekBackward()
					break
				case " ":
				case "k":
				case "K":
					e.preventDefault()
					onPlayPause()
					break
			}
		}

		document.addEventListener("keydown", handleKeydown)
		return () => document.removeEventListener("keydown", handleKeydown)
	}, [onPlayPause, seekBackward, seekForward])

	return (
		<div className="player-controls">
			<div
				className="progress-bar-wrapper"
				onMouseMove={(e) => handleMouseMove(e.nativeEvent)}
				onMouseLeave={() => setIsHovering(false)}
				onMouseDown={handleMouseDown}
				ref={progressBar}
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={currentTime}
				aria-valuetext={currentTimeText}
				aria-label={`${currentTimeText}/${durationText}`}
			>
				<div
					className="progress"
					style={{ width: `${(currentTime / duration) * 100}%` }}
				/>
				<div
					className={`circle${isHovering || isDragging.current ? " active" : ""}`}
					style={{ left: `${(currentTime / duration) * 100}%` }}
				/>
				<div
					className="hover-progress"
					style={{
						width: `${hoverPercentage.current}%`,
						visibility: isHovering ? "visible" : "hidden",
					}}
				/>
				<div
					className="time-hover-text"
					style={{
						left: `${hoverPercentage.current}%`,
						visibility: isHovering ? "visible" : "hidden",
					}}
				>
					{currentTimeText}
				</div>
			</div>

			<div className="controls">
				<div className="left">
					<button
						type="button"
						onClick={seekBackward}
						className="text-xl"
						aria-label="Indietro di 5 secondi"
					>
						<IoChevronBackSharp /> 5s
					</button>
					<button
						type="button"
						onClick={onPlayPause}
						className="text-3xl"
						aria-label={playerState === PlayerState.PLAYING ? "Pausa" : "Play"}
					>
						{playerState === PlayerState.PLAYING ? (
							<IoPauseSharp />
						) : (
							<IoPlaySharp />
						)}
					</button>
					<button
						type="button"
						onClick={seekForward}
						className="text-xl"
						aria-label="Avanti di 5 secondi"
					>
						5s <IoChevronForwardSharp />
					</button>
					<div>
						{formatTime(currentTime)} / {durationText}
					</div>
				</div>

				<div className="right">
					<div className="relative">
						<button
							type="button"
							className="text-xl"
							onClick={() => setIsOptionsOpen(!isOptionsOpen)}
							aria-label="Velocità di riproduzione"
						>
							{currentSpeed}x
						</button>
						{isOptionsOpen && (
							<div className="speed-menu">
								{availableSpeeds.map((speed) => (
									<button
										key={speed}
										type="button"
										className={`speed-option${speed === currentSpeed ? " active" : ""}`}
										onClick={() => {
											onSpeedChange(speed)
											setIsOptionsOpen(false)
										}}
										role="menuitem"
									>
										{speed}x
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
