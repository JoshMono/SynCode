import { spawn } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  pbkdf2Sync,
} from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.SYNCODE_RUNNER_PORT ?? 3001);
const MAX_FILES = 150;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const RUN_TIMEOUT_MS = 5000;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const PASSWORD_ITERATIONS = 120_000;
const PASSWORD_KEY_LENGTH = 32;
const executableExtension = process.platform === "win32" ? ".exe" : "";
const projects = new Map();
const sockets = new Set();
const users = new Map();
const sessions = new Map();

function createStarterFiles(projectName = "Untitled Project") {
  return [
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
      <h1>${projectName}</h1>
    </main>
  );
}

export default App;
`,
        },
      ],
    },
    {
      id: "sandbox-js",
      name: "sandbox.js",
      type: "file",
      content: `console.log("Hello from ${projectName}");
`,
    },
  ];
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    color: user.color,
  };
}

function createUser({ username, name, password }) {
  const normalizedUsername = username.trim().toLowerCase();
  const passwordSalt = randomBytes(16).toString("hex");
  const user = {
    id: randomUUID(),
    username: normalizedUsername,
    name: name?.trim() || username.trim(),
    passwordSalt,
    passwordHash: hashPassword(password, passwordSalt),
    color: ["#4ade80", "#60a5fa", "#f472b6", "#facc15", "#a78bfa", "#fb923c"][
      users.size % 6
    ],
  };

  users.set(normalizedUsername, user);
  return user;
}

function hashPassword(password, salt) {
  return pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    "sha256",
  ).toString("hex");
}

function verifyPassword(password, user) {
  const enteredHash = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  const savedHash = Buffer.from(user.passwordHash, "hex");

  return (
    enteredHash.length === savedHash.length &&
    timingSafeEqual(enteredHash, savedHash)
  );
}

function createSession(user) {
  const token = randomBytes(32).toString("base64url");

  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getUserById(userId) {
  for (const user of users.values()) {
    if (user.id === userId) {
      return user;
    }
  }

  return null;
}

function getAuthUser(request) {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length);
  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return getUserById(session.userId);
}

function getUserBySessionToken(token) {
  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  return getUserById(session.userId);
}

function canAccessProject(project, user, inviteToken = null) {
  if (!user) {
    return Boolean(
      inviteToken && project.invites.some((invite) => invite.token === inviteToken),
    );
  }

  return (
    project.ownerId === user.id ||
    project.members.has(user.id) ||
    project.invitedUserIds.has(user.id) ||
    Boolean(inviteToken && project.invites.some((invite) => invite.token === inviteToken))
  );
}

function createProject(name = "Untitled Project", owner = null) {
  const project = {
    id: randomUUID(),
    name,
    ownerId: owner?.id ?? null,
    members: new Set(owner ? [owner.id] : []),
    invitedUserIds: new Set(),
    files: createStarterFiles(name),
    createdAt: Date.now(),
    invites: [],
    cursors: new Map(),
    runSession: null,
  };

  projects.set(project.id, project);
  return project;
}

const defaultProject = createProject("Syncode");

function projectToJson(project) {
  return {
    id: project.id,
    name: project.name,
    files: project.files,
    createdAt: project.createdAt,
    invites: project.invites,
    ownerId: project.ownerId,
    members: [...project.members],
    invitedUserIds: [...project.invitedUserIds],
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendWebSocket(socket, payload) {
  if (socket.destroyed) {
    return;
  }

  const data = Buffer.from(JSON.stringify(payload));
  const header =
    data.length < 126
      ? Buffer.from([0x81, data.length])
      : Buffer.from([0x81, 126, data.length >> 8, data.length & 0xff]);

  socket.write(Buffer.concat([header, data]));
}

function decodeWebSocketFrame(buffer) {
  if (buffer.length < 6) {
    return null;
  }

  const opcode = buffer[0] & 0x0f;

  if (opcode === 0x08) {
    return {
      close: true,
    };
  }

  let offset = 2;
  let length = buffer[1] & 0x7f;

  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    return null;
  }

  const masked = (buffer[1] & 0x80) !== 0;

  if (!masked || buffer.length < offset + 4 + length) {
    return null;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;

  const payload = Buffer.alloc(length);

  for (let index = 0; index < length; index += 1) {
    payload[index] = buffer[offset + index] ^ mask[index % 4];
  }

  return {
    close: false,
    text: payload.toString("utf8"),
  };
}

function broadcastProject(projectId, payload, exceptSocket = null) {
  for (const client of sockets) {
    if (client.projectId === projectId && client !== exceptSocket) {
      sendWebSocket(client.socket, payload);
    }
  }
}

function getPresence(project) {
  return [...sockets]
    .filter((client) => client.projectId === project.id)
    .map((client) => ({
      id: client.user.id,
      name: client.user.name,
      color: client.user.color,
      cursor: project.cursors.get(client.user.id) ?? null,
    }));
}

function getConnectedUserIds(projectId) {
  return new Set(
    [...sockets]
      .filter((client) => client.projectId === projectId)
      .map((client) => client.user.id),
  );
}

function broadcastPresence(project) {
  broadcastProject(project.id, {
    type: "presence",
    users: getPresence(project),
  });
}

function getRunState(project) {
  const connectedUserIds = getConnectedUserIds(project.id);

  if (!project.runSession) {
    return {
      status: "idle",
      requestedBy: null,
      votes: [],
      required: [...connectedUserIds],
    };
  }

  return {
    status: project.runSession.status,
    requestedBy: project.runSession.requestedBy,
    votes: [...project.runSession.votes],
    required: [...connectedUserIds],
    activeFileName: project.runSession.activeFileName,
  };
}

function broadcastRunState(project) {
  broadcastProject(project.id, {
    type: "run:state",
    state: getRunState(project),
  });
}

async function handleSocketMessage(client, message) {
  const project = projects.get(client.projectId);

  if (!project || typeof message !== "object" || message === null) {
    return;
  }

  if (message.type === "project:update" && Array.isArray(message.files)) {
    project.files = message.files;
    broadcastProject(
      project.id,
      {
        type: "project:update",
        files: project.files,
        senderId: client.user.id,
      },
      client,
    );
    return;
  }

  if (message.type === "cursor:update" && message.cursor) {
    project.cursors.set(client.user.id, message.cursor);
    broadcastProject(
      project.id,
      {
        type: "cursor:update",
        userId: client.user.id,
        cursor: message.cursor,
      },
      client,
    );
    return;
  }

  if (
    message.type === "run:vote" &&
    Array.isArray(message.files) &&
    typeof message.activeFileId === "string"
  ) {
    if (!project.runSession || project.runSession.status === "complete") {
      const activeParts = findNodePath(message.files, message.activeFileId);

      project.runSession = {
        id: randomUUID(),
        status: "pending",
        requestedBy: client.user.id,
        votes: new Set(),
        files: message.files,
        activeFileId: message.activeFileId,
        activeFileName: activeParts?.at(-1) ?? "active file",
      };
    }

    if (project.runSession.status !== "pending") {
      return;
    }

    project.runSession.votes.add(client.user.id);
    broadcastRunState(project);

    const connectedUserIds = getConnectedUserIds(project.id);
    const allUsersApproved = [...connectedUserIds].every((userId) =>
      project.runSession.votes.has(userId),
    );

    if (!allUsersApproved) {
      return;
    }

    project.runSession.status = "running";
    broadcastRunState(project);

    let runResult;

    try {
      runResult = await runVirtualProject(
        project.runSession.files,
        project.runSession.activeFileId,
      );
    } catch (error) {
      runResult = {
        ok: false,
        language: "unknown",
        command: "none",
        exitCode: null,
        timedOut: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    project.runSession.status = "complete";
    broadcastProject(project.id, {
      type: "run:result",
      result: runResult,
    });
    project.runSession = null;
    broadcastRunState(project);
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_TOTAL_BYTES + 100_000) {
        request.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function isSafeNodeName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 120 &&
    name !== "." &&
    name !== ".." &&
    !/[<>:"/\\|?*\u0000-\u001f]/.test(name)
  );
}

function assertInsideWorkspace(workspacePath, targetPath) {
  const relativePath = path.relative(workspacePath, targetPath);

  if (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  ) {
    return;
  }

  throw new Error("Invalid path outside the virtual workspace.");
}

function findNodePath(nodes, nodeId, parts = []) {
  for (const node of nodes) {
    const nextParts = [...parts, node.name];

    if (node.id === nodeId) {
      return nextParts;
    }

    if (node.type === "folder") {
      const foundPath = findNodePath(node.children, nodeId, nextParts);

      if (foundPath) {
        return foundPath;
      }
    }
  }

  return null;
}

async function writeProjectTree(nodes, workspacePath, currentPath, stats) {
  if (!Array.isArray(nodes)) {
    throw new Error("Project files must be an array.");
  }

  for (const node of nodes) {
    if (!node || !isSafeNodeName(node.name)) {
      throw new Error("Project contains an unsafe file or folder name.");
    }

    const targetPath = path.join(currentPath, node.name);
    assertInsideWorkspace(workspacePath, targetPath);

    if (node.type === "folder") {
      await mkdir(targetPath, { recursive: true });
      await writeProjectTree(node.children, workspacePath, targetPath, stats);
      continue;
    }

    if (node.type !== "file" || typeof node.content !== "string") {
      throw new Error("Project contains an invalid file entry.");
    }

    const fileBytes = Buffer.byteLength(node.content);

    if (fileBytes > MAX_FILE_BYTES) {
      throw new Error(`${node.name} is larger than the per-file limit.`);
    }

    stats.files += 1;
    stats.bytes += fileBytes;

    if (stats.files > MAX_FILES) {
      throw new Error("Project has too many files to run safely.");
    }

    if (stats.bytes > MAX_TOTAL_BYTES) {
      throw new Error("Project is larger than the runner limit.");
    }

    await writeFile(targetPath, node.content, "utf8");
  }
}

const commandProbeArgs = new Map([
  ["powershell", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion"]],
  ["pwsh", ["-NoProfile", "-Command", "$PSVersionTable.PSVersion"]],
  ["csc", ["/help"]],
  ["vbc", ["/help"]],
  ["kotlinc", ["-version"]],
  ["scala", ["-version"]],
  ["Rscript", ["--version"]],
  ["R", ["--version"]],
]);

async function commandExists(command) {
  return new Promise((resolve) => {
    let child;
    const timeout = setTimeout(() => {
      child?.kill("SIGKILL");
      resolve(false);
    }, 1500);

    try {
      child = spawn(command, commandProbeArgs.get(command) ?? ["--version"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      clearTimeout(timeout);
      resolve(false);
      return;
    }

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

async function firstAvailable(commands) {
  for (const command of commands) {
    if (await commandExists(command)) {
      return command;
    }
  }

  return null;
}

async function getRunPlan(activePath, workspacePath) {
  const extension = path.extname(activePath).toLowerCase();
  const outputPath = path.join(
    workspacePath,
    ".syncode-bin",
    `program${executableExtension}`,
  );
  const jarPath = path.join(workspacePath, ".syncode-bin", "program.jar");

  switch (extension) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return {
        language: "JavaScript",
        command: "node",
        args: ["--disable-proto=throw", activePath],
      };

    case ".ts":
      return {
        language: "TypeScript",
        command: "node",
        args: ["--experimental-strip-types", "--disable-proto=throw", activePath],
      };

    case ".py": {
      const command = await firstAvailable(["python", "py", "python3"]);

      if (!command) {
        throw new Error("Python is not installed or is not available on PATH.");
      }

      return {
        language: "Python",
        command,
        args: [activePath],
      };
    }

    case ".java": {
      const command = await firstAvailable(["java"]);

      if (!command) {
        throw new Error("Java is not installed or is not available on PATH.");
      }

      const compiler = await firstAvailable(["javac"]);
      const className = path.basename(activePath, ".java");

      if (compiler) {
        return {
          language: "Java",
          build: {
            command: compiler,
            args: [activePath],
          },
          command,
          args: ["-cp", path.dirname(activePath), className],
        };
      }

      return {
        language: "Java",
        command,
        args: [activePath],
      };
    }

    case ".cs": {
      const compiler = await firstAvailable(["csc", "mcs"]);

      if (!compiler) {
        throw new Error("A C# compiler such as csc or mcs is not available on PATH.");
      }

      return {
        language: "C#",
        build: {
          command: compiler,
          args:
            compiler === "mcs"
              ? [`-out:${outputPath}`, activePath]
              : ["/nologo", `/out:${outputPath}`, activePath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".go": {
      const command = await firstAvailable(["go"]);

      if (!command) {
        throw new Error("Go is not installed or is not available on PATH.");
      }

      return {
        language: "Go",
        command,
        args: ["run", activePath],
      };
    }

    case ".rs": {
      const compiler = await firstAvailable(["rustc"]);

      if (!compiler) {
        throw new Error("Rust is not installed or rustc is not available on PATH.");
      }

      return {
        language: "Rust",
        build: {
          command: compiler,
          args: [activePath, "-o", outputPath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".rb": {
      const command = await firstAvailable(["ruby"]);

      if (!command) {
        throw new Error("Ruby is not installed or is not available on PATH.");
      }

      return {
        language: "Ruby",
        command,
        args: [activePath],
      };
    }

    case ".php": {
      const command = await firstAvailable(["php"]);

      if (!command) {
        throw new Error("PHP is not installed or is not available on PATH.");
      }

      return {
        language: "PHP",
        command,
        args: [activePath],
      };
    }

    case ".swift": {
      const command = await firstAvailable(["swift"]);

      if (!command) {
        throw new Error("Swift is not installed or is not available on PATH.");
      }

      return {
        language: "Swift",
        command,
        args: [activePath],
      };
    }

    case ".kt":
    case ".kts": {
      const command = await firstAvailable(["kotlinc"]);

      if (!command) {
        throw new Error("Kotlin is not installed or kotlinc is not available on PATH.");
      }

      if (extension === ".kts") {
        return {
          language: "Kotlin Script",
          command,
          args: ["-script", activePath],
        };
      }

      const javaCommand = await firstAvailable(["java"]);

      if (!javaCommand) {
        throw new Error("Kotlin compilation needs Java available on PATH.");
      }

      return {
        language: "Kotlin",
        build: {
          command,
          args: [activePath, "-include-runtime", "-d", jarPath],
        },
        command: javaCommand,
        args: ["-jar", jarPath],
      };
    }

    case ".scala":
    case ".sc": {
      const command = await firstAvailable(["scala"]);

      if (!command) {
        throw new Error("Scala is not installed or is not available on PATH.");
      }

      return {
        language: "Scala",
        command,
        args: [activePath],
      };
    }

    case ".dart": {
      const command = await firstAvailable(["dart"]);

      if (!command) {
        throw new Error("Dart is not installed or is not available on PATH.");
      }

      return {
        language: "Dart",
        command,
        args: [activePath],
      };
    }

    case ".lua": {
      const command = await firstAvailable(["lua", "luajit"]);

      if (!command) {
        throw new Error("Lua is not installed or is not available on PATH.");
      }

      return {
        language: "Lua",
        command,
        args: [activePath],
      };
    }

    case ".pl":
    case ".pm": {
      const command = await firstAvailable(["perl"]);

      if (!command) {
        throw new Error("Perl is not installed or is not available on PATH.");
      }

      return {
        language: "Perl",
        command,
        args: [activePath],
      };
    }

    case ".r": {
      const command = await firstAvailable(["Rscript"]);

      if (!command) {
        throw new Error("R is not installed or Rscript is not available on PATH.");
      }

      return {
        language: "R",
        command,
        args: [activePath],
      };
    }

    case ".sh":
    case ".bash": {
      const command = await firstAvailable(["bash", "sh"]);

      if (!command) {
        throw new Error("Bash or sh is not installed or is not available on PATH.");
      }

      return {
        language: "Shell",
        command,
        args: [activePath],
      };
    }

    case ".ps1": {
      const command = await firstAvailable(["pwsh", "powershell"]);

      if (!command) {
        throw new Error("PowerShell is not installed or is not available on PATH.");
      }

      return {
        language: "PowerShell",
        command,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", activePath],
      };
    }

    case ".fs":
    case ".fsx": {
      const command = await firstAvailable(["dotnet"]);

      if (!command) {
        throw new Error("F# needs dotnet installed and available on PATH.");
      }

      return {
        language: "F#",
        command,
        args: ["fsi", activePath],
      };
    }

    case ".vb": {
      const compiler = await firstAvailable(["vbc", "vbnc"]);

      if (!compiler) {
        throw new Error("A Visual Basic compiler such as vbc or vbnc is not available on PATH.");
      }

      return {
        language: "Visual Basic",
        build: {
          command: compiler,
          args:
            compiler === "vbnc"
              ? [`-out:${outputPath}`, activePath]
              : ["/nologo", `/out:${outputPath}`, activePath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".m":
    case ".mm": {
      const compiler = await firstAvailable(["clang", "gcc"]);

      if (!compiler) {
        throw new Error("An Objective-C compiler such as clang or gcc is not available on PATH.");
      }

      return {
        language: extension === ".mm" ? "Objective-C++" : "Objective-C",
        build: {
          command: compiler,
          args: [activePath, "-o", outputPath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".zig": {
      const command = await firstAvailable(["zig"]);

      if (!command) {
        throw new Error("Zig is not installed or is not available on PATH.");
      }

      return {
        language: "Zig",
        command,
        args: ["run", activePath],
      };
    }

    case ".nim": {
      const command = await firstAvailable(["nim"]);

      if (!command) {
        throw new Error("Nim is not installed or is not available on PATH.");
      }

      return {
        language: "Nim",
        command,
        args: ["r", "--hints:off", activePath],
      };
    }

    case ".d": {
      const compiler = await firstAvailable(["dmd", "ldc2", "gdc"]);

      if (!compiler) {
        throw new Error("A D compiler such as dmd, ldc2, or gdc is not available on PATH.");
      }

      return {
        language: "D",
        build: {
          command: compiler,
          args: [activePath, "-of" + outputPath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".exs":
    case ".ex": {
      const command = await firstAvailable(["elixir"]);

      if (!command) {
        throw new Error("Elixir is not installed or is not available on PATH.");
      }

      return {
        language: "Elixir",
        command,
        args: [activePath],
      };
    }

    case ".erl": {
      const command = await firstAvailable(["escript"]);

      if (!command) {
        throw new Error("Erlang escript is not installed or is not available on PATH.");
      }

      return {
        language: "Erlang",
        command,
        args: [activePath],
      };
    }

    case ".clj": {
      const command = await firstAvailable(["clojure"]);

      if (!command) {
        throw new Error("Clojure is not installed or is not available on PATH.");
      }

      return {
        language: "Clojure",
        command,
        args: [activePath],
      };
    }

    case ".c": {
      const compiler = await firstAvailable(["gcc", "clang"]);

      if (!compiler) {
        throw new Error("A C compiler such as gcc or clang is not available on PATH.");
      }

      return {
        language: "C",
        build: {
          command: compiler,
          args: [activePath, "-O0", "-o", outputPath],
        },
        command: outputPath,
        args: [],
      };
    }

    case ".cc":
    case ".cpp":
    case ".cxx": {
      const compiler = await firstAvailable(["g++", "clang++"]);

      if (!compiler) {
        throw new Error("A C++ compiler such as g++ or clang++ is not available on PATH.");
      }

      return {
        language: "C++",
        build: {
          command: compiler,
          args: [activePath, "-O0", "-o", outputPath],
        },
        command: outputPath,
        args: [],
      };
    }

    default:
      throw new Error(`Files ending in "${extension || "no extension"}" are not runnable yet.`);
  }
}

function createSafeEnv(workspacePath) {
  return {
    PATH: process.env.PATH ?? "",
    PATHEXT: process.env.PATHEXT ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    ComSpec: process.env.ComSpec ?? "",
    TEMP: workspacePath,
    TMP: workspacePath,
    HOME: workspacePath,
    USERPROFILE: workspacePath,
    NODE_OPTIONS: "--disable-proto=throw",
    PYTHONIOENCODING: "utf-8",
  };
}

function runCommand(plan, workspacePath) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child;

    try {
      child = spawn(plan.command, plan.args, {
        cwd: workspacePath,
        env: createSafeEnv(workspacePath),
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        exitCode: null,
        timedOut,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code,
        timedOut,
        stdout,
        stderr,
      });
    });
  });
}

function displayCommand(plan) {
  return [plan.command, ...plan.args.map((arg) => {
    if (/\s/.test(arg)) {
      return `"${arg}"`;
    }

    return arg;
  })].join(" ");
}

async function runVirtualProject(files, activeFileId) {
  if (!Array.isArray(files) || typeof activeFileId !== "string") {
    return {
      ok: false,
      language: "unknown",
      command: "none",
      exitCode: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      error: "Runner request is missing files or activeFileId.",
    };
  }

  const activeParts = findNodePath(files, activeFileId);

  if (!activeParts) {
    return {
      ok: false,
      language: "unknown",
      command: "none",
      exitCode: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      error: "Active file was not found in the virtual project.",
    };
  }

  const workspacePath = path.join(tmpdir(), `syncode-run-${randomUUID()}`);

  try {
    await mkdir(workspacePath, { recursive: true });
    await mkdir(path.join(workspacePath, ".syncode-bin"), { recursive: true });
    await writeProjectTree(files, workspacePath, workspacePath, {
      files: 0,
      bytes: 0,
    });

    const activePath = path.join(workspacePath, ...activeParts);
    assertInsideWorkspace(workspacePath, activePath);
    await access(activePath, constants.R_OK);

    const plan = await getRunPlan(activePath, workspacePath);

    if (plan.build) {
      const buildResult = await runCommand(plan.build, workspacePath);

      if (buildResult.exitCode !== 0 || buildResult.timedOut) {
        return {
          ok: false,
          language: plan.language,
          command: displayCommand(plan.build),
          ...buildResult,
          error: buildResult.timedOut
            ? "Build stopped after the timeout."
            : "Build failed.",
        };
      }
    }

    const runResult = await runCommand(plan, workspacePath);

    return {
      ok: runResult.exitCode === 0 && !runResult.timedOut,
      language: plan.language,
      command: displayCommand(plan),
      ...runResult,
    };
  } finally {
    await rm(workspacePath, {
      recursive: true,
      force: true,
    });
  }
}

async function handleRun(request, response) {
  const body = await readRequestBody(request);
  const payload = JSON.parse(body);
  const result = await runVirtualProject(payload.files, payload.activeFileId);

  sendJson(response, result.error?.includes("missing files") ? 400 : 200, result);
}

async function handleCreateProject(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, {
      ok: false,
      error: "Sign in before creating a project.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim().slice(0, 80)
      : "Untitled Project";
  const project = createProject(name, user);

  sendJson(response, 201, {
    project: projectToJson(project),
  });
}

async function handleCreateInvite(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, {
      ok: false,
      error: "Sign in before inviting collaborators.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const project = projects.get(payload.projectId);

  if (!project || !canAccessProject(project, user)) {
    sendJson(response, 404, {
      ok: false,
      error: "Project not found.",
    });
    return;
  }

  let invitedUser = null;

  if (typeof payload.username === "string" && payload.username.trim()) {
    invitedUser = users.get(payload.username.trim().toLowerCase()) ?? null;

    if (!invitedUser) {
      sendJson(response, 404, {
        ok: false,
        error: "No account exists with that username.",
      });
      return;
    }

    project.invitedUserIds.add(invitedUser.id);
  }

  const token = randomUUID().slice(0, 8);
  const invite = {
    token,
    url: `/invite/${token}?projectId=${project.id}`,
    createdAt: Date.now(),
    invitedUserId: invitedUser?.id ?? null,
    invitedUsername: invitedUser?.username ?? null,
  };

  project.invites = [invite, ...project.invites].slice(0, 8);
  sendJson(response, 201, {
    invite,
    invitedUser: invitedUser ? publicUser(invitedUser) : null,
  });
}

async function handleSignup(request, response) {
  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const username = String(payload.username ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const name = String(payload.name ?? "").trim();

  if (!/^[a-z0-9_-]{3,24}$/.test(username)) {
    sendJson(response, 400, {
      ok: false,
      error: "Usernames need 3-24 letters, numbers, underscores, or hyphens.",
    });
    return;
  }

  if (password.length < 8) {
    sendJson(response, 400, {
      ok: false,
      error: "Use a password with at least 8 characters.",
    });
    return;
  }

  if (users.has(username)) {
    sendJson(response, 409, {
      ok: false,
      error: "That username is already taken.",
    });
    return;
  }

  const user = createUser({
    username,
    name,
    password,
  });
  const token = createSession(user);

  sendJson(response, 201, {
    token,
    user: publicUser(user),
  });
}

async function handleSignin(request, response) {
  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const username = String(payload.username ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");
  const user = users.get(username);

  if (!user || !verifyPassword(password, user)) {
    sendJson(response, 401, {
      ok: false,
      error: "Incorrect username or password.",
    });
    return;
  }

  const token = createSession(user);

  sendJson(response, 200, {
    token,
    user: publicUser(user),
  });
}

async function handleAcceptInvite(request, response) {
  const user = getAuthUser(request);

  if (!user) {
    sendJson(response, 401, {
      ok: false,
      error: "Sign in before accepting an invite.",
    });
    return;
  }

  const body = await readRequestBody(request);
  const payload = body ? JSON.parse(body) : {};
  const token = String(payload.token ?? "");
  const project = [...projects.values()].find((candidate) =>
    candidate.invites.some((invite) => invite.token === token),
  );

  if (!project) {
    sendJson(response, 404, {
      ok: false,
      error: "Invite link was not found.",
    });
    return;
  }

  project.members.add(user.id);
  project.invitedUserIds.delete(user.id);

  sendJson(response, 200, {
    project: projectToJson(project),
  });
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const user = getAuthUser(request);

    if (request.method === "GET" && request.url === "/api/health") {
      sendJson(response, 200, {
        ok: true,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/auth/signup") {
      await handleSignup(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/auth/signin") {
      await handleSignin(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/auth/me") {
      if (!user) {
        sendJson(response, 401, {
          ok: false,
          error: "Not signed in.",
        });
        return;
      }

      sendJson(response, 200, {
        user: publicUser(user),
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/run") {
      await handleRun(request, response);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/projects") {
      const inviteToken = requestUrl.searchParams.get("inviteToken");
      const visibleProjects = [...projects.values()].filter((project) =>
        canAccessProject(project, user, inviteToken),
      );

      sendJson(response, 200, {
        projects: visibleProjects.map(projectToJson),
        defaultProjectId: visibleProjects[0]?.id ?? null,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/projects") {
      await handleCreateProject(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/invites") {
      await handleCreateInvite(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/invites/accept") {
      await handleAcceptInvite(request, response);
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: "Not found",
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      language: "unknown",
      command: "none",
      exitCode: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.on("upgrade", (request, socket) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (requestUrl.pathname !== "/collab") {
      socket.destroy();
      return;
    }

    const key = request.headers["sec-websocket-key"];

    if (typeof key !== "string") {
      socket.destroy();
      return;
    }

    const token = requestUrl.searchParams.get("token") ?? "";
    const user = getUserBySessionToken(token);
    const inviteToken = requestUrl.searchParams.get("inviteToken");
    const projectId = requestUrl.searchParams.get("projectId") ?? defaultProject.id;
    const project = projects.get(projectId);

    if (!project || !canAccessProject(project, user, inviteToken)) {
      socket.destroy();
      return;
    }

    if (user && inviteToken) {
      project.members.add(user.id);
      project.invitedUserIds.delete(user.id);
    }

    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );

    const socketUser = user
      ? publicUser(user)
      : {
          id: requestUrl.searchParams.get("userId") ?? randomUUID(),
          username: "guest",
          name: requestUrl.searchParams.get("name")?.slice(0, 40) ?? "Guest",
          color: requestUrl.searchParams.get("color") ?? "#4ade80",
        };
    const collabUser = {
      id: socketUser.id,
      username: socketUser.username,
      name: socketUser.name,
      color: socketUser.color,
    };
    const client = {
      socket,
      projectId: project.id,
      user: collabUser,
    };

    sockets.add(client);
    sendWebSocket(socket, {
      type: "hello",
      project: projectToJson(project),
      user: collabUser,
      users: getPresence(project),
      runState: getRunState(project),
    });
    broadcastPresence(project);
    broadcastRunState(project);

    socket.on("data", (buffer) => {
      const frame = decodeWebSocketFrame(buffer);

      if (!frame) {
        return;
      }

      if (frame.close) {
        socket.end();
        return;
      }

      try {
        void handleSocketMessage(client, JSON.parse(frame.text)).catch((error) => {
          sendWebSocket(socket, {
            type: "run:result",
            result: {
              ok: false,
              language: "unknown",
              command: "none",
              exitCode: null,
              timedOut: false,
              stdout: "",
              stderr: "",
              error: error instanceof Error ? error.message : String(error),
            },
          });
        });
      } catch {
        sendWebSocket(socket, {
          type: "error",
          error: "Invalid collaboration message.",
        });
      }
    });

    socket.on("close", () => {
      sockets.delete(client);
      project.cursors.delete(collabUser.id);
      broadcastPresence(project);
      broadcastRunState(project);
    });

    socket.on("error", () => {
      sockets.delete(client);
      project.cursors.delete(collabUser.id);
      broadcastPresence(project);
      broadcastRunState(project);
    });
  } catch {
    socket.destroy();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Syncode runner listening on http://127.0.0.1:${PORT}`);
});
