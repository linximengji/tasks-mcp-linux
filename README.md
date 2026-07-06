# tasks-mcp — Task Management MCP Server

## 架构总览

tasks-mcp 是一个轻量级任务管理系统，核心数据为单文件 JSON `index.json`，提供两种接入方式：

```
用户(飞书/CC) → [MCP Client / CLI] → index.json
                          ↑
                 claudetalk 直接写 (phone-archive)
```

### 数据文件

- `index.json` — 核心数据存储，`Record<id, entry>` 格式的单 JSON 文件
- 每个 entry 字段: status, summary, created_at, updated_at, type, source, priority, progress

## 文件清单

| 文件 | 说明 |
|------|------|
| `src/tasks-mcp.ts` | MCP stdio 服务器，7 个 tools |
| `cli.py` | Python CLI，7 个子命令 |
| `index.json` | 数据存储（已附带全部 task 数据） |
| `.project-type` | 项目类型标记 |

## MCP Server（`src/tasks-mcp.ts`）

### 运行方式

```bash
node --experimental-strip-types src/tasks-mcp.ts
```

### 暴露的工具

| 工具 | 参数 | 说明 |
|------|------|------|
| `tasks_list` | status?, type?, limit? | 列出任务，默认 active (pending+in_progress)，默认 20 条 |
| `tasks_create` | summary, type?, source?, priority? | 创建 pending 任务，自动编号 |
| `tasks_mark_done` | task_id | 标记完成 |
| `tasks_delete` | task_id | 永久删除 |
| `tasks_get` | task_id | 查单个任务 |
| `tasks_set_progress` | task_id, notes, start? | 更新进度，自动设为 in_progress |
| `tasks_set_priority` | task_id, priority | 设置优先级 |

### JSON-RPC 协议

MCP stdio transport，JSON-RPC 2.0 over stdin/stdout。

`initialize` 响应:
```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": {} },
  "serverInfo": { "name": "tasks-mcp", "version": "0.1.0" }
}
```

## Python CLI（`cli.py`）

### 子命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `list` | `--type` | 列出 active 任务 |
| `create` | `summary`, `--type`, `--source`, `--priority`, `--action` | 创建任务 |
| `start` | `query` | 标记进行中 |
| `mark-done` | `query` | 标记完成 |
| `set-progress` | `query`, `notes` | 更新进度 |
| `set-priority` | `query`, `priority` | 设置优先级 |
| `status` | `--type` | 统计概览 |

query 支持 task id 精确匹配或关键词模糊匹配。

### 示例

```bash
python cli.py list
python cli.py create "写文档" --type chore --source manual --priority low
python cli.py mark-done 2026-07-05/001-some-task
python cli.py set-progress 001 "50% done"
```

## index.json Schema

```json
"2026-07-05/001-task-name": {
  "status": "pending | in_progress | completed",
  "summary": "任务摘要（≤80字符）",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601 | null",
  "type": "task | bug | feature | research | chore | reference",
  "source": "claudetalk | ops-daemon | cc | manual",
  "priority": "low | medium | high | critical",
  "progress": "自由文本进度笔记 | null"
}
```

## 依赖

- **MCP Server**: Node.js 22+ (需要 `--experimental-strip-types`)
- **CLI**: Python 3.10+
- 无第三方 npm/pip 依赖

## 注册方式

MCP Server 在 `.mcp.json` 中注册：

```json
"tasks-mcp": {
  "type": "stdio",
  "command": "node",
  "args": ["--experimental-strip-types", "/path/to/tasks/src/tasks-mcp.ts"]
}
```
