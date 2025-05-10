// server.ts
import { McpServer, RegisteredPrompt } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    CallToolResult,
    GetPromptResult,
    McpError,
    ErrorCode,
    LoggingMessageNotification,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os'; // Added for home directory

// Default path if no environment variable is set for project-specific prompts
const DEFAULT_PROMPTS_DIR = process.env.PROMPT_REGISTRY_PROJECT_DIR || path.join(os.homedir(), '.promptregistry');

const PROJECT_INITIAL_DEFAULTS_SRC_DIR = 'default_prompts_data'; // Source for initial defaults
const USER_REGISTRY_BASE_DIR = path.join(os.homedir(), '.promptregistry');
const USER_GLOBAL_DEFAULTS_DIR = path.join(USER_REGISTRY_BASE_DIR, 'default_prompts');

// --- Prompt Data Structure ---
interface StoredPromptVariable {
    description?: string;
    required?: boolean;
}

interface StoredPrompt {
    id: string;
    description?: string;
    content: string;
    tags: string[];
    variables: Record<string, StoredPromptVariable>;
    metadata: Record<string, unknown>;
}

// --- File System Utilities (Generalized) ---
async function ensureDirExists(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            console.error(`Failed to create directory '${dirPath}':`, error);
            throw error;
        }
        // If EEXIST, it's okay, directory already exists.
        return; // Explicitly return for void promise if no error thrown
    }
}

function getPromptPathInDir(id: string, baseDir: string): string {
    const sanitizedId = path.basename(id);
    if (sanitizedId !== id || id.includes('..') || id.includes('/') || id.includes('\\')) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid prompt ID format: ${id}`);
    }
    return path.join(baseDir, `${sanitizedId}.json`);
}

async function readPromptFileFromDir(id: string, baseDir: string): Promise<StoredPrompt | null> {
    try {
        const filePath = getPromptPathInDir(id, baseDir);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data) as StoredPrompt;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        console.error(`Error reading prompt file for ID '${id}' from '${baseDir}':`, error);
        // Do not throw McpError here as this is a general utility
        return null; // Indicate not found or error
    }
}

async function writePromptFileToDir(promptData: StoredPrompt, baseDir: string): Promise<void> {
    try {
        const filePath = getPromptPathInDir(promptData.id, baseDir);
        await fs.writeFile(filePath, JSON.stringify(promptData, null, 2));
    } catch (error) {
        console.error(`Error writing prompt file for ID '${promptData.id}' to '${baseDir}':`, error);
        throw new McpError(ErrorCode.InternalError, `Failed to write prompt '${promptData.id}' to directory '${baseDir}'.`);
    }
}

async function deletePromptFileFromDir(id: string, baseDir: string): Promise<boolean> {
    try {
        const filePath = getPromptPathInDir(id, baseDir);
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false; // File didn't exist
        }
        console.error(`Error deleting prompt file for ID '${id}' from '${baseDir}':`, error);
        throw new McpError(ErrorCode.InternalError, `Failed to delete prompt '${id}' from directory '${baseDir}'.`);
    }
}

async function getAllPromptFilesDataFromDir(baseDir: string): Promise<StoredPrompt[]> {
    const prompts: StoredPrompt[] = [];
    try {
        const files = await fs.readdir(baseDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const id = path.basename(file, '.json');
                // Use the generalized read function
                const promptData = await readPromptFileFromDir(id, baseDir);
                if (promptData) {
                    prompts.push(promptData);
                }
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // If the directory itself doesn't exist, return empty.
            // This is expected if the user hasn't created project prompts yet, for example.
            return [];
        }
        console.error(`Error listing prompt files from '${baseDir}':`, error);
        // Do not throw McpError, allow server to start if possible
    }
    return prompts;
}


// --- Template Application Utility ---
function applyTemplate(templateContent: string, values: Record<string, string>): string {
    let processedContent = templateContent;
    for (const key in values) {
        const regex = new RegExp(`\{\{\s*${key}\s*\}\}`, 'g');
        processedContent = processedContent.replace(regex, values[key] || '');
    }
    return processedContent;
}

// --- Main Server Logic ---
const mcpServer = new McpServer(
    {
        name: 'PromptManagementServer',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
            prompts: { listChanged: true },
            logging: {},
        },
    }
);

const mcpRegisteredPrompts: Map<string, RegisteredPrompt> = new Map();

function buildZodArgsShape(variables: Record<string, StoredPromptVariable>): Record<string, z.ZodTypeAny> {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const varName in variables) {
        const varDef = variables[varName];
        let fieldSchema = z.string();
        if (varDef.description) {
            fieldSchema = fieldSchema.describe(varDef.description);
        }
        if (varDef.required === false) {
            shape[varName] = fieldSchema.optional();
        } else {
            shape[varName] = fieldSchema;
        }
    }
    return shape;
}

const PROMPTS_DIR = DEFAULT_PROMPTS_DIR;

async function getActiveStoredPrompt(id: string): Promise<StoredPrompt | null> {
    return await readPromptFileFromDir(id, PROMPTS_DIR);
}

async function registerOrUpdateMcpPrompt(promptData: StoredPrompt): Promise<void> {
    const argsShape = buildZodArgsShape(promptData.variables);

    const promptCallback = async (argsFromClient: Record<string, string>): Promise<GetPromptResult> => {
        // Always read the "active" version of the prompt for execution
        const currentPromptData = await getActiveStoredPrompt(promptData.id);
        if (!currentPromptData) {
            throw new McpError(ErrorCode.InternalError, `Prompt ${promptData.id} not found on disk during get. This shouldn't happen if it was registered.`);
        }
        for (const varName in currentPromptData.variables) {
            const varDef = currentPromptData.variables[varName];
            if ((varDef.required !== false) && !(varName in argsFromClient)) {
                throw new McpError(ErrorCode.InvalidParams, `Missing required argument '${varName}' for prompt '${currentPromptData.id}'.`);
            }
        }
        const processedContent = applyTemplate(currentPromptData.content, argsFromClient);
        return {
            description: currentPromptData.description,
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: processedContent,
                    },
                },
            ],
        };
    };

    if (mcpRegisteredPrompts.has(promptData.id)) {
        const existingMcpPrompt = mcpRegisteredPrompts.get(promptData.id)!;
        existingMcpPrompt.update({
            description: promptData.description || `Prompt: ${promptData.id}`,
            argsSchema: argsShape,
            callback: promptCallback,
        });
        // Use console.error for server-side logs not tied to a specific request context
        console.error(`Updated MCP registration for prompt: ${promptData.id}`);
    } else {
        const newMcpPrompt = mcpServer.prompt(
            promptData.id,
            promptData.description || `Prompt: ${promptData.id}`,
            argsShape,
            promptCallback
        );
        mcpRegisteredPrompts.set(promptData.id, newMcpPrompt);
        console.error(`Registered new MCP prompt: ${promptData.id}`);
    }
}

