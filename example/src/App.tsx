import { VSCodePlayer } from "../../src"

const sampleCode = `function hello() {
  console.log("Hello from VS Code Player!");
}

// Try to edit this code
hello();`

function App() {
	return (
		<div style={{ padding: "2rem" }}>
			<h1>VS Code Player Demo</h1>
			<VSCodePlayer content={sampleCode} language="typescript" height="300px" />
		</div>
	)
}

export default App
