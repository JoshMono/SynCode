
import { useState } from "react";
import Editor from "@monaco-editor/react"

type SupportedLanguage =
	| "javascript"
	| "typescript"
	| "python"
	| "java"
	| "c"
	| "cpp"
	| "css"
	| "json"
	| "markdown"
	| "plaintext";

type ProjectFile = {
	id: string;
	name: string;
	type: "file";
	content: string;
};

type ProjectFolder = {
	id: string;
	name: string;
	type: "folder";
	children: FileNode[];
};

type FileNode = ProjectFile | ProjectFolder;

const initialFiles: FileNode[] = [
	{
		id: "src-folder",
		name: "src",
		type: "folder",
		children: [
			{
				id: "app-tsx",
				name: "App.tsx",
				type: "file",
				content: `function App() {
  return (
    <main>
      <h1>Welcome to Syncode</h1>
    </main>
  );
}

export default App;
`,
			},
			{
				id: "main-tsx",
				name: "main.tsx",
				type: "file",
				content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
			},
			{
				id: "index-css",
				name: "index.css",
				type: "file",
				content: `body {
  margin: 0;
  background-color: #181818;
  color: white;
}
`,
			},
		],
	},
	{
		id: "main-python",
		name: "main.py",
		type: "file",
		content: `print("Hello from Python")
`,
	},
	{
		id: "main-cpp",
		name: "main.cpp",
		type: "file",
		content: `#include <iostream>

int main() {
    std::cout << "Hello from C++" << std::endl;
    return 0;
}
`,
	},
	{
		id: "package-json",
		name: "package.json",
		type: "file",
		content: `{
  "name": "syncode",
  "version": "1.0.0"
}
`,
	},
];

function getLanguageFromFileName(fileName: string): SupportedLanguage {
	const extension = fileName.split(".").pop()?.toLowerCase();

	switch (extension) {
		case "js":
		case "jsx":
			return "javascript";

		case "ts":
		case "tsx":
			return "typescript";

		case "py":
			return "python";

		case "java":
			return "java";

		case "c":
			return "c";

		case "cpp":
		case "cc":
		case "cxx":
			return "cpp";

		case "css":
			return "css";

		case "json":
			return "json";

		case "md":
			return "markdown";

		default:
			return "plaintext";
	}
}

function findFileById(
	nodes: FileNode[],
	fileId: string,
): ProjectFile | null {
	for (const node of nodes) {
		if (node.type === "file" && node.id === fileId) {
			return node;
		}

		if (node.type === "folder") {
			const foundFile = findFileById(node.children, fileId);

			if (foundFile) {
				return foundFile;
			}
		}
	}

	return null;
}


function updateFileContent(
	nodes: FileNode[],
	fileId: string,
	newContent: string,
): FileNode[] {
	return nodes.map((node) => {
		if (node.type === "file" && node.id === fileId) {
			return {
				...node,
				content: newContent,
			};
		}

		if (node.type === "folder") {
			return {
				...node,
				children: updateFileContent(
					node.children,
					fileId,
					newContent,
				),
			};
		}

		return node;
	});
}




