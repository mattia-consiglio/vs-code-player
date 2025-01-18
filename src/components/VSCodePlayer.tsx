// biome-ignore lint/style/useImportType: it is used by the monaco-editor package
import * as React from "react";
import Editor from "@monaco-editor/react";

export interface VSCodePlayerProps {
	/**
	 * The content to be displayed in the editor
	 */
	content: string;
	/**
	 * The language of the content (e.g. 'javascript', 'typescript', 'python')
	 */
	language?: string;
	/**
	 * Theme to use for the editor
	 */
	theme?: "vs-dark" | "vs-light";
	/**
	 * Height of the editor
	 */
	height?: string | number;
	/**
	 * Whether the editor is read-only
	 */
	readOnly?: boolean;
}

export const VSCodePlayer: React.FC<VSCodePlayerProps> = ({
	content,
	language = "typescript",
	theme = "vs-dark",
	height = "400px",
	readOnly = true,
}) => {
	return (
		<div className="vs-code-player">
			<Editor
				height={height}
				defaultLanguage={language}
				defaultValue={content}
				theme={theme}
				options={{
					readOnly,
					minimap: { enabled: true },
					scrollBeyondLastLine: false,
					fontSize: 14,
					lineNumbers: "on",
					renderLineHighlight: "all",
					automaticLayout: true,
				}}
			/>
		</div>
	);
};
