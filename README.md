# Prompt Registry: Your Personal Prompt Registry Server 🏰✍️

**MCP Prompt Registry** is a lightweight, file-based [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) prompt server designed for developers. It runs via `stdio`, making it perfect for local development and integration with CLIs or desktop AI assistants that support MCP. It allows you to manage your prompts in a single directory, keeping your workflow simple and portable.

## ✨ Features

*   **Single Prompt Storage Directory:**
    *   All prompts are stored in a single directory. You can control the location with the `PROMPT_REGISTRY_PROJECT_DIR` environment variable. If not set, prompts are stored in `~/.promptregistry/` in your home directory.
*   **File-Based:** Prompts are simple JSON files – easy to read, edit, and version control.
*   **Standard MCP Compliance:**
    *   Exposes prompts via standard `prompts/list` (lists all prompts).
    *   Allows prompts to be used via standard `prompts/get` (applies template variables).
    *   Notifies clients of changes via `notifications/prompts/list_changed`.
*   **Management via MCP Tools:**
    *   `add_prompt`: Add new prompts.
    *   `get_prompt_file_content`: View the raw JSON of a prompt.
    *   `update_prompt`: Modify prompts.
    *   `delete_prompt`: Remove prompts.
    *   `filter_prompts_by_tags`: Discover prompts by tags.
*   **Stdio Interface:** Communicates over standard input/output, ideal for local tools.
*   **Template Variables:** Supports `{{variable_name}}` syntax in prompt content.
*   **Zod Schema Validation:** Robust validation for tool arguments.

##  Prerequisites

*   **Node.js:** Version 18 or higher.
*   **npm** (or **yarn**).
*   **(Optional) Docker:** If you want to run the server in a container.

## 📁 Directory Structure for Prompts

The server uses a single directory for all prompts:

1.  If the environment variable `PROMPT_REGISTRY_PROJECT_DIR` is set, prompts are stored in that directory.
2.  If not set, prompts are stored in `~/.promptregistry/` in your home directory. On first startup, or if prompts are missing, the server will attempt to copy predefined prompts from a local `default_prompts_data/` directory (if present) into `~/.promptregistry/`.

**Prompt JSON File Structure (`your-prompt-id.json`):**

```json
{
  "id": "your-prompt-id",
  "description": "A brief description for MCP listing",
  "content": "Your prompt template, e.g., Explain {{concept}} like I'm {{age}}.",
  "tags": ["tag1", "category_a"],
  "variables": {
    "concept": { "description": "The concept to explain", "required": true },
    "age": { "description": "The target audience's age", "required": false }
  },
  "metadata": { "version": "1.1", "author": "You" }
}
```

## 🚀 Installation and Running

### 1. Using the Published NPM Package (Recommended for Clients)

If `promptregistry-mcp` is published to npm, clients can easily run it.

1.  **Ensure Node.js and npx are installed.**
2.  Configure your MCP client (like Claude Desktop or Amazon Q) to use it. See examples below.

### 2. Local/Manual Installation (For Development or Direct Use)

1.  **Clone the repository or download the files:**
    (Assuming you have `server.ts`, `package.json`, `tsconfig.json`, and an optional `default_prompts_data/` directory)

2.  **Install dependencies:**
    Navigate to the server's root directory in your terminal:
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Build the server (compile TypeScript):**
    ```bash
    npm run build
    ```
    This will create a `dist/` directory with the compiled JavaScript.

4.  **Run the server:**
    *   For development (uses `tsx` to run TypeScript directly, with auto-restart on changes):
        ```bash
        npm run dev
        ```
    *   To run the compiled version:
        ```bash
        npm run start:prod
        ```
    The server will start listening on `stdin` and outputting to `stdout`.
    Console messages from the server (like "Server is running...") will appear on `stderr`.

    It will create the prompt directory (either as specified by `PROMPT_REGISTRY_PROJECT_DIR` or `~/.promptregistry/`) if it doesn't exist.

### 3. Running with Docker

1.  **Build the Docker image:**
    Ensure you have Docker installed. From the server's root directory:
    ```bash
    docker build -t mcp-promptregistry .
    ```
    *(You can change `mcp-promptregistry` to `promptregistry-mcp` or your preferred image name)*

2.  **Run the Docker container:**
    ```bash
    docker run -i -t --rm mcp-promptregistry
    ```
    *   `-i`: Keep STDIN open (interactive).

    The container will have its own internal prompt directory. To persist prompts outside the container or use existing local prompts:

    ```bash
    # Example: Mount local directory into the container
    docker run -i -t --rm \
      -v "$HOME/.promptregistry:/root/.promptregistry" \
      mcp-promptregistry 
    ```
    *(Note: The home directory for the `root` user inside the Alpine container is `/root`)*

## 🔌 Connecting with MCP Clients

Here's how you might configure clients like Claude Desktop or Amazon Q to use your MCP Prompt Registry. The exact JSON structure might vary slightly based on the client's implementation, but the core idea is to define a stdio server.

**Option A: Using the (Hypothetically) Published NPM Package `promptregistry-mcp`**

If this server were published to npm as `promptregistry-mcp`, the configuration would be very clean:

```json
// Example client configuration JSON
{
  "mcpServers": {
    "mcp-promptregistry": {
      "command": "npx",
      "args": [
        "mcp-promptregistry"
      ],
      "env": {
        "PROMPT_REGISTRY_PROJECT_DIR": "/path/to/your/prompts" 
      }
    }
  }
}
```
*This assumes `promptregistry-mcp` when run via `npx` correctly starts the stdio server.*

**Option B: Running from Local (Compiled) Source**

If you've built the server locally and want to point your client to it:

