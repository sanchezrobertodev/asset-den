// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `mimikit mcp`: an agent app (Claude Code, Claude Desktop) starts this to reach the running Mimikit. It talks MCP
    // on the stdio the agent app gives it, which works for this GUI program too, and opens no window.
    if std::env::args().nth(1).as_deref() == Some("mcp") {
        return mimikit_lib::mcp();
    }
    mimikit_lib::run()
}
