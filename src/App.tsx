const files = [
  { name: "src", type: "folder" },
  { name: "App.tsx", type: "typescript", indent: true },
  { name: "main.tsx", type: "typescript", indent: true },
  { name: "index.css", type: "css", indent: true },
  { name: "package.json", type: "json" },
  { name: "README.md", type: "markdown" },
];

function App() {
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
            {files.map((file) => (
              <FileItem
                key={file.name}
                name={file.name}
                type={file.type}
                indent={file.indent}
              />
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          <div className="flex h-9 shrink-0 border-b border-[#2b2b2b] bg-[#181818]">
            <button className="flex h-full items-center gap-2 border-r border-t-2 border-r-[#2b2b2b] border-t-blue-500 bg-[#1e1e1e] px-4 text-xs text-white">
              <span className="text-blue-400">TS</span>
              App.tsx
              <span className="ml-2 text-[#888888]">×</span>
            </button>

            <button className="flex h-full items-center gap-2 border-r border-[#2b2b2b] px-4 text-xs text-[#aaaaaa] hover:bg-[#202020]">
              <span className="text-blue-400">TS</span>
              main.tsx
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-sm leading-6">
              <CodeLine number={1}>
                <span className="text-pink-400">function</span>{" "}
                <span className="text-yellow-200">App</span>
                <span className="text-yellow-300">()</span> {"{"}
              </CodeLine>

              <CodeLine number={2}>
                {"  "}
                <span className="text-pink-400">return</span> (
              </CodeLine>

              <CodeLine number={3}>
                {"    "}
                <span className="text-gray-400">&lt;</span>
                <span className="text-blue-400">main</span>
                <span className="text-gray-400">&gt;</span>
              </CodeLine>

              <CodeLine number={4}>
                {"      "}
                <span className="text-gray-400">&lt;</span>
                <span className="text-blue-400">h1</span>
                <span className="text-gray-400">&gt;</span>
                Syncode
                <span className="text-gray-400">&lt;/</span>
                <span className="text-blue-400">h1</span>
                <span className="text-gray-400">&gt;</span>
              </CodeLine>

              <CodeLine number={5}>
                {"    "}
                <span className="text-gray-400">&lt;/</span>
                <span className="text-blue-400">main</span>
                <span className="text-gray-400">&gt;</span>
              </CodeLine>

              <CodeLine number={6}>{"  "});</CodeLine>
              <CodeLine number={7}>{"}"}</CodeLine>
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
          <span>Ln 1, Col 1</span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
          <span>TypeScript React</span>
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
      className={`relative flex h-12 w-full items-center justify-center text-2xl transition-colors ${
        active
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

type FileItemProps = {
  name: string;
  type: string;
  indent?: boolean;
};

function FileItem({ name, type, indent = false }: FileItemProps) {
  const getFileSymbol = () => {
    if (type === "folder") return "›";
    if (type === "typescript") return "TS";
    if (type === "css") return "#";
    if (type === "json") return "{}";
    return "◇";
  };

  return (
    <button
      className={`flex h-6 w-full items-center gap-2 px-2 text-left text-xs hover:bg-[#2a2d2e] ${
        indent ? "pl-6" : ""
      }`}
    >
      <span
        className={
          type === "typescript"
            ? "text-blue-400"
            : type === "css"
              ? "text-purple-400"
              : type === "json"
                ? "text-yellow-400"
                : "text-[#bbbbbb]"
        }
      >
        {getFileSymbol()}
      </span>

      <span>{name}</span>
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