```json
// Example client configuration JSON
{
  "mcpServers": {
    "localPromptRegistry": {
      "command": "node", 
      "args": [
        "/full/path/to/your/mcp-promptregistry/dist/server.js"
      ],
      "env": {}
    }
  }
}
```
*Replace `/full/path/to/your/mcp-promptregistry/` with the actual absolute path to where you cloned/built the server.*

**Important Considerations for Client Configuration:**

*   **Absolute Paths:** When specifying paths for local commands (Option B), always use absolute paths, as the client application might execute the command from a different working directory.
*   **Environment Variables (`env`):** Use `PROMPT_REGISTRY_PROJECT_DIR` to control where prompts are stored.
*   **Client-Specific Structure:** The top-level key (e.g., `"mcpServers"`) and the exact structure can vary between different MCP client applications. Adapt the `command`, `args`, and `env` to fit the client's requirements. The key is how it invokes your stdio server.

## 🧪 Testing the Server

### 1. Manual Stdio (JSON-RPC)

The most direct way to test. Run your server, then paste JSON-RPC messages into the same terminal and press Enter.

*Example `prompts/list` request:*
```json
{"jsonrpc":"2.0","id":"list1","method":"prompts/list"}
```
The server's JSON-RPC response will appear on `stdout`. Server logs will appear on `stderr`.

*Example `add_prompt` tool call:*
```json
{"jsonrpc":"2.0","id":"add1","method":"tools/call","params":{"name":"add_prompt","arguments":{"id":"my-test-prompt","content":"Test content: {{var1}}","tags":["test"],"variables":{"var1":{"description":"A test variable"}}}}}
```

### 2. MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is a GUI tool that can connect to MCP servers.

*   **To connect to a locally running server (compiled):**
    ```bash
    mcp-inspector --stdio "node /path/to/your/mcp-promptregistry/dist/server.js"
    ```
*   **To connect to the Docker container:**
    ```bash
    mcp-inspector --stdio "docker run -i --rm mcp-promptregistry" 
    ```
    *(Replace `mcp-promptregistry` with your image name if different. Ensure `mcp-inspector` is installed and in your PATH.)*

    The Inspector allows you to see available prompts and tools, make requests, and view responses interactively.

## 🧰 Using with Claude Desktop (Example Workflow)

Once MCP Prompt Registry is added as an MCP server in Claude Desktop (using one of the configurations above):

1.  **Discover Prompts:** Your custom prompts should appear in Claude Desktop's prompt library or be accessible via its command interface (e.g., by typing `/` or similar, depending on Claude's UI). The `description` you set in your prompt's JSON file will be visible.
2.  **Select a Prompt:** Choose one of your prompts.
3.  **Fill Arguments:** If the prompt has variables (e.g., `{{concept}}`, `{{age}}`), Claude Desktop should provide UI fields for you to enter these values. The `description` for each variable (from your prompt's JSON) can guide the user.
4.  **Execute:** Claude Desktop will send a `prompts/get` request to your server with the filled arguments. Your server will apply the template and return the final prompt content to Claude.
5.  **Management Tools:** To use tools like `add_prompt` or `filter_prompts_by_tags` *from* Claude Desktop, Claude would need a way to send arbitrary `tools/call` requests to connected MCP servers. If this isn't directly supported, you'd typically use MCP Inspector or manual stdio alongside Claude for management tasks.

## 🛠️ Available Management Tools

Your MCP Prompt Registry exposes the following tools (callable via MCP `tools/call` requests):

*   **`add_prompt`**: Adds a new prompt to the prompt directory.
    *   *Args:* `id`, `content`, `description` (optional), `tags` (optional), `variables` (optional), `metadata` (optional).
*   **`get_prompt_file_content`**: Retrieves the raw JSON definition of the prompt.
    *   *Args:* `id`.
*   **`update_prompt`**: Updates an existing prompt.
    *   *Args:* `id`, and any fields to update (`content`, `description`, etc.).
*   **`delete_prompt`**: Deletes a prompt from the prompt directory.
    *   *Args:* `id`.
*   **`filter_prompts_by_tags`**: Lists prompts that match *all* specified tags. Returns a summary (id, description, tags).
    *   *Args:* `tags` (array of strings).
*   **`load_default_prompts`**: Copies all prompts from the `default_prompts_data/` directory (if present) into the active prompt directory, skipping any that already exist. Useful for populating or restoring default prompts.
    *   *Args:* None.

## ⚠️ Troubleshooting & Gotchas

*   **Stdio Server Logging:** Remember, `console.log()` in your `server.ts` will break MCP communication over stdio because it writes to `stdout`. All server-side diagnostic/status logs should use `console.error()`, which writes to `stderr`. For logs you want the client to potentially see, use MCP's logging capability via `context.sendNotification` in tool handlers (if the client supports it).
*   **Server Startup Messages on Stderr:** Some initial server startup messages, such as directory creation or automatic default prompt loading, will appear on `stderr` (e.g., `Attempting to create prompt directory: /Users/stevengonsalvez/.promptregistry` or `Auto-loaded 2 default prompt(s) into ~/.promptregistry: code-review-assistant, prompt-writing-assistant`). This is because `stdout` is reserved for MCP JSON-RPC messages, and these startup actions occur before a client context is available for `sendNotification`.
*   **Permissions:** Ensure the server process has write permissions for the prompt directory.
*   **JSON Validity:** Ensure your prompt JSON files are valid.
*   **Absolute Paths for Clients:** When configuring clients with local server paths, always use absolute paths.

## 🌱 Contributing & Future Ideas

This is a starting point! Future enhancements could include:

*   More sophisticated templating.
*   A watch mode to auto-reload prompts when files change.
*   Support for other storage backends (e.g. postgres, github (or gists), sqllite).

Pull requests and ideas are welcome!