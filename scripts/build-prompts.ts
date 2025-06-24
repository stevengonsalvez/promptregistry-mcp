#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';

interface StoredPromptVariable {
    description?: string;
    required?: boolean;
}

interface PromptMetadata {
    id: string;
    description?: string;
    contentFile: string;
    tags: string[];
    variables: Record<string, StoredPromptVariable>;
    metadata: Record<string, unknown>;
}

interface StoredPrompt {
    id: string;
    description?: string;
    content: string;
    tags: string[];
    variables: Record<string, StoredPromptVariable>;
    metadata: Record<string, unknown>;
}

const SOURCE_DIR = 'default_prompts_data';
const OUTPUT_DIR = 'generated_prompts';

async function buildPrompts() {
    console.log('🔨 Building prompts from markdown + metadata...');

    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // Read all JSON metadata files
    const files = await fs.readdir(SOURCE_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    for (const jsonFile of jsonFiles) {
        try {
            const jsonPath = path.join(SOURCE_DIR, jsonFile);
            const metadataContent = await fs.readFile(jsonPath, 'utf-8');
            const metadata: PromptMetadata = JSON.parse(metadataContent);

            // Check if this metadata references a markdown file
            if (metadata.contentFile) {
                console.log(`📄 Processing ${metadata.id}...`);

                // Read the markdown content
                const markdownPath = path.join(SOURCE_DIR, metadata.contentFile);
                let markdownContent: string;

                try {
                    markdownContent = await fs.readFile(markdownPath, 'utf-8');
                } catch (error) {
                    console.error(`❌ Error reading markdown file ${metadata.contentFile}:`, error);
                    continue;
                }

                // Create the complete prompt object (like your example)
                const originalPromptText = markdownContent;

                const promptObject: StoredPrompt = {
                    id: metadata.id,
                    description: metadata.description,
                    content: originalPromptText, // JSON.stringify will handle this
                    tags: metadata.tags,
                    variables: metadata.variables,
                    metadata: metadata.metadata
                };

                // Generate the complete JSON
                const jsonStringOutput = JSON.stringify(promptObject, null, 2);

                // Write to output directory
                const outputPath = path.join(OUTPUT_DIR, jsonFile);
                await fs.writeFile(outputPath, jsonStringOutput);

                console.log(`✅ Generated ${outputPath}`);

                // Optionally show the structure like your example
                if (process.argv.includes('--verbose')) {
                    console.log('\n📝 Example of how this is structured:');
                    console.log('```typescript');
                    console.log(`const originalPromptText = \`${markdownContent.slice(0, 100)}...\`;`);
                    console.log('');
                    console.log('const promptObject = {');
                    console.log(`  id: "${metadata.id}",`);
                    console.log(`  description: "${metadata.description}",`);
                    console.log('  content: originalPromptText, // JSON.stringify will handle this');
                    console.log(`  tags: ${JSON.stringify(metadata.tags)},`);
                    console.log('  variables: { /* ... */ },');
                    console.log('  metadata: { /* ... */ }');
                    console.log('};');
                    console.log('```\n');
                }
            }
        } catch (error) {
            console.error(`❌ Error processing ${jsonFile}:`, error);
        }
    }

    console.log('\n🎉 Build complete!');
    console.log(`📁 Generated files are in ./${OUTPUT_DIR}/`);
    console.log('💡 Run with --verbose to see the TypeScript structure example');
}

// Run the build
buildPrompts().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
}); 