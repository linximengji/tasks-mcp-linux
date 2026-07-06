/**
 * tasks-mcp — MCP stdio server for task management
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP stdio transport)
 *
 * Tools:
 *   tasks_list(status?, type?, limit?)        → tasks with filters
 *   tasks_create(summary, type?, source?)     → create task
 *   tasks_mark_done(task_id)                 → complete task
 *   tasks_delete(task_id)                    → remove task
 *   tasks_get(task_id)                       → single task detail
 *   tasks_set_progress(task_id, notes)       → update progress notes
 *   tasks_set_priority(task_id, priority)    → set priority level
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INDEX = resolve(__dirname, '..', 'index.json')

// ── Task helpers ──

function load(): Record<string, any> {
  try { return JSON.parse(readFileSync(INDEX, 'utf-8')) }
  catch { return {} }
}

function save(data: Record<string, any>) {
  writeFileSync(INDEX, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

// ── Tool definitions ──

const TOOLS = [
  {
    name: 'tasks_list',
    description: 'List tasks with optional filters by status and type.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "Filter: 'active' (default, pending+in_progress) | 'completed' | '' (all)" },
        type: { type: 'string', description: "Filter by task type: task|bug|feature|research|chore|reference" },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'tasks_create',
    description: 'Create a new pending task.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Task summary (max 80 chars)' },
        type: { type: 'string', description: "Task type: task|bug|feature|research|chore (default 'task')" },
        source: { type: 'string', description: "Source: claudetalk|ops-daemon|cc|manual (default 'cc')" },
        priority: { type: 'string', description: "Priority: low|medium|high|critical (default 'medium')" },
      },
      required: ['summary'],
    },
  },
  {
    name: 'tasks_mark_done',
    description: 'Mark a task as completed by its task ID.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Full task ID (e.g. 2026-06-23/001-some-task)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'tasks_delete',
    description: 'Permanently remove a task entry.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Full task ID to delete' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'tasks_get',
    description: 'Get a single task by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Full task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'tasks_set_progress',
    description: 'Set progress notes on a task and optionally mark as in_progress.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Full task ID' },
        notes: { type: 'string', description: 'Progress notes (free text, describes what\'s done and what\'s next)' },
        start: { type: 'boolean', description: "Also mark as in_progress (default true)" },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'tasks_set_priority',
    description: 'Set priority level on a task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Full task ID' },
        priority: { type: 'string', description: 'low|medium|high|critical' },
      },
      required: ['task_id', 'priority'],
    },
  },
]

// ── Tool handlers ──

function handleToolCall(name: string, args: Record<string, any>): { content: any[]; isError?: boolean } {
  try {
    switch (name) {
      case 'tasks_list': {
        const rawStatus = (args.status || 'active') as string
        const type = (args.type || '') as string
        const limit = (args.limit || 20) as number
        const index = load()
        const entries: any[] = []
        for (const [id, val] of Object.entries(index)) {
          if (rawStatus === 'active') {
            if (val.status !== 'pending' && val.status !== 'in_progress') continue
          } else if (rawStatus && val.status !== rawStatus) {
            continue
          }
          if (type && val.type !== type) continue
          entries.push({ id, ...val } as any)
        }
        entries.sort((a, b) => a.id.localeCompare(b.id))
        return { content: [{ type: 'text', text: JSON.stringify(entries.slice(0, limit), null, 2) }] }
      }

      case 'tasks_create': {
        const summary = (args.summary || '').trim()
        if (!summary) return { content: [{ type: 'text', text: '{"error":"summary is required"}' }], isError: true }
        const taskType = (args.type || 'task') as string
        const source = (args.source || 'cc') as string
        const now = new Date()
        const today = now.toISOString().slice(0, 10)
        const slug = summary.replace(/[^a-zA-Z0-9一-鿿]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task'
        const index = load()
        let seq = 1
        const prefix = `${today}/`
        for (const id of Object.keys(index)) {
          if (id.startsWith(prefix)) {
            const parts = id.slice(prefix.length).split('-', 1)
            const n = parseInt(parts[0], 10)
            if (!isNaN(n)) seq = Math.max(seq, n + 1)
          }
        }
        const taskId = `${today}/${String(seq).padStart(3, '0')}-${slug}`
        index[taskId] = {
          status: 'pending',
          summary: summary.slice(0, 80),
          created_at: now.toISOString(),
          updated_at: null,
          type: taskType,
          source,
        }
        save(index)
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, summary: summary.slice(0, 80) }, null, 2) }] }
      }

      case 'tasks_mark_done': {
        const taskId = args.task_id as string
        const index = load()
        if (!index[taskId]) return { content: [{ type: 'text', text: JSON.stringify({ error: `task not found: ${taskId}` }) }], isError: true }
        index[taskId].status = 'completed'
        index[taskId].updated_at = new Date().toISOString()
        save(index)
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, status: 'completed' }) }] }
      }

      case 'tasks_delete': {
        const taskId = args.task_id as string
        const index = load()
        if (!index[taskId]) return { content: [{ type: 'text', text: JSON.stringify({ error: `task not found: ${taskId}` }) }], isError: true }
        const summary = index[taskId].summary
        delete index[taskId]
        save(index)
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, summary }) }] }
      }

      case 'tasks_get': {
        const taskId = args.task_id as string
        const index = load()
        if (!index[taskId]) return { content: [{ type: 'text', text: JSON.stringify({ error: `task not found: ${taskId}` }) }], isError: true }
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, ...index[taskId] }, null, 2) }] }
      }

      case 'tasks_set_progress': {
        const taskId = args.task_id as string
        const notes = (args.notes || '') as string
        const start = args.start !== false
        const index = load()
        if (!index[taskId]) return { content: [{ type: 'text', text: JSON.stringify({ error: `task not found: ${taskId}` }) }], isError: true }
        if (start && index[taskId].status === 'pending') index[taskId].status = 'in_progress'
        index[taskId].progress = notes
        index[taskId].updated_at = new Date().toISOString()
        save(index)
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, status: index[taskId].status, progress: notes }) }] }
      }

      case 'tasks_set_priority': {
        const taskId = args.task_id as string
        const priority = args.priority as string
        if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `invalid priority: ${priority}` }) }], isError: true }
        }
        const index = load()
        if (!index[taskId]) return { content: [{ type: 'text', text: JSON.stringify({ error: `task not found: ${taskId}` }) }], isError: true }
        index[taskId].priority = priority
        index[taskId].updated_at = new Date().toISOString()
        save(index)
        return { content: [{ type: 'text', text: JSON.stringify({ id: taskId, priority }) }] }
      }

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool: ${name}` }) }], isError: true }
    }
  } catch (e: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true }
  }
}

// ── MCP stdio transport ──

function jsonRpc(id: any, result?: any, error?: any) {
  const msg: any = { jsonrpc: '2.0', id }
  if (error) msg.error = { code: error.code || -32603, message: error.message || 'Internal error' }
  else msg.result = result
  return JSON.stringify(msg) + '\n'
}

let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let msg: any
    try { msg = JSON.parse(trimmed) } catch { continue }

    const id = msg.id
    const method = msg.method

    try {
      if (method === 'initialize') {
        process.stdout.write(jsonRpc(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'tasks-mcp', version: '0.1.0' },
        }))
      } else if (method === 'notifications/initialized') {
        // no response
      } else if (method === 'tools/list') {
        process.stdout.write(jsonRpc(id, { tools: TOOLS }))
      } else if (method === 'tools/call') {
        const name = msg.params?.name || ''
        const args = msg.params?.arguments || {}
        const result = handleToolCall(name, args)
        process.stdout.write(jsonRpc(id, { content: result.content, ...(result.isError ? { isError: true } : {}) }))
      } else {
        process.stdout.write(jsonRpc(id, null, { code: -32601, message: `Method not found: ${method}` }))
      }
    } catch (e: any) {
      process.stderr.write(`[tasks-mcp] error: ${e.message}\n`)
      if (id != null) {
        process.stdout.write(jsonRpc(id, null, { code: -32603, message: e.message }))
      }
    }
  }
})

process.stdin.on('end', () => process.exit(0))

// Log startup to stderr (visible in MCP host logs)
process.stderr.write('[tasks-mcp] ready (stdio)\n')
