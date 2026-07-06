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
export {};