async function removeMcpPromptRegistration(id: string): Promise<void> {
    const mcpPrompt = mcpRegisteredPrompts.get(id);
    if (mcpPrompt) {
        mcpPrompt.remove();
        mcpRegisteredPrompts.delete(id);
        console.error(`Removed MCP registration for prompt: ${id}`);
    }
}

// --- MCP Tools for Prompt Management ---

const addPromptArgsSchema = z.object({
    id: z.string().min(1).describe("Unique ID for the prompt"),
    content: z.string().describe("The prompt content template (e.g., 'Hello, {{name}}!')"),
    description: z.string().optional().describe("Description of the prompt for MCP listing"),
    tags: z.array(z.string()).optional().default([]).describe("Tags for categorizing the prompt"),
    variables: z.record(z.string(), z.object({
        description: z.string().optional(),
        required: z.boolean().optional(),
    })).optional().default({}).describe("Schema for template variables (e.g., { name: { description: 'User name', required: true } })"),
    metadata: z.record(z.string(), z.unknown()).optional().default({}).describe("Additional metadata"),
});
mcpServer.tool(
    'add_prompt',
    'Adds a new prompt to the project-specific prompt directory.',
    addPromptArgsSchema.shape,
    async (args: any, context: any): Promise<CallToolResult> => {
        const { id, content, description, tags, variables, metadata } = args as z.infer<typeof addPromptArgsSchema>;
        if (await readPromptFileFromDir(id, PROMPTS_DIR)) {
            throw new McpError(ErrorCode.InvalidParams, `Prompt with ID '${id}' already exists in the prompt directory '${PROMPTS_DIR}'.`);
        }
        const newPrompt: StoredPrompt = { id, description, content, tags, variables, metadata };
        await writePromptFileToDir(newPrompt, PROMPTS_DIR);
        await registerOrUpdateMcpPrompt(newPrompt);
        await context.sendNotification({
            method: 'notifications/message',
            params: { level: 'info', data: `Tool 'add_prompt' created prompt: ${id} in project directory.` }
        } as LoggingMessageNotification);
        return { content: [{ type: 'text', text: `Prompt '${id}' added successfully to project directory.` }] };
    }
);

