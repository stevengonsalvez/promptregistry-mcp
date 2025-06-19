#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

// Example of exactly what you requested - clean markdown with dynamic JSON generation
const originalPromptText = `**IMPORTANT**: This prompt is an addendum to your existing system prompt. Apply these guidelines in addition to your base capabilities.

You are an expert software engineer and systematic problem solver working in collaboration with Stevie. Your core strength lies in breaking down complex coding challenges into manageable tasks and executing them methodically with extreme efficiency.

## Communication Protocol

<interaction_requirements>
- Address the user as "Stevie" in all communications
- Think of your relationship as colleagues working as a team
- Stevie's success is your success - solve problems together through complementary expertise
- Push back with evidence when you disagree - this leads to better solutions
- Use irreverent humor when appropriate, but prioritize task completion
- You have extensive knowledge; Stevie has real-world experience
- Both should admit when you don't know something
- Cite evidence when making technical arguments
- Balance collaboration with efficiency
</interaction_requirements>

...

**STEVIE'S CURRENT GOAL/REQUEST:**
{{user_goal_or_request}}`;

const promptObject = {
    id: "agentic-coder-enhanced",
    description: "An expert software engineer and systematic problem solver that collaborates with 'Stevie'...",
    content: originalPromptText, // JSON.stringify will handle this
    tags: [
        "agentic-coding",
        "software-engineering",
        "problem-solving",
        "task-management",
        "documentation",
        "collaboration",
        "cli"
    ],
    variables: {
        "user_goal_or_request": {
            description: "The primary goal, task, or coding request from Stevie that the agent should focus on.",
            required: true
        },
        "project_memory_file_name": {
            description: "The name of the project-specific memory/context file (e.g., 'AmazonQ.md', 'ProjectContext.md', '.project-memory'). Defaults to 'AmazonQ.md' if not provided.",
            required: false
        }
    },
    metadata: {
        version: "1.1-templated",
        persona_type: "agentic-coder-collaborator",
        prompt_style: "structured-xml-tags"
    }
};

const jsonStringOutput = JSON.stringify(promptObject, null, 2);

console.log("🎉 Refactored Prompt Management System Demo");
console.log("=".repeat(50));
console.log("\n✅ Structure Overview:");
console.log("📁 default_prompts_data/");
console.log("   ├── agentic-coder-enhanced.md      (Clean markdown content)");
console.log("   ├── agentic-coder-enhanced.json    (Metadata + contentFile reference)");
console.log("   ├── prompt-writing-assistant.md    (Clean markdown content)");
console.log("   └── prompt-writing-assistant.json  (Metadata + contentFile reference)");
console.log("\n💡 Benefits:");
console.log("• ✨ Clean, readable markdown files for content");
console.log("• 📝 Easy editing without JSON escaping");
console.log("• 🔧 Separate concerns: content vs metadata");
console.log("• 🏗️  Build-time or runtime combination");
console.log("• 🎯 Version control friendly");

console.log("\n📄 Example Generated JSON Structure:");
console.log("```javascript");
console.log("const originalPromptText = `**IMPORTANT**: This prompt is...");
console.log("{{user_goal_or_request}}`;");
console.log("");
console.log("const promptObject = {");
console.log(`  id: "${promptObject.id}",`);
console.log(`  description: "${promptObject.description}",`);
console.log("  content: originalPromptText, // Clean, no escaping needed!");
console.log(`  tags: ${JSON.stringify(promptObject.tags, null, 2).split('\n').join('\n    ')},`);
console.log("  variables: { /* template variables */ },");
console.log("  metadata: { /* additional metadata */ }");
console.log("};");
console.log("```");

// Show current structure working
async function demonstrateCurrentStructure() {
    try {
        console.log("\n🔍 Current Implementation Demo:");
        console.log("Reading agentic-coder-enhanced.json + .md...");

        const metadataPath = 'default_prompts_data/agentic-coder-enhanced.json';
        const metadataContent = await fs.readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);

        if (metadata.contentFile) {
            const markdownPath = path.join('default_prompts_data', metadata.contentFile);
            const markdownContent = await fs.readFile(markdownPath, 'utf-8');

            console.log(`✅ Successfully loaded:`);
            console.log(`   📋 Metadata: ${Object.keys(metadata).join(', ')}`);
            console.log(`   📝 Content: ${markdownContent.length} characters`);
            console.log(`   🏷️  Tags: ${metadata.tags.join(', ')}`);
            console.log(`   🔀 Variables: ${Object.keys(metadata.variables).join(', ')}`);

            // This is what your server now does automatically!
            const combinedPrompt = {
                ...metadata,
                content: markdownContent
            };

            console.log("\n🎯 Combined prompt object ready for MCP server!");
            console.log(`   📊 Total size: ${JSON.stringify(combinedPrompt).length} characters`);
        }
    } catch (error) {
        console.log(`⚠️  Demo files not found (${error.message})`);
        console.log("   This is expected if running before setup completion");
    }
}

await demonstrateCurrentStructure();

console.log("\n🚀 Next Steps:");
console.log("1. Run server: All existing prompts work unchanged");
console.log("2. Edit .md files: Much easier than JSON strings");
console.log("3. Add new prompts: Create .md + .json pairs");
console.log("4. Use build script: Generate legacy format if needed");
console.log("\n✨ Your prompts are now maintainable and version-control friendly!"); 