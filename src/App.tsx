import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Editor from "@monaco-editor/react";
import type { OnMount } from "@monaco-editor/react";

type SupportedLanguage =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "c"
  | "cpp"
  | "csharp"
  | "go"
  | "rust"
  | "ruby"
  | "php"
  | "swift"
  | "kotlin"
  | "scala"
  | "dart"
  | "lua"
  | "perl"
  | "r"
  | "shell"
  | "powershell"
  | "fsharp"
  | "vb"
  | "objective-c"
  | "zig"
  | "nim"
  | "d"
  | "elixir"
  | "erlang"
  | "clojure"
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

type DialogState =
  | {
      mode: "create";
      nodeType: "file" | "folder";
      parentFolderId: string | null;
      value: string;
      error: string;
    }
  | {
      mode: "rename";
      nodeId: string;
      value: string;
      error: string;
    }
  | {
      mode: "delete";
      nodeId: string;
    }
  | null;

type RunState = {
  status: "idle" | "running" | "success" | "error";
  lines: string[];
};

type RunResponse = {
  ok: boolean;
  language: string;
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  error?: string;
};

type RunSyncState = {
  status: "idle" | "pending" | "running";
  requestedBy: string | null;
  votes: string[];
  required: string[];
  activeFileName?: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  files: FileNode[];
  createdAt: number;
  invites: Array<{
    token: string;
    url: string;
    createdAt: number;
    invitedUsername?: string | null;
  }>;
  ownerId: string | null;
  members: string[];
  invitedUserIds: string[];
};

type CollaborationUser = {
  id: string;
  username: string;
  name: string;
  color: string;
  cursor: RemoteCursor | null;
};

type AccountUser = {
  id: string;
  username: string;
  name: string;
  color: string;
};

type AuthState = {
  token: string;
  user: AccountUser;
};

type RemoteCursor = {
  fileId: string;
  lineNumber: number;
  column: number;
};

type CollaborationMessage =
  | {
      type: "hello";
      project: ProjectSummary;
      user: CollaborationUser;
      users: CollaborationUser[];
      runState: RunSyncState;
    }
  | {
      type: "presence";
      users: CollaborationUser[];
    }
  | {
      type: "project:update";
      files: FileNode[];
      senderId: string;
    }
  | {
      type: "cursor:update";
      userId: string;
      cursor: RemoteCursor;
    }
  | {
      type: "error";
      error: string;
    }
  | {
      type: "run:state";
      state: RunSyncState;
    }
  | {
      type: "run:result";
      result: RunResponse;
    };

type MonacoEditor = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];
type MonacoContentWidget = Parameters<MonacoEditor["addContentWidget"]>[0];
type CursorPositionEvent = Parameters<
  Parameters<MonacoEditor["onDidChangeCursorPosition"]>[0]
>[0];

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
    id: "sandbox-js",
    name: "sandbox.js",
    type: "file",
    content: `const total = [2, 4, 6].reduce((sum, value) => sum + value, 0);

console.log("Hello from the safe runner");
console.log({ total });
`,
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
    case "cs":
      return "csharp";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "rb":
      return "ruby";
    case "php":
      return "php";
    case "swift":
      return "swift";
    case "kt":
    case "kts":
      return "kotlin";
    case "scala":
    case "sc":
      return "scala";
    case "dart":
      return "dart";
    case "lua":
      return "lua";
    case "pl":
    case "pm":
      return "perl";
    case "r":
      return "r";
    case "sh":
    case "bash":
      return "shell";
    case "ps1":
      return "powershell";
    case "fs":
    case "fsx":
      return "fsharp";
    case "vb":
      return "vb";
    case "m":
    case "mm":
      return "objective-c";
    case "zig":
      return "zig";
    case "nim":
      return "nim";
    case "d":
      return "d";
    case "ex":
    case "exs":
      return "elixir";
    case "erl":
      return "erlang";
    case "clj":
      return "clojure";
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
    case "csharp":
      return "C#";
    case "go":
      return "GO";
    case "rust":
      return "RS";
    case "ruby":
      return "RB";
    case "php":
      return "PHP";
    case "swift":
      return "SW";
    case "kotlin":
      return "KT";
    case "scala":
      return "SC";
    case "dart":
      return "DART";
    case "lua":
      return "LUA";
    case "perl":
      return "PL";
    case "r":
      return "R";
    case "shell":
      return "SH";
    case "powershell":
      return "PS";
    case "fsharp":
      return "F#";
    case "vb":
      return "VB";
    case "objective-c":
      return "OBJ";
    case "zig":
      return "ZIG";
    case "nim":
      return "NIM";
    case "d":
      return "D";
    case "elixir":
      return "EX";
    case "erlang":
      return "ERL";
    case "clojure":
      return "CLJ";
    case "css":
      return "#";
    case "json":
      return "{}";
    case "markdown":
      return "MD";
    default:
      return "..";
  }
}

function findFileById(nodes: FileNode[], fileId: string): ProjectFile | null {
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

function findNodeById(nodes: FileNode[], nodeId: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.type === "folder") {
      const foundNode = findNodeById(node.children, nodeId);

      if (foundNode) {
        return foundNode;
      }
    }
  }

  return null;
}

function findParentFolderId(
  nodes: FileNode[],
  nodeId: string,
  parentFolderId: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return parentFolderId;
    }

    if (node.type === "folder") {
      const foundParentId = findParentFolderId(
        node.children,
        nodeId,
        node.id,
      );

      if (foundParentId !== null) {
        return foundParentId;
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
        children: updateFileContent(node.children, fileId, newContent),
      };
    }

    return node;
  });
}

function insertNode(
  nodes: FileNode[],
  parentFolderId: string | null,
  newNode: FileNode,
): FileNode[] {
  if (parentFolderId === null) {
    return [...nodes, newNode];
  }

  return nodes.map((node) => {
    if (node.type === "folder" && node.id === parentFolderId) {
      return {
        ...node,
        children: [...node.children, newNode],
      };
    }

    if (node.type === "folder") {
      return {
        ...node,
        children: insertNode(node.children, parentFolderId, newNode),
      };
    }

    return node;
  });
}

function renameNodeById(
  nodes: FileNode[],
  nodeId: string,
  newName: string,
): FileNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        name: newName,
      };
    }

    if (node.type === "folder") {
      return {
        ...node,
        children: renameNodeById(node.children, nodeId, newName),
      };
    }

    return node;
  });
}

function removeNodeById(nodes: FileNode[], nodeId: string): FileNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.type === "folder") {
        return {
          ...node,
          children: removeNodeById(node.children, nodeId),
        };
      }

      return node;
    });
}

function getNodesInsideParent(
  nodes: FileNode[],
  parentFolderId: string | null,
): FileNode[] {
  if (parentFolderId === null) {
    return nodes;
  }

  const parentNode = findNodeById(nodes, parentFolderId);

  if (parentNode?.type === "folder") {
    return parentNode.children;
  }

  return [];
}

function collectFileIds(node: FileNode): string[] {
  if (node.type === "file") {
    return [node.id];
  }

  return node.children.flatMap((childNode) => collectFileIds(childNode));
}

function collectNodeIds(node: FileNode): string[] {
  if (node.type === "file") {
    return [node.id];
  }

  return [
    node.id,
    ...node.children.flatMap((childNode) => collectNodeIds(childNode)),
  ];
}

function createNodeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function findFirstFileId(nodes: FileNode[]): string | null {
  for (const node of nodes) {
    if (node.type === "file") {
      return node.id;
    }

    const nestedFileId = findFirstFileId(node.children);

    if (nestedFileId) {
      return nestedFileId;
    }
  }

  return null;
}

function getSavedAuth() {
  const savedAuth = window.localStorage.getItem("syncode-auth");

  if (savedAuth) {
    return JSON.parse(savedAuth) as AuthState;
  }

  return null;
}