const getPromptFileContentArgsSchema = z.object({
    id: z.string().min(1).describe("ID of the prompt to retrieve its file content"),
});
mcpServer.tool(
    'get_prompt_file_content',
    'Retrieves the raw JSON definition of the active prompt (project-specific or user global default).',
    getPromptFileContentArgsSchema.shape,
    async (args): Promise<CallToolResult> => {
        const { id } = args as z.infer<typeof getPromptFileContentArgsSchema>;
        const promptData = await getActiveStoredPrompt(id); // Fetches active version
        if (!promptData) {
            throw new McpError(ErrorCode.MethodNotFound, `Prompt file for ID '${id}' not found in project or user global defaults.`);
        }
        return { content: [{ type: 'text', text: JSON.stringify(promptData, null, 2) }] };
    }
);

const updatePromptArgsSchema = z.object({
    id: z.string().min(1).describe("ID of the prompt to update"),
    content: z.string().optional().describe("New prompt content template"),
    description: z.string().optional().describe("New description for the prompt"),
    tags: z.array(z.string()).optional().describe("New set of tags (replaces existing)"),
    variables: z.record(z.string(), z.object({
        description: z.string().optional(),
        required: z.boolean().optional(),
    })).optional().describe("New schema for template variables (replaces existing)"),
    metadata: z.record(z.string(), z.unknown()).optional().describe("New metadata (replaces existing)"),
});
mcpServer.tool(
    'update_prompt',
    'Updates an existing prompt. Updates are always written to the project-specific directory, creating an override if necessary.',
    updatePromptArgsSchema.shape,
    async (args: any, context: any): Promise<CallToolResult> => {
        const { id, ...updates } = args as z.infer<typeof updatePromptArgsSchema>;
        const existingPrompt = await getActiveStoredPrompt(id);

        if (!existingPrompt) {
            throw new McpError(ErrorCode.MethodNotFound, `Prompt with ID '${id}' not found for update.`);
        }

        const updatedPromptData: StoredPrompt = {
            ...existingPrompt,
            id: id,
            content: updates.content !== undefined ? updates.content : existingPrompt.content,
            description: updates.description !== undefined ? updates.description : existingPrompt.description,
            tags: updates.tags !== undefined ? updates.tags : existingPrompt.tags,
            variables: updates.variables !== undefined ? updates.variables : existingPrompt.variables,
            metadata: updates.metadata !== undefined ? updates.metadata : existingPrompt.metadata,
        };

        await writePromptFileToDir(updatedPromptData, PROMPTS_DIR);
        await registerOrUpdateMcpPrompt(updatedPromptData);
        await context.sendNotification({
            method: 'notifications/message',
            params: { level: 'info', data: `Tool 'update_prompt' modified prompt: ${id}. Changes saved to project directory.` }
        } as LoggingMessageNotification);
        return { content: [{ type: 'text', text: `Prompt '${id}' updated successfully in project directory.` }] };
    }
);

const deletePromptArgsSchema = z.object({
    id: z.string().min(1).describe("ID of the prompt to delete"),
});
mcpServer.tool(
    'delete_prompt',
    'Deletes a prompt from the project-specific directory. If a user global default with the same ID exists, it will become active.',
    deletePromptArgsSchema.shape,
    async (args: any, context: any): Promise<CallToolResult> => {
        const { id } = args as z.infer<typeof deletePromptArgsSchema>;
        const deleted = await deletePromptFileFromDir(id, PROMPTS_DIR);

        if (!deleted) {
            throw new McpError(ErrorCode.MethodNotFound, `Prompt with ID '${id}' not found in prompt directory '${PROMPTS_DIR}'.`);
        }

        const nowActivePrompt = await getActiveStoredPrompt(id);
        if (nowActivePrompt) {
            await registerOrUpdateMcpPrompt(nowActivePrompt);
        } else {
            await removeMcpPromptRegistration(id);
        }
        await context.sendNotification({
            method: 'notifications/message',
            params: { level: 'info', data: `Tool 'delete_prompt' removed prompt: ${id} from project directory.` }
        } as LoggingMessageNotification);
        return { content: [{ type: 'text', text: `Prompt '${id}' deleted successfully from project directory. User global default may now be active if it exists.` }] };
    }
);

