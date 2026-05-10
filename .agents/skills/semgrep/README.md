# Semgrep MCP Marketplace

This repo is where the Semgrep [Plugin Marketplace](https://code.claude.com/docs/en/plugin-marketplaces) (`semgrep`) and the Semgrep [Plugin](https://code.claude.com/docs/en/plugins) (`semgrep-plugin@semgrep`) live.

To use the Semgrep plugin:
1. Start a Codex CLI instance by running:
    ```
    codex
    ```
1. Add the Semgrep marketplace by running the following command in Codex:
    ```
    /plugin marketplace add semgrep/mcp-marketplace
    ```
1. Install the plugin from the marketplace:
    ```
    /plugin install semgrep-plugin@semgrep
    ```
1. If it is installed, see if you can run the `/semgrep-plugin:setup_semgrep_plugin` command. If you cannot run the command, try restarting your codex instance by exiting out of the current session and re-running:
   ```
   codex
   ```
1. If it still doesn't work, try enabling the plugin:
    ```
    /plugin enable semgrep-plugin@semgrep
    ```