function App() {
	const [projectFiles, setProjectFiles] =
		useState<FileNode[]>(initialFiles);

	const [activeFileId, setActiveFileId] =
		useState("app-tsx");

	const [openFolders, setOpenFolders] =
		useState<Set<string>>(
			() => new Set(["src-folder"]),
		);

	const activeFile = findFileById(
		projectFiles,
		activeFileId,
	);

	const activeLanguage = activeFile
		? getLanguageFromFileName(activeFile.name)
		: "plaintext";

	const handleFolderToggle = (folderId: string) => {
		setOpenFolders((currentFolders) => {
			const updatedFolders = new Set(currentFolders);

			if (updatedFolders.has(folderId)) {
				updatedFolders.delete(folderId);
			} else {
				updatedFolders.add(folderId);
			}

			return updatedFolders;
		});
	};

	const handleCodeChange = (
		value: string | undefined,
	) => {
		if (!activeFile) {
			return;
		}

		setProjectFiles((currentFiles) =>
			updateFileContent(
				currentFiles,
				activeFile.id,
				value ?? "",
			),
		);
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden bg-[#181818] text-[#cccccc]">
			<header className="flex h-9 shrink-0 items-center border-b border-[#2b2b2b] bg-[#181818] px-3 text-sm">
				<div className="flex items-center gap-4">
					<span className="font-semibold text-blue-400">S</span>
					<button className="text-[#cccccc] hover:text-white">File</button>
					<button className="text-[#cccccc] hover:text-white">Edit</button>
					<button className="text-[#cccccc] hover:text-white">
						Selection
					</button>
					<button className="text-[#cccccc] hover:text-white">View</button>
					<button className="text-[#cccccc] hover:text-white">Run</button>
					<button className="text-[#cccccc] hover:text-white">Terminal</button>
				</div>

				<div className="absolute left-1/2 -translate-x-1/2 text-xs text-[#9d9d9d]">
					Syncode — Real-time Collaborative Editor
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<aside className="flex w-12 shrink-0 flex-col items-center border-r border-[#2b2b2b] bg-[#181818] py-2">
					<ActivityButton label="Files" symbol="▱" active />
					<ActivityButton label="Search" symbol="⌕" />
					<ActivityButton label="Source Control" symbol="⑂" />
					<ActivityButton label="Extensions" symbol="▦" />

					<div className="flex-1" />

					<ActivityButton label="Account" symbol="◯" />
					<ActivityButton label="Settings" symbol="⚙" />
				</aside>

				<aside className="w-60 shrink-0 border-r border-[#2b2b2b] bg-[#1f1f1f]">
					<div className="flex h-9 items-center px-4 text-[11px] uppercase tracking-wide text-[#bbbbbb]">
						Explorer
					</div>

					<div className="flex h-6 items-center px-2 text-xs font-bold text-[#dddddd]">
						<span className="mr-1 text-[10px]">▼</span>
						SYNCODE
					</div>

					<div className="mt-1">
						{projectFiles.map((node) => (
							<FileTreeItem
								key={node.id}
								node={node}
								depth={0}
								activeFileId={activeFileId}
								openFolders={openFolders}
								onToggleFolder={handleFolderToggle}
								onSelectFile={setActiveFileId}
							/>
						))}
					</div>
				</aside>

				<main className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
					<div className="flex h-9 shrink-0 border-b border-[#2b2b2b] bg-[#181818]">
						<button className="flex h-full items-center gap-2 border-r border-t-2 border-r-[#2b2b2b] border-t-blue-500 bg-[#1e1e1e] px-4 text-xs text-white">
							<span className="text-blue-400">
								{getFileBadge(activeFile?.name ?? "")}
							</span>

							{activeFile?.name ?? "No file selected"}
						</button>

						<button className="flex h-full items-center gap-2 border-r border-[#2b2b2b] px-4 text-xs text-[#aaaaaa] hover:bg-[#202020]">
							<span className="text-blue-400">TS</span>
							main.tsx
						</button>
					</div>

					<div className="flex min-h-0 flex-1 flex-col">
						<div className="min-h-0 flex-1">
							<Editor
								height="100%"
								path={activeFile?.id}
								language={activeLanguage}
								theme="vs-dark"
								value={activeFile?.content ?? ""}
								onChange={handleCodeChange}
								options={{
									fontSize: 14,
									minimap: {
										enabled: true,
									},
									automaticLayout: true,
									scrollBeyondLastLine: false,
									tabSize: 2,
									padding: {
										top: 16,
									},
								}}
							/>
						</div>

						<section className="h-44 shrink-0 border-t border-[#2b2b2b] bg-[#181818]">
							<div className="flex h-9 items-center gap-6 border-b border-[#2b2b2b] px-4 text-[11px] uppercase">
								<button className="h-full border-b border-white text-white">
									Terminal
								</button>
								<button className="text-[#999999] hover:text-white">
									Problems
								</button>
								<button className="text-[#999999] hover:text-white">
									Output
								</button>
							</div>

							<div className="p-3 font-mono text-xs text-[#cccccc]">
								<p>
									<span className="text-green-400">PS</span>{" "}
									C:\Projects\syncode&gt;
								</p>
								<p className="mt-2">
									<span className="text-green-400">➜</span>{" "}
									<span className="text-blue-400">Local:</span>{" "}
									http://localhost:5173/
								</p>
							</div>
						</section>
					</div>
				</main>
			</div>

			<footer className="flex h-6 shrink-0 items-center justify-between bg-[#007acc] px-2 text-[11px] text-white">
				<div className="flex items-center gap-4">
					<span>⑂ main</span>
					<span>✓ 0</span>
					<span>⚠ 0</span>
				</div>

				<div className="flex items-center gap-4">
					<span>characters</span>
					<span>Spaces: 2</span>
					<span>UTF-8</span>
					<span>{activeLanguage}</span>
					<span>Live Share</span>
				</div>
			</footer>
		</div>
	);
}

type ActivityButtonProps = {
	label: string;
	symbol: string;
	active?: boolean;
};

function ActivityButton({
	label,
	symbol,
	active = false,
}: ActivityButtonProps) {
	return (
		<button
			title={label}
			className={`relative flex h-12 w-full items-center justify-center text-2xl transition-colors ${active
				? "text-white"
				: "text-[#858585] hover:text-white"
				}`}
		>
			{active && (
				<span className="absolute left-0 h-full w-0.5 bg-blue-500" />
			)}

			<span>{symbol}</span>
		</button>
	);
}
type FileTreeItemProps = {
	node: FileNode;
	depth: number;
	activeFileId: string;
	openFolders: Set<string>;
	onToggleFolder: (folderId: string) => void;
	onSelectFile: (fileId: string) => void;
};

function getFileBadge(fileName: string): string {
	const language = getLanguageFromFileName(fileName);

	switch (language) {
		case "javascript":
			return "JS";

		case "typescript":
			return "TS";

		case "python":
			return "PY";

		case "java":
			return "JV";

		case "c":
			return "C";

		case "cpp":
			return "C++";

		case "css":
			return "#";

		case "json":
			return "{}";

		case "markdown":
			return "MD";

		default:
			return "◇";
	}
}

function FileTreeItem({
	node,
	depth,
	activeFileId,
	openFolders,
	onToggleFolder,
	onSelectFile,
}: FileTreeItemProps) {
	const paddingLeft = 8 + depth * 16;

	if (node.type === "folder") {
		const isOpen = openFolders.has(node.id);

		return (
			<div>
				<button
					onClick={() => onToggleFolder(node.id)}
					style={{ paddingLeft }}
					className="flex h-6 w-full items-center gap-1 text-left text-xs text-[#cccccc] hover:bg-[#2a2d2e]"
				>
					<span className="w-4 text-[9px]">
						{isOpen ? "▼" : "▶"}
					</span>

					<span>{node.name}</span>
				</button>

				{isOpen && (
					<div>
						{node.children.map((childNode) => (
							<FileTreeItem
								key={childNode.id}
								node={childNode}
								depth={depth + 1}
								activeFileId={activeFileId}
								openFolders={openFolders}
								onToggleFolder={onToggleFolder}
								onSelectFile={onSelectFile}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	const isActive = activeFileId === node.id;

	return (
		<button
			onClick={() => onSelectFile(node.id)}
			style={{ paddingLeft }}
			className={`flex h-6 w-full items-center gap-2 text-left text-xs ${isActive
					? "bg-[#37373d] text-white"
					: "text-[#cccccc] hover:bg-[#2a2d2e]"
				}`}
		>
			<span className="w-6 text-[10px] font-semibold text-blue-400">
				{getFileBadge(node.name)}
			</span>

			<span>{node.name}</span>
		</button>
	);
}

type CodeLineProps = {
	number: number;
	children: React.ReactNode;
};

function CodeLine({ number, children }: CodeLineProps) {
	return (
		<div className="flex min-w-max">
			<span className="mr-6 w-6 select-none text-right text-[#858585]">
				{number}
			</span>

			<code className="whitespace-pre">{children}</code>
		</div>
	);
}


export default App;