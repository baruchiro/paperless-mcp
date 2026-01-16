# Paperless-NGX MCP Server - Copilot Instructions

## Project Overview

This is a Model Context Protocol (MCP) server for interacting with Paperless-NGX document management system. It enables AI assistants like Claude to manage documents, tags, correspondents, and document types through the Paperless-NGX API.

**Tech Stack:**
- TypeScript with Node.js
- MCP SDK (@modelcontextprotocol/sdk)
- Express for HTTP transport mode
- Axios for API requests
- Zod for schema validation

## Repository Structure

```
src/
├── api/
│   ├── PaperlessAPI.ts       # Main API client for Paperless-NGX
│   ├── types.ts              # TypeScript type definitions
│   ├── utils.ts              # API utility functions
│   └── documentEnhancer.ts   # Document response enhancement
├── tools/
│   ├── documents.ts          # Document management tools
│   ├── tags.ts               # Tag management tools
│   ├── correspondents.ts     # Correspondent management tools
│   ├── documentTypes.ts      # Document type management tools
│   ├── customFields.ts       # Custom field management tools
│   └── utils/                # Shared tool utilities
├── index.ts                  # Entry point and server setup
```

## Build and Development Commands

### Essential Commands
- **Build:** `npm run build` - Compiles TypeScript to JavaScript in `build/` directory
- **Start:** `npm run start` - Run the server with ts-node (development)
- **Test:** `npm test` - Currently no tests defined (outputs error and exits)
- **Pack:** `npm run dxt-pack` - Package for DXT distribution
- **Inspect:** `npm run inspect` - Build and run with MCP inspector

### Running the Server
```bash
# STDIO mode (default)
npm run start -- --baseUrl http://localhost:8000 --token your-api-token

# HTTP mode
npm run start -- --baseUrl http://localhost:8000 --token your-api-token --http --port 3000

# Using environment variables
export PAPERLESS_URL=http://localhost:8000
export PAPERLESS_API_KEY=your-api-token
npm run start
```

## Code Style and Conventions

### TypeScript Standards
- **Strict mode enabled** - All strict type checking options are on
- **noImplicitAny: false** - Implicit any types are allowed
- **Target:** ES2016
- **Module:** CommonJS with Node resolution
- **Output:** `build/` directory with declaration files

### Code Patterns and Best Practices

1. **Use Zod for validation** - All tool inputs must be validated with Zod schemas
   ```typescript
   server.tool("tool_name", "description", {
     param: z.string(),
     optional: z.number().optional()
   }, async (args) => { ... });
   ```

2. **Error handling** - Wrap tool handlers with `withErrorHandling` middleware
   ```typescript
   withErrorHandling(async (args, extra) => {
     // Implementation
   })
   ```

3. **API requests** - Use the PaperlessAPI class for all API interactions
   ```typescript
   const api = new PaperlessAPI(baseUrl, token);
   await api.request('/path', { method: 'POST', body: JSON.stringify(data) });
   ```

4. **Document enhancement** - Use `convertDocsWithNames()` to enrich document responses with human-readable names for tags, correspondents, etc.

5. **Empty value handling** - Use transformation utilities from `tools/utils/empty.ts`:
   - `arrayNotEmpty` - Converts empty arrays to undefined
   - `objectNotEmpty` - Converts empty objects to undefined

### Naming Conventions
- **Files:** camelCase for TypeScript files (e.g., `PaperlessAPI.ts`, `documentEnhancer.ts`)
- **Classes:** PascalCase (e.g., `PaperlessAPI`)
- **Functions:** camelCase (e.g., `registerDocumentTools`, `bulkEditDocuments`)
- **Constants:** camelCase with const (e.g., `resolvedBaseUrl`)
- **Types/Interfaces:** PascalCase (e.g., `Document`, `Tag`, `Correspondent`)

### MCP Tool Naming
- Tools use snake_case (e.g., `list_documents`, `bulk_edit_documents`, `create_tag`)
- Tool names should be descriptive and action-oriented

### Comments and Documentation
- Minimal inline comments - code should be self-documenting
- JSDoc comments for complex functions or API methods
- Tool descriptions must clearly explain critical behaviors (e.g., delete vs remove operations)
- Include warnings for destructive operations

## MCP Server Specific Guidelines

### Tool Registration
All tools must be registered in `src/index.ts` using dedicated registration functions:
```typescript
registerDocumentTools(server, api);
registerTagTools(server, api);
registerCorrespondentTools(server, api);
registerDocumentTypeTools(server, api);
registerCustomFieldTools(server, api);
```

### Transport Modes
The server supports three transport modes:
1. **STDIO** (default) - Standard input/output, for CLI integrations
2. **HTTP** - Streamable HTTP transport via Express
3. **SSE** - Server-Sent Events (implementation in progress)

### Critical Behaviors to Document
When creating or modifying tools, clearly distinguish:
- **REMOVE operations** - Affect only specified documents (e.g., `remove_tag`)
- **DELETE operations** - Permanently delete from entire system (e.g., `delete_tag`, `delete` method)
- Destructive operations should require confirmation parameter

## Security and Safety

### Never Touch
- **Do not modify:** `.github/workflows/` - CI/CD configurations
- **Do not commit:** Environment files (`.env`, `.env.local`, `.env.*.local`)
- **Do not commit:** Build artifacts (`build/`, `dist/`, `*.dxt`)
- **Do not commit:** Dependencies (`node_modules/`)

### API Token Handling
- Tokens are passed via environment variables or CLI arguments
- Never hardcode API tokens in source code
- API token validation happens in `src/index.ts` at startup

### Destructive Operations
- Deletion tools must include confirmation parameters
- Provide clear warnings in tool descriptions
- Log errors with context but avoid exposing sensitive data

## Testing and Validation

### Current State
- No automated tests currently exist (`npm test` returns error)
- Manual testing via `npm run inspect` with MCP inspector
- Test against a real Paperless-NGX instance

### When Adding Features
- Test all CRUD operations for new tools
- Verify Zod schema validation with invalid inputs
- Test both STDIO and HTTP transport modes
- Ensure error messages are clear and actionable

## Dependencies

### Production Dependencies
- `@modelcontextprotocol/sdk` - MCP server implementation
- `axios` - HTTP client for API requests
- `express` - HTTP server for HTTP transport mode
- `form-data` - Multipart form data for file uploads
- `typescript` - TypeScript compiler
- `zod` - Schema validation

### Development Dependencies
- `@anthropic-ai/dxt` - Distribution packaging
- `@changesets/cli` - Version management
- `@types/express`, `@types/node` - TypeScript type definitions
- `ts-node` - TypeScript execution for development

## Common Tasks

### Adding a New Tool
1. Add tool definition to appropriate file in `src/tools/`
2. Define Zod schema for parameters
3. Implement handler with `withErrorHandling` wrapper
4. Add corresponding API method in `PaperlessAPI` class if needed
5. Update types in `src/api/types.ts` if needed
6. Test with MCP inspector

### Modifying API Client
1. Update method in `src/api/PaperlessAPI.ts`
2. Update type definitions in `src/api/types.ts`
3. Ensure error handling includes useful context
4. Maintain consistent request/response patterns

### Publishing Updates
1. Use changesets for version management: `npx changeset`
2. Build before publishing: `npm run build`
3. Package is auto-published via GitHub Actions on release

## Related Documentation
- [Paperless-NGX API Documentation](https://docs.paperless-ngx.com/api/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Repository README](../README.md)