function getCursorClassId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatRunOutput(result: RunResponse) {
  const outputLines = [
    `Language: ${result.language}`,
    `Command: ${result.command}`,
  ];

  if (result.stdout.trim()) {
    outputLines.push("", "stdout:", result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    outputLines.push("", "stderr:", result.stderr.trimEnd());
  }

  if (result.error) {
    outputLines.push("", result.error);
  }

  outputLines.push(
    "",
    result.timedOut
      ? "Stopped after the execution timeout."
      : `Exited with code ${result.exitCode ?? "unknown"}.`,
  );

  return outputLines;
}

function App() {
  const [projectFiles, setProjectFiles] = useState<FileNode[]>(initialFiles);
  const [activeFileId, setActiveFileId] = useState<string | null>("app-tsx");
  const [openFileIds, setOpenFileIds] = useState<string[]>(["app-tsx"]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("app-tsx");
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(["src-folder"]),
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaborationUser[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");
  const [auth, setAuth] = useState<AuthState | null>(() => getSavedAuth());
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authForm, setAuthForm] = useState({
    username: "",
    name: "",
    password: "",
  });
  const [authError, setAuthError] = useState("");
  const [inviteToken] = useState<string | null>(() => {
    const currentUrl = new URL(window.location.href);

    return currentUrl.searchParams.get("inviteToken") ??
      currentUrl.searchParams.get("token") ??
      currentUrl.pathname.match(/^\/invite\/([^/]+)/)?.[1] ??
      null;
  });
  const [connectionStatus, setConnectionStatus] =
    useState<"connecting" | "online" | "offline">("connecting");
  const [runState, setRunState] = useState<RunState>({
    status: "idle",
    lines: [
      "Virtual runner ready.",
      "Runs happen in a temporary project folder with a timeout.",
    ],
  });
  const [runSyncState, setRunSyncState] = useState<RunSyncState>({
    status: "idle",
    requestedBy: null,
    votes: [],
    required: [],
  });
  const [localCursor, setLocalCursor] = useState<RemoteCursor | null>(null);
  const clientUser = auth?.user;
  const wsRef = useRef<WebSocket | null>(null);
  const suppressProjectBroadcastRef = useRef(false);
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);
  const remoteDecorationsRef = useRef<string[]>([]);
  const remoteWidgetsRef = useRef<MonacoContentWidget[]>([]);
  const activeFileIdRef = useRef<string | null>("app-tsx");

  const activeFile = activeFileId
    ? findFileById(projectFiles, activeFileId)
    : null;

  const selectedNode = selectedNodeId
    ? findNodeById(projectFiles, selectedNodeId)
    : null;

  const activeLanguage = activeFile
    ? getLanguageFromFileName(activeFile.name)
    : "plaintext";

  const openFiles = openFileIds
    .map((fileId) => findFileById(projectFiles, fileId))
    .filter((file): file is ProjectFile => file !== null);
  const hasApprovedRun = clientUser
    ? runSyncState.votes.includes(clientUser.id)
    : false;
  const pendingRunCount = `${runSyncState.votes.length}/${Math.max(
    runSyncState.required.length,
    1,
  )}`;
  const isEditorLocked = runSyncState.status === "running";

  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  useEffect(() => {
    const loadProjects = async () => {
      if (!auth) {
        return;
      }

      try {
        if (inviteToken) {
          await fetch("/api/invites/accept", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              token: inviteToken,
            }),
          });
        }

        const response = await fetch(
          `/api/projects${inviteToken ? `?inviteToken=${encodeURIComponent(inviteToken)}` : ""}`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          },
        );
        const data = (await response.json()) as {
          projects: ProjectSummary[];
          defaultProjectId: string | null;
        };
        const firstProject = data.projects[0];

        setProjects(data.projects);
        setCurrentProjectId(data.defaultProjectId ?? firstProject?.id ?? null);

        if (firstProject) {
          setProjectFiles(firstProject.files);
          const firstFileId = findFirstFileId(firstProject.files);
          setActiveFileId(firstFileId);
          setSelectedNodeId(firstFileId);
          setOpenFileIds(firstFileId ? [firstFileId] : []);
        }
      } catch {
        setConnectionStatus("offline");
      }
    };

    void loadProjects();
  }, [auth, inviteToken]);

  useEffect(() => {
    if (!currentProjectId || !auth || !clientUser) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/collab?projectId=${currentProjectId}&token=${encodeURIComponent(auth.token)}${inviteToken ? `&inviteToken=${encodeURIComponent(inviteToken)}` : ""}`,
    );

    wsRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus("online");
    };

    socket.onclose = () => {
      setConnectionStatus("offline");
    };

    socket.onerror = () => {
      setConnectionStatus("offline");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as CollaborationMessage;

      if (message.type === "hello") {
        suppressProjectBroadcastRef.current = true;
        setProjectFiles(message.project.files);
        setProjects((currentProjects) => {
          const others = currentProjects.filter(
            (project) => project.id !== message.project.id,
          );

          return [message.project, ...others];
        });
        setCollaborators(message.users);
        setRunSyncState(message.runState);
        const firstFileId = findFirstFileId(message.project.files);
        setActiveFileId(firstFileId);
        setSelectedNodeId(firstFileId);
        setOpenFileIds(firstFileId ? [firstFileId] : []);
        return;
      }

      if (message.type === "presence") {
        setCollaborators(message.users);
        return;
      }

      if (message.type === "project:update") {
        suppressProjectBroadcastRef.current = true;
        setProjectFiles(message.files);
        return;
      }

      if (message.type === "cursor:update") {
        setCollaborators((currentUsers) =>
          currentUsers.map((user) =>
            user.id === message.userId
              ? {
                  ...user,
                  cursor: message.cursor,
                }
              : user,
          ),
        );
        return;
      }

      if (message.type === "run:state") {
        setRunSyncState(message.state);

        if (message.state.status === "pending") {
          setRunState({
            status: "idle",
            lines: [
              `Run requested for ${message.state.activeFileName ?? "the active file"}.`,
              `${message.state.votes.length}/${message.state.required.length} collaborators ready.`,
            ],
          });
        }

        if (message.state.status === "running") {
          setRunState({
            status: "running",
            lines: [
              `All collaborators approved. Running ${message.state.activeFileName ?? "the active file"}...`,
            ],
          });
        }
        return;
      }

      if (message.type === "run:result") {
        setRunState({
          status: message.result.ok ? "success" : "error",
          lines: formatRunOutput(message.result),
        });
      }
    };

    return () => {
      socket.close();
    };
  }, [auth, clientUser, currentProjectId, inviteToken]);

  useEffect(() => {
    if (suppressProjectBroadcastRef.current) {
      suppressProjectBroadcastRef.current = false;
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "project:update",
          files: projectFiles,
        }),
      );
    }
  }, [projectFiles]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor || !monaco || !clientUser) {
      return;
    }

    const remoteUsers = collaborators
      .filter((user) => user.id !== clientUser.id)
      .filter((user) => user.cursor?.fileId === activeFileId)
      .filter(
        (user) =>
          !localCursor ||
          !user.cursor ||
          user.cursor.fileId !== localCursor.fileId ||
          user.cursor.lineNumber !== localCursor.lineNumber ||
          user.cursor.column !== localCursor.column,
      );

    const styleId = "syncode-remote-cursor-styles";
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = remoteUsers
      .map((user) => {
        const classId = getCursorClassId(user.id);

        return `
.remote-cursor-${classId} { border-left-color: ${user.color}; }
.remote-cursor-bubble-${classId} { background: ${user.color}; }
`;
      })
      .join("\n");

    const remoteCursorDecorations = remoteUsers.map((user) => {
      const classId = getCursorClassId(user.id);

      return {
        range: new monaco.Range(
          user.cursor?.lineNumber ?? 1,
          user.cursor?.column ?? 1,
          user.cursor?.lineNumber ?? 1,
          user.cursor?.column ?? 1,
        ),
        options: {
          className: `remote-cursor remote-cursor-${classId}`,
          hoverMessage: {
            value: `${user.name}'s cursor`,
          },
          stickiness: 1,
        },
      };
    });

    for (const widget of remoteWidgetsRef.current) {
      editor.removeContentWidget(widget);
    }

    remoteWidgetsRef.current = remoteUsers.map((user) => {
      const classId = getCursorClassId(user.id);
      const widgetNode = document.createElement("div");

      widgetNode.className = `remote-cursor-bubble remote-cursor-bubble-${classId}`;
      widgetNode.textContent = user.name;

      const widget: MonacoContentWidget = {
        getId: () => `remote-cursor-bubble-${user.id}`,
        getDomNode: () => widgetNode,
        getPosition: () => ({
          position: {
            lineNumber: user.cursor?.lineNumber ?? 1,
            column: user.cursor?.column ?? 1,
          },
          preference: [
            monaco.editor.ContentWidgetPositionPreference.EXACT,
          ],
        }),
      };

      editor.addContentWidget(widget);
      return widget;
    });

    remoteDecorationsRef.current = editor.deltaDecorations(
      remoteDecorationsRef.current,
      remoteCursorDecorations,
    );
  }, [activeFileId, clientUser, collaborators, localCursor]);

  const sendCursorPosition = (lineNumber: number, column: number) => {
    const fileId = activeFileIdRef.current;

    if (!fileId) {
      return;
    }

    const cursor = {
      fileId,
      lineNumber,
      column,
    };

    setLocalCursor(cursor);

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "cursor:update",
        cursor,
      }),
    );
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((event: CursorPositionEvent) => {
      sendCursorPosition(event.position.lineNumber, event.position.column);
    });
  };

  const getTargetParentFolderId = () => {
    if (!selectedNodeId || !selectedNode) {
      return null;
    }

    if (selectedNode.type === "folder") {
      return selectedNode.id;
    }

    return findParentFolderId(projectFiles, selectedNodeId);
  };

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

  const handleOpenFile = (fileId: string) => {
    setActiveFileId(fileId);
    setSelectedNodeId(fileId);

    setOpenFileIds((currentFileIds) => {
      if (currentFileIds.includes(fileId)) {
        return currentFileIds;
      }

      return [...currentFileIds, fileId];
    });
  };

  const handleCloseTab = (fileId: string) => {
    const closingTabIndex = openFileIds.indexOf(fileId);
    const remainingFileIds = openFileIds.filter(
      (openFileId) => openFileId !== fileId,
    );

    setOpenFileIds(remainingFileIds);

    if (activeFileId === fileId) {
      const nextActiveId =
        remainingFileIds[closingTabIndex] ??
        remainingFileIds[closingTabIndex - 1] ??
        null;

      setActiveFileId(nextActiveId);

      if (nextActiveId) {
        setSelectedNodeId(nextActiveId);
      }
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (!activeFile) {
      return;
    }

    setProjectFiles((currentFiles) =>
      updateFileContent(currentFiles, activeFile.id, value ?? ""),
    );
  };

  const handleRunActiveFile = async () => {
    if (!activeFile) {
      setRunState({
        status: "error",
        lines: ["Open a file before running code."],
      });
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "run:vote",
          files: projectFiles,
          activeFileId: activeFile.id,
        }),
      );

      setRunState({
        status: "idle",
        lines: [
          `Ready to run ${activeFile.name}.`,
          "Waiting for the other collaborators to click Run.",
        ],
      });
      return;
    }

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: projectFiles,
          activeFileId: activeFile.id,
        }),
      });
      const result = (await response.json()) as RunResponse;

      setRunState({
        status: result.ok ? "success" : "error",
        lines: formatRunOutput(result),
      });
    } catch (error) {
      setRunState({
        status: "error",
        lines: ["Runner API is not available.", error instanceof Error ? error.message : String(error)],
      });
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");

    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authForm),
      });
      const data = (await response.json()) as AuthState & {
        error?: string;
      };

      if (!response.ok) {
        setAuthError(data.error ?? "Unable to sign in.");
        return;
      }

      const nextAuth = {
        token: data.token,
        user: data.user,
      };

      window.localStorage.setItem("syncode-auth", JSON.stringify(nextAuth));
      setAuth(nextAuth);
      setAuthForm({
        username: "",
        name: "",
        password: "",
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleSignOut = () => {
    window.localStorage.removeItem("syncode-auth");
    setAuth(null);
    setProjects([]);
    setCurrentProjectId(null);
    setCollaborators([]);
    wsRef.current?.close();
  };

  const handleCreateProject = async () => {
    if (!auth) {
      setAuthError("Sign in before creating a project.");
      return;
    }

    const projectName = window.prompt("Project name:", "New Project")?.trim();

    if (!projectName) {
      return;
    }

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        name: projectName,
      }),
    });
    const data = (await response.json()) as {
      project: ProjectSummary;
    };

    setProjects((currentProjects) => [data.project, ...currentProjects]);
    setCurrentProjectId(data.project.id);
    setConnectionStatus("connecting");
    setInviteLink("");
  };

  const handleCreateInvite = async () => {
    if (!currentProjectId || !auth) {
      return;
    }

    const response = await fetch("/api/invites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify({
        projectId: currentProjectId,
        username: inviteUsername.trim() || undefined,
      }),
    });
    const data = (await response.json()) as {
      invite: {
        url: string;
      };
      error?: string;
    };

    if (!response.ok) {
      setInviteLink(data.error ?? "Could not create invite.");
      return;
    }

    const link = `${window.location.origin}${data.invite.url}`;

    setInviteLink(link);
    setInviteUsername("");
    await navigator.clipboard?.writeText(link);
  };

  const handleProjectChange = (projectId: string) => {
    const nextProject = projects.find((project) => project.id === projectId);

    setCurrentProjectId(projectId);
    setConnectionStatus("connecting");
    setInviteLink("");

    if (nextProject) {
      suppressProjectBroadcastRef.current = true;
      setProjectFiles(nextProject.files);
      const firstFileId = findFirstFileId(nextProject.files);
      setActiveFileId(firstFileId);
      setSelectedNodeId(firstFileId);
      setOpenFileIds(firstFileId ? [firstFileId] : []);
    }
  };

  const startCreateNode = (nodeType: "file" | "folder") => {
    setDialog({
      mode: "create",
      nodeType,
      parentFolderId: getTargetParentFolderId(),
      value: nodeType === "file" ? "untitled.ts" : "new-folder",
      error: "",
    });
  };

  const startRenameNode = () => {
    if (!selectedNode) {
      return;
    }

    setDialog({
      mode: "rename",
      nodeId: selectedNode.id,
      value: selectedNode.name,
      error: "",
    });
  };

  const startDeleteNode = () => {
    if (!selectedNode) {
      return;
    }

    setDialog({
      mode: "delete",
      nodeId: selectedNode.id,
    });
  };

  const setDialogValue = (value: string) => {
    setDialog((currentDialog) => {
      if (!currentDialog || currentDialog.mode === "delete") {
        return currentDialog;
      }

      return {
        ...currentDialog,
        value,
        error: "",
      };
    });
  };

  const setDialogError = (error: string) => {
    setDialog((currentDialog) => {
      if (!currentDialog || currentDialog.mode === "delete") {
        return currentDialog;
      }

      return {
        ...currentDialog,
        error,
      };
    });
  };

  const handleDialogSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!dialog || dialog.mode === "delete") {
      return;
    }

    const newName = dialog.value.trim();

    if (!newName) {
      setDialogError("Name is required.");
      return;
    }

    if (/[\\/]/.test(newName)) {
      setDialogError("Use a simple name without slashes.");
      return;
    }

    if (dialog.mode === "create") {
      const siblingNodes = getNodesInsideParent(
        projectFiles,
        dialog.parentFolderId,
      );
      const nameAlreadyExists = siblingNodes.some(
        (node) => node.name.toLowerCase() === newName.toLowerCase(),
      );

      if (nameAlreadyExists) {
        setDialogError("An item with that name already exists here.");
        return;
      }

      if (dialog.nodeType === "file") {
        const newFile: ProjectFile = {
          id: createNodeId("file"),
          name: newName,
          type: "file",
          content: "",
        };

        setProjectFiles((currentFiles) =>
          insertNode(currentFiles, dialog.parentFolderId, newFile),
        );

        setSelectedNodeId(newFile.id);
        setActiveFileId(newFile.id);
        setOpenFileIds((currentFileIds) => [...currentFileIds, newFile.id]);
      } else {
        const newFolder: ProjectFolder = {
          id: createNodeId("folder"),
          name: newName,
          type: "folder",
          children: [],
        };

        setProjectFiles((currentFiles) =>
          insertNode(currentFiles, dialog.parentFolderId, newFolder),
        );

        setSelectedNodeId(newFolder.id);
        setOpenFolders((currentFolders) => {
          const updatedFolders = new Set(currentFolders);
          updatedFolders.add(newFolder.id);
          return updatedFolders;
        });
      }

      const parentFolderId = dialog.parentFolderId;

      if (parentFolderId) {
        setOpenFolders((currentFolders) => {
          const updatedFolders = new Set(currentFolders);
          updatedFolders.add(parentFolderId);
          return updatedFolders;
        });
      }

      setDialog(null);
      return;
    }

    const renamedNode = findNodeById(projectFiles, dialog.nodeId);

    if (!renamedNode) {
      setDialog(null);
      return;
    }

    if (newName === renamedNode.name) {
      setDialog(null);
      return;
    }

    const parentFolderId = findParentFolderId(projectFiles, renamedNode.id);
    const siblingNodes = getNodesInsideParent(projectFiles, parentFolderId);
    const nameAlreadyExists = siblingNodes.some(
      (node) =>
        node.id !== renamedNode.id &&
        node.name.toLowerCase() === newName.toLowerCase(),
    );

    if (nameAlreadyExists) {
      setDialogError("An item with that name already exists here.");
      return;
    }

    setProjectFiles((currentFiles) =>
      renameNodeById(currentFiles, renamedNode.id, newName),
    );
    setDialog(null);
  };

  const confirmDeleteNode = () => {
    if (!dialog || dialog.mode !== "delete") {
      return;
    }

    const selectedNodeForDelete = findNodeById(projectFiles, dialog.nodeId);

    if (!selectedNodeForDelete) {
      setDialog(null);
      return;
    }

    const fileIdsToRemove = new Set(collectFileIds(selectedNodeForDelete));
    const nodeIdsToRemove = new Set(collectNodeIds(selectedNodeForDelete));
    const remainingFileIds = openFileIds.filter(
      (fileId) => !fileIdsToRemove.has(fileId),
    );

    setProjectFiles((currentFiles) =>
      removeNodeById(currentFiles, selectedNodeForDelete.id),
    );
    setOpenFileIds(remainingFileIds);

    if (activeFileId && fileIdsToRemove.has(activeFileId)) {
      const nextActiveId = remainingFileIds[remainingFileIds.length - 1] ?? null;
      setActiveFileId(nextActiveId);
      setSelectedNodeId(nextActiveId);
    } else {
      setSelectedNodeId(null);
    }

    setOpenFolders((currentFolders) => {
      const updatedFolders = new Set(currentFolders);

      for (const nodeId of nodeIdsToRemove) {
        updatedFolders.delete(nodeId);
      }

      return updatedFolders;
    });

    setDialog(null);
  };

  const dialogNode =
    dialog?.mode === "rename" || dialog?.mode === "delete"
      ? findNodeById(projectFiles, dialog.nodeId)
      : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#181818] text-[#cccccc]">
      {!auth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181818] px-4">
          <form
            onSubmit={handleAuthSubmit}
            className="w-full max-w-sm rounded-lg border border-[#343434] bg-[#252526] shadow-2xl"
          >
            <div className="border-b border-[#343434] px-5 py-4">
              <h1 className="text-base font-semibold text-white">
                {authMode === "signin" ? "Sign in to Syncode" : "Create your Syncode account"}
              </h1>
              <p className="mt-1 text-xs text-[#a7a7a7]">
                Collaborators, invites, cursors, and project access use this account.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium text-[#cfcfcf]">
                Username
                <input
                  value={authForm.username}
                  onChange={(event) =>
                    setAuthForm((currentForm) => ({
                      ...currentForm,
                      username: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded border border-[#4a4a4a] bg-[#1e1e1e] px-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>

              {authMode === "signup" && (
                <label className="block text-xs font-medium text-[#cfcfcf]">
                  Display name
                  <input
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded border border-[#4a4a4a] bg-[#1e1e1e] px-3 text-sm text-white outline-none focus:border-blue-500"
                  />
                </label>
              )}

              <label className="block text-xs font-medium text-[#cfcfcf]">
                Password {authMode === "signup" ? "(8+ characters)" : ""}
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((currentForm) => ({
                      ...currentForm,
                      password: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded border border-[#4a4a4a] bg-[#1e1e1e] px-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>

              {inviteToken && (
                <div className="rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
                  Invite link detected. Sign in or create an account to join the project.
                </div>
              )}

              {authError && <p className="text-xs text-red-300">{authError}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-[#343434] px-5 py-3">
              <button
                type="button"
                onClick={() =>
                  setAuthMode((currentMode) =>
                    currentMode === "signin" ? "signup" : "signin",
                  )
                }
                className="text-xs text-[#bbbbbb] hover:text-white"
              >
                {authMode === "signin" ? "Create account" : "Sign in instead"}
              </button>

              <button
                type="submit"
                className="rounded border border-blue-500/50 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/30"
              >
                {authMode === "signin" ? "Sign In" : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 border-r border-[#2b2b2b] bg-[#1f1f1f]">
          <div className="border-b border-[#2b2b2b] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Syncode</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9d9d9d]">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connectionStatus === "online"
                        ? "bg-green-400"
                        : connectionStatus === "connecting"
                          ? "bg-yellow-300"
                          : "bg-red-400"
                    }`}
                  />
                  {connectionStatus}
                </div>
                {clientUser && (
                  <div className="mt-1 truncate text-[11px] text-[#bbbbbb]">
                    {clientUser.name} @{clientUser.username}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="rounded border border-[#3d3d3d] px-2 py-1 text-xs font-semibold text-[#dddddd] hover:bg-[#2f2f2f] hover:text-white"
                >
                  New Project
                </button>
                {auth && (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded border border-[#3d3d3d] px-2 py-1 text-xs text-[#bbbbbb] hover:bg-[#2f2f2f] hover:text-white"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>

            <select
              value={currentProjectId ?? ""}
              onChange={(event) => handleProjectChange(event.target.value)}
              className="mt-3 h-8 w-full rounded border border-[#3b3b3b] bg-[#181818] px-2 text-xs text-white outline-none focus:border-blue-500"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-b border-[#2b2b2b] px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#bbbbbb]">
                Collaboration
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={inviteUsername}
                onChange={(event) => setInviteUsername(event.target.value)}
                placeholder="username or blank for link"
                className="h-8 min-w-0 flex-1 rounded border border-[#3b3b3b] bg-[#181818] px-2 text-xs text-white outline-none placeholder:text-[#666666] focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleCreateInvite}
                className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-100 hover:bg-blue-500/20"
              >
                Invite
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {collaborators.map((user) => (
                <div
                  key={user.id}
                  title={user.cursor ? `${user.name}: ${user.cursor.lineNumber}:${user.cursor.column}` : user.name}
                  className="flex items-center gap-1.5 rounded border border-[#353535] bg-[#252525] px-2 py-1 text-xs text-[#dddddd]"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="max-w-24 truncate">
                    {user.id === clientUser?.id ? "You" : user.name}
                  </span>
                </div>
              ))}
            </div>

            {inviteLink && (
              <div className="mt-3 truncate rounded border border-[#333333] bg-[#181818] px-2 py-1.5 text-[11px] text-[#9d9d9d]">
                {inviteLink}
              </div>
            )}
          </div>

          <div className="flex h-10 items-center justify-between border-b border-[#2b2b2b] px-3 text-[11px] uppercase tracking-wide text-[#bbbbbb]">
            <span>Explorer</span>

            <div className="flex items-center gap-1">
              <ToolbarButton
                label="New file"
                icon={<FilePlusIcon />}
                onClick={() => startCreateNode("file")}
              />
              <ToolbarButton
                label="New folder"
                icon={<FolderPlusIcon />}
                onClick={() => startCreateNode("folder")}
              />
              <ToolbarButton
                label="Rename"
                icon={<PencilIcon />}
                disabled={!selectedNode}
                onClick={startRenameNode}
              />
              <ToolbarButton
                label="Delete"
                icon={<TrashIcon />}
                disabled={!selectedNode}
                danger
                onClick={startDeleteNode}
              />
            </div>
          </div>

          <div className="border-b border-[#2b2b2b]/70 px-3 py-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[#dddddd]"
              >
                <span className="text-[10px]">v</span>
                <span className="truncate">SYNCODE</span>
              </button>

              <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#9d9d9d]">
                {projectFiles.length}
              </span>
            </div>

            <div className="mt-2 truncate text-[11px] text-[#858585]">
              {selectedNode
                ? `Selected: ${selectedNode.name}`
                : "Select an item to rename or delete"}
            </div>
          </div>

          <div className="mt-1 pb-3">
            {projectFiles.map((node) => (
              <FileTreeItem
                key={node.id}
                node={node}
                depth={0}
                activeFileId={activeFileId}
                selectedNodeId={selectedNodeId}
                openFolders={openFolders}
                onToggleFolder={handleFolderToggle}
                onSelectNode={setSelectedNodeId}
                onOpenFile={handleOpenFile}
              />
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          <div className="flex h-9 shrink-0 items-center border-b border-[#2b2b2b] bg-[#181818]">
            <div className="flex min-w-0 flex-1 overflow-x-auto self-stretch">
              {openFiles.map((file) => {
                const isActive = file.id === activeFileId;

                return (
                  <div
                    key={file.id}
                    className={`flex h-full shrink-0 items-center border-r border-[#2b2b2b] ${
                      isActive
                        ? "border-t-2 border-t-blue-500 bg-[#1e1e1e] text-white"
                        : "text-[#aaaaaa] hover:bg-[#202020]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenFile(file.id)}
                      className="flex h-full items-center gap-2 pl-4 text-xs"
                    >
                      <span className="text-blue-400">{getFileBadge(file.name)}</span>
                      <span>{file.name}</span>
                    </button>

                    <button
                      type="button"
                      title={`Close ${file.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCloseTab(file.id);
                      }}
                      className="mx-2 flex h-5 w-5 items-center justify-center rounded text-sm text-[#888888] hover:bg-[#444444] hover:text-white"
                    >
                      x
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex h-full shrink-0 items-center gap-1 border-l border-[#2b2b2b] px-2">
              {runSyncState.status === "pending" && (
                <div className="mr-1 rounded-full border border-yellow-400/40 bg-yellow-400/15 px-2 py-1 text-[11px] font-semibold text-yellow-100">
                  {hasApprovedRun ? "Ready" : "Run requested"} {pendingRunCount}
                </div>
              )}

              {runSyncState.status === "running" && (
                <div className="mr-1 rounded-full border border-green-400/40 bg-green-400/15 px-2 py-1 text-[11px] font-semibold text-green-100">
                  Running together
                </div>
              )}

              <button
                type="button"
                title={activeFile ? `Run ${activeFile.name}` : "Run active file"}
                aria-label="Run active file"
                onClick={handleRunActiveFile}
                disabled={!activeFile || isEditorLocked}
                className="flex h-7 items-center gap-1.5 rounded border border-transparent px-2 text-xs font-semibold text-green-300 transition-colors hover:border-green-500/40 hover:bg-green-500/15 hover:text-green-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent"
              >
                <PlayIcon />
                <span>{runState.status === "running" ? "Running" : "Run"}</span>
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              {activeFile ? (
                <Editor
                  height="100%"
                  path={`${activeFile.id}/${activeFile.name}`}
                  language={activeLanguage}
                  theme="vs-dark"
                  value={activeFile.content}
                  onChange={handleCodeChange}
                  onMount={handleEditorMount}
                  options={{
                    readOnly: isEditorLocked,
                    readOnlyMessage: {
                      value: "The project is locked while the shared run is finishing.",
                    },
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
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#777777]">
                  Open a file from the explorer
                </div>
              )}
            </div>

            <section className="h-44 shrink-0 border-t border-[#2b2b2b] bg-[#181818]">
              <div className="flex h-9 items-center gap-6 border-b border-[#2b2b2b] px-4 text-[11px] uppercase">
                <button className="h-full border-b border-white text-white">
                  Terminal
                </button>
                <button className="text-[#999999] hover:text-white">Problems</button>
                <button className="text-[#999999] hover:text-white">Output</button>
              </div>

              <div className="flex h-[calc(100%-2.25rem)] flex-col p-3 font-mono text-xs text-[#cccccc]">
                <div className="mb-2 flex items-center justify-between border-b border-[#2b2b2b] pb-2">
                  <p>
                    <span className="text-green-400">PS</span>{" "}
                    C:\Projects\syncode&gt;
                  </p>

                  <button
                    type="button"
                    onClick={handleRunActiveFile}
                    disabled={isEditorLocked}
                    className="rounded border border-[#3d3d3d] px-2 py-1 text-[11px] font-semibold text-[#dddddd] hover:bg-[#2f2f2f] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEditorLocked
                      ? "Running"
                      : runSyncState.status === "pending" && hasApprovedRun
                        ? "Ready"
                        : "Run Active File"}
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {runState.lines.map((line, index) => (
                    <p
                      key={`${line}-${index}`}
                      className={
                        runState.status === "error" &&
                        index === runState.lines.length - 1
                          ? "whitespace-pre-wrap text-red-300"
                          : "whitespace-pre-wrap"
                      }
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="flex h-6 shrink-0 items-center justify-between bg-[#007acc] px-2 text-[11px] text-white">
        <div className="flex items-center gap-4">
          <span>main</span>
          <span>0 errors</span>
          <span>0 warnings</span>
        </div>

        <div className="flex items-center gap-4">
          <span>
            {activeFile
              ? `${activeFile.content.split("\n").length} lines`
              : "No file"}
          </span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
          <span>{activeLanguage}</span>
          <span>Live Share</span>
        </div>
      </footer>

      {dialog && (
        <ActionDialog
          dialog={dialog}
          node={dialogNode}
          parentNode={
            dialog.mode === "create" && dialog.parentFolderId
              ? findNodeById(projectFiles, dialog.parentFolderId)
              : null
          }
          onCancel={() => setDialog(null)}
          onConfirmDelete={confirmDeleteNode}
          onSubmit={handleDialogSubmit}
          onValueChange={setDialogValue}
        />
      )}
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolbarButton({
  label,
  icon,
  danger = false,
  disabled = false,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded border border-transparent px-1.5 text-[#bdbdbd] transition-colors ${
        danger
          ? "hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-200"
          : "hover:border-[#4d4d4d] hover:bg-[#37373d] hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-inherit`}
    >
      {icon}
    </button>
  );
}

type IconProps = {
  className?: string;
};

function IconSvg({ className = "h-4 w-4", children }: IconProps & {
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function FilePlusIcon() {
  return (
    <IconSvg>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 12v5" />
      <path d="M9.5 14.5h5" />
    </IconSvg>
  );
}

function FolderPlusIcon() {
  return (
    <IconSvg>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <path d="M12 10.5v5" />
      <path d="M9.5 13h5" />
    </IconSvg>
  );
}

function PencilIcon() {
  return (
    <IconSvg>
      <path d="m4 20 4.5-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10z" />
      <path d="m13.5 7.5 3 3" />
    </IconSvg>
  );
}

function TrashIcon() {
  return (
    <IconSvg>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </IconSvg>
  );
}

function PlayIcon() {
  return (
    <IconSvg className="h-4 w-4">
      <path d="M8 5v14l11-7z" />
    </IconSvg>
  );
}

type ActionDialogProps = {
  dialog: Exclude<DialogState, null>;
  node: FileNode | null;
  parentNode: FileNode | null;
  onCancel: () => void;
  onConfirmDelete: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValueChange: (value: string) => void;
};

function ActionDialog({
  dialog,
  node,
  parentNode,
  onCancel,
  onConfirmDelete,
  onSubmit,
  onValueChange,
}: ActionDialogProps) {
  if (dialog.mode === "delete") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
        <div className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#252526] shadow-2xl">
          <div className="border-b border-[#343434] px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Delete item</h2>
            <p className="mt-1 text-xs text-[#a7a7a7]">
              This removes the item from the explorer and closes any related tabs.
            </p>
          </div>

          <div className="px-5 py-4">
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
              Delete {node?.type ?? "item"} "{node?.name ?? "selected item"}"?
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#343434] px-5 py-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-[#454545] px-3 py-1.5 text-xs text-[#dddddd] hover:bg-[#333333] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="rounded border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/30"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCreate = dialog.mode === "create";
  const title = isCreate
    ? dialog.nodeType === "file"
      ? "New file"
      : "New folder"
    : "Rename item";
  const targetLabel =
    isCreate && parentNode?.type === "folder"
      ? `Inside ${parentNode.name}`
      : isCreate
        ? "At project root"
        : node?.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#252526] shadow-2xl"
      >
        <div className="border-b border-[#343434] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="mt-1 truncate text-xs text-[#a7a7a7]">{targetLabel}</p>
        </div>

        <div className="px-5 py-4">
          <label className="block text-xs font-medium text-[#cfcfcf]" htmlFor="node-name">
            Name
          </label>
          <input
            id="node-name"
            autoFocus
            value={dialog.value}
            onChange={(event) => onValueChange(event.target.value)}
            className="mt-2 h-9 w-full rounded border border-[#4a4a4a] bg-[#1e1e1e] px-3 text-sm text-white outline-none transition-colors placeholder:text-[#686868] focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          {dialog.error && (
            <p className="mt-2 text-xs text-red-300">{dialog.error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#343434] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[#454545] px-3 py-1.5 text-xs text-[#dddddd] hover:bg-[#333333] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded border border-blue-500/50 bg-blue-500/20 px-3 py-1.5 text-xs font-semibold text-blue-100 hover:bg-blue-500/30"
          >
            {isCreate ? "Create" : "Rename"}
          </button>
        </div>
      </form>
    </div>
  );
}

type FileTreeItemProps = {
  node: FileNode;
  depth: number;
  activeFileId: string | null;
  selectedNodeId: string | null;
  openFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onOpenFile: (fileId: string) => void;
};

function FileTreeItem({
  node,
  depth,
  activeFileId,
  selectedNodeId,
  openFolders,
  onToggleFolder,
  onSelectNode,
  onOpenFile,
}: FileTreeItemProps) {
  const paddingLeft = 10 + depth * 16;
  const isSelected = selectedNodeId === node.id;

  if (node.type === "folder") {
    const isOpen = openFolders.has(node.id);

    return (
      <div>
        <button
          type="button"
          onClick={() => {
            onSelectNode(node.id);
            onToggleFolder(node.id);
          }}
          style={{ paddingLeft }}
          className={`flex h-7 w-full items-center gap-2 pr-2 text-left text-xs hover:bg-[#2a2d2e] ${
            isSelected ? "bg-[#37373d] text-white" : "text-[#cccccc]"
          }`}
        >
          <span className="w-3 text-[10px]">{isOpen ? "v" : ">"}</span>
          <span className="w-5 text-[10px] font-semibold text-amber-300">DIR</span>
          <span className="truncate">{node.name}</span>
        </button>

        {isOpen && (
          <div>
            {node.children.map((childNode) => (
              <FileTreeItem
                key={childNode.id}
                node={childNode}
                depth={depth + 1}
                activeFileId={activeFileId}
                selectedNodeId={selectedNodeId}
                openFolders={openFolders}
                onToggleFolder={onToggleFolder}
                onSelectNode={onSelectNode}
                onOpenFile={onOpenFile}
              />
            ))}

            {node.children.length === 0 && (
              <div
                style={{ paddingLeft: paddingLeft + 34 }}
                className="flex h-7 items-center text-xs text-[#737373]"
              >
                Empty
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFileId === node.id;

  return (
    <button
      type="button"
      onClick={() => {
        onSelectNode(node.id);
        onOpenFile(node.id);
      }}
      style={{ paddingLeft }}
      className={`flex h-7 w-full items-center gap-2 pr-2 text-left text-xs ${
        isActive || isSelected
          ? "bg-[#37373d] text-white"
          : "text-[#cccccc] hover:bg-[#2a2d2e]"
      }`}
    >
      <span className="w-8 text-[10px] font-semibold text-blue-400">
        {getFileBadge(node.name)}
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default App;
