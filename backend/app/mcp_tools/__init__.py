"""MCP tool servers the agent can call: calendar and notifications.

These expose the same functions the agent's booking/notify nodes use. Running
them as standalone MCP servers (``python -m app.mcp_tools.calendar_server``)
lets any MCP client — including the agent — invoke them over stdio.
"""