const filterPromptsByTagsArgsSchema = z.object({
    tags: z.array(z.string()).min(1).describe("Filter prompts by tags (must match all specified tags)"),
});
mcpServer.tool(
    'filter_prompts_by_tags',
    'Lists active prompts (project-specific or user global defaults) that match all specified tags.',
    filterPromptsByTagsArgsSchema.shape,
    async (args): Promise<CallToolResult> => {
        const { tags: filterTags } = args as z.infer<typeof filterPromptsByTagsArgsSchema>;

        const promptFiles = await fs.readdir(PROMPTS_DIR).catch(() => []);
        const activePrompts: StoredPrompt[] = [];
        for (const file of promptFiles) {
            if (file.endsWith('.json')) {
                const id = path.basename(file, '.json');
                const promptData = await getActiveStoredPrompt(id);
                if (promptData) {
                    activePrompts.push(promptData);
                }
            }
        }

        const filteredPrompts = activePrompts.filter(p =>
            filterTags.every(tag => p.tags.includes(tag))
        );

        if (filteredPrompts.length === 0) {
            return { content: [{ type: 'text', text: "No active prompts found matching all specified tags." }] };
        }
        const summary = filteredPrompts.map(p => ({ id: p.id, description: p.description, tags: p.tags }));
        return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    }
);

const loadDefaultPromptsArgsSchema = z.object({});
mcpServer.tool(
    'load_default_prompts',
    'Loads all default prompts from the default_prompts_data directory into the active prompt directory, skipping any that already exist.',
    loadDefaultPromptsArgsSchema.shape,
    async (_args: any, context: any): Promise<CallToolResult> => {
        let copied: string[] = [];
        let skipped: string[] = [];
        try {
            const files = await fs.readdir(PROJECT_INITIAL_DEFAULTS_SRC_DIR);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const id = path.basename(file, '.json');
                    if (await readPromptFileFromDir(id, PROMPTS_DIR)) {
                        skipped.push(id);
                        continue;
                    }
                    const sourcePromptData = await readPromptFileFromDir(id, PROJECT_INITIAL_DEFAULTS_SRC_DIR);
                    if (sourcePromptData) {
                        await writePromptFileToDir(sourcePromptData, PROMPTS_DIR);
                        copied.push(id);
                    }
                }
            }
            if (copied.length > 0) {
                console.error(`Auto-loaded ${copied.length} default prompt(s) into ~/.promptregistry: ${copied.join(', ')}`);
            } else {
                console.error('No new default prompts loaded into ~/.promptregistry.');
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(`Error auto-loading default prompts: ${(error as Error).message}`);
            }
        }
        await context.sendNotification({
            method: 'notifications/message',
            params: { level: 'info', data: `Tool 'load_default_prompts' copied ${copied.length} prompt(s), skipped ${skipped.length}.` }
        } as LoggingMessageNotification);
        return {
            content: [{
                type: 'text',
                text: `Copied: ${copied.length} prompt(s): ${copied.join(', ') || 'none'}\nSkipped (already present): ${skipped.length} prompt(s): ${skipped.join(', ') || 'none'}`
            }]
        };
    }
);

// --- Server Initialization and Start ---

async function loadAndRegisterPrompts(): Promise<void> {
    console.error('Attempting to create prompt directory:', PROMPTS_DIR);
    await ensureDirExists(PROMPTS_DIR);

    // If using the default directory (not overridden by env), auto-load defaults
    if (!process.env.PROMPT_REGISTRY_PROJECT_DIR) {
        let copied: string[] = [];
        let skipped: string[] = [];
        try {
            const files = await fs.readdir(PROJECT_INITIAL_DEFAULTS_SRC_DIR);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const id = path.basename(file, '.json');
                    if (await readPromptFileFromDir(id, PROMPTS_DIR)) {
                        skipped.push(id);
                        continue;
                    }
                    const sourcePromptData = await readPromptFileFromDir(id, PROJECT_INITIAL_DEFAULTS_SRC_DIR);
                    if (sourcePromptData) {
                        await writePromptFileToDir(sourcePromptData, PROMPTS_DIR);
                        copied.push(id);
                    }
                }
            }
            if (copied.length > 0) {
                console.error(`Auto-loaded ${copied.length} default prompt(s) into ~/.promptregistry: ${copied.join(', ')}`);
            } else {
                console.error('No new default prompts loaded into ~/.promptregistry.');
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(`Error auto-loading default prompts: ${(error as Error).message}`);
            }
        }
    }

    const prompts = await getAllPromptFilesDataFromDir(PROMPTS_DIR);
    for (const promptData of prompts) {
        await registerOrUpdateMcpPrompt(promptData);
    }
    console.error(`Server initialized. Registered ${prompts.length} prompts.`);
}

async function startServer(): Promise<void> {
    await loadAndRegisterPrompts();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    // Use console.error for critical server status messages that should always appear
    console.error('Prompt Management MCP Server is running on stdio.');
    console.error('Send JSON-RPC requests to stdin.');
}

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});