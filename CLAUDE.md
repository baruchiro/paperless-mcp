# Paperless-NGX MCP Server - Claude Instructions

> These are the project's AI instructions, read automatically by Claude Code as `CLAUDE.md`. They are the single source of truth for how to work in this repo - they previously lived in `.github/copilot-instructions.md` and `.cursor/rules/*.mdc`, which have been consolidated here.

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

1. **Tool registration with Zod validation and error handling** - All tools should follow this pattern:
   ```typescript
   server.tool(
     "tool_name",
     "Tool description explaining what it does",
     {
       param: z.string(),
       optional_param: z.number().optional()
     },
     withErrorHandling(async (args, extra) => {
       // Implementation
       return {
         content: [{ type: "text", text: JSON.stringify(result) }]
       };
     })
   );
   ```

2. **API requests** - Use the PaperlessAPI class for all API interactions
   ```typescript
   const api = new PaperlessAPI(baseUrl, token);
   await api.request('/path', { method: 'POST', body: JSON.stringify(data) });
   ```

3. **Document enhancement** - Use `convertDocsWithNames()` from `src/api/documentEnhancer.ts` to enrich document responses with human-readable names for tags, correspondents, document types, and custom fields

4. **Empty value handling** - Use transformation utilities from `tools/utils/empty.ts`:
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
- **Do not write comments that restate the code they precede.** If the next line is `if (!isAbsolute(path))`, do not add a comment saying "path must be absolute" - the code already says that. Comments must add information the code cannot convey (the *why*, a non-obvious constraint, a reference), never paraphrase the *what*.
- Prefer deleting a redundant comment over keeping it. When in doubt, leave it out.
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
2. **HTTP** - Streamable HTTP transport via Express (POST to `/mcp` endpoint)
3. **SSE** - Server-Sent Events via Express (GET to `/sse` endpoint, POST messages to `/messages?sessionId=<id>`)

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
- **Do not commit:** Scratch, process, or summary files generated while working - e.g. `REVIEW_SUMMARY.md`, `NOTES.md`, `CHANGES.md`, `PLAN.md`, `TODO.md`, or anything describing *what you did*. These belong in the PR description or commit message, never in the repository. Before committing, review the file list and exclude anything that is not part of the actual change.

### Do Not Add New Repo-Level Files Unasked
- Do not create new top-level / meta files such as `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub templates, or new docs unless the task explicitly asks for them. A feature PR should change only what the feature needs.
- If a change seems to warrant a new policy/meta file, raise it in the PR description and let a maintainer decide - do not add it silently.
- New runtime files (source, tests, fixtures) are expected; the constraint is about documentation and project-governance files that change the project's surface area.

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
- Test against a real Paperless-NGX instance (use a test/development instance to avoid data corruption)

### When Adding Features
- Test all CRUD operations for new tools
- Verify Zod schema validation with invalid inputs
- Test both STDIO and HTTP transport modes
- Ensure error messages are clear and actionable

## Dependencies

### Production Dependencies
- `@modelcontextprotocol/sdk` (^1.11.1) - MCP server implementation
- `axios` (^1.9.0) - HTTP client for API requests
- `express` (^5.1.0) - HTTP server for HTTP transport mode
- `form-data` (^4.0.2) - Multipart form data for file uploads
- `typescript` (^5.8.3) - TypeScript compiler (Note: Listed as production dependency in this project)
- `zod` (^3.24.1) - Schema validation

### Development Dependencies
- `@anthropic-ai/dxt` (^0.2.6) - Distribution packaging
- `@changesets/cli` (^2.29.4) - Version management
- `@types/express` (^5.0.2) - TypeScript type definitions for Express
- `@types/node` (^22.15.17) - TypeScript type definitions for Node.js
- `ts-node` (^10.9.2) - TypeScript execution for development

## Common Tasks

### Adding a New Tool
1. Add tool definition to appropriate file in `src/tools/`
2. Define Zod schema for parameters
3. Implement handler with `withErrorHandling` wrapper
4. Add corresponding API method in `PaperlessAPI` class if needed
5. Update types in `src/api/types.ts` if needed
6. Test with MCP inspector
7. **Create a changeset:** `npx changeset` (select `minor` for new features)

### Modifying API Client
1. Update method in `src/api/PaperlessAPI.ts`
2. Update type definitions in `src/api/types.ts`
3. Ensure error handling includes useful context
4. Maintain consistent request/response patterns
5. **Create a changeset:** `npx changeset` (select appropriate version bump type)

### Creating Changesets (Required for All Changes)

**IMPORTANT:** Every code change must include a changeset file to enable proper version management and changelog generation.

1. **Create a changeset** after making code changes:
   ```bash
   npx changeset
   ```

2. **Answer the prompts:**
   - Select the type of change:
     - `patch` - Bug fixes, small changes (0.0.X)
     - `minor` - New features, backward compatible (0.X.0)
     - `major` - Breaking changes (X.0.0)
   - Write a clear summary of your changes

3. **Commit the generated file:**
   - Changesets creates a `.changeset/[random-name].md` file
   - Commit this file along with your code changes
   - The file contains version bump info and your change description

4. **Changeset configuration:**
   - Located in `.changeset/config.json`
   - Base branch: `main`
   - Automated via GitHub Actions (see `.github/workflows/release.yml`)
   - On merge to main, changesets automatically:
     - Creates/updates a "Version Packages" PR
     - Updates package.json version
     - Updates CHANGELOG.md
     - Publishes to npm with provenance

### Publishing Updates
1. **Always create a changeset** for your changes: `npx changeset`
2. Build before publishing: `npm run build`
3. Package is auto-published via GitHub Actions when "Version Packages" PR is merged

## Code Review Guidelines (for AI reviewers)

When reviewing a pull request in this repository, enforce everything above. The maintainer has repeatedly had to flag the same issues by hand - catch them in review instead. In particular:

### Always Flag
1. **Stray files** - Any committed file that is not part of the feature: scratch/summary docs (`REVIEW_SUMMARY.md`, `NOTES.md`, etc.), build artifacts, dependencies, or env files. Ask why it is in the diff and recommend removal.
2. **Unsolicited meta files** - A new `SECURITY.md`, `CONTRIBUTING.md`, GitHub template, or similar that the PR's stated goal did not call for. Ask "what is this file and does this PR need it?"
3. **Redundant comments** - Comments that merely restate the line(s) they precede (e.g. a "must be absolute" comment directly above `if (!isAbsolute(...))`). Recommend deleting them. Keep only comments that explain *why*.
4. **Missing changeset** - Any code change without a `.changeset/*.md` file (see the changeset section above).
5. **Schema vs. runtime drift** - MCP tool params validated in prose/description but not enforced in the Zod schema. Constraints (required/mutually-exclusive params, absolute paths, etc.) belong in the schema.
6. **Blocking I/O** - Synchronous `fs` calls (`readFileSync`, `existsSync`, `statSync`) in async handlers. Require the `fs/promises` equivalents.
7. **Path / security boundaries** - File-path inputs that are not validated as absolute, not confined to an allowlist, and not symlink-resolved with `fs.promises.realpath` before the allowlist check (`path.resolve` alone does NOT dereference symlinks).
8. **Placeholder tests** - Tests that `assert.ok(true)` or re-check local strings instead of driving the real handler/helper. Require assertions against actual thrown errors and actual arguments passed to the API.

### Review Style
- Be specific and actionable: name the file/line and state the concrete change you want.
- Prefer the smallest correct fix. Do not request large refactors for a focused PR; if the change is architecturally significant, say so and defer to the maintainer.
- Verify each finding against the current code before raising it - do not flag issues that were already addressed in a later commit.
- Keep feedback concise. One clear comment per issue beats a wall of text.

## API Validation and Type Safety

### OpenAPI Specification Reference

The authoritative source for all API endpoints, request/response schemas, and validation rules is `Paperless_ngx_REST_API.yaml`. This OpenAPI 3.0.3 specification defines all endpoints and HTTP methods, request/response schemas and data types, required vs optional parameters, authentication requirements, and error response formats.

### Type Definitions

All TypeScript interfaces must be defined in `src/api/types.ts` and match the OpenAPI schema definitions exactly:

- **Pagination**: Use `PaginationResponse<T>` for list endpoints
- **Entity Types**: Define interfaces matching the API schema (e.g., `Tag`, `Document`, `Correspondent`)
- **Request Types**: Use `Partial<T>` for create/update operations
- **Response Types**: Extend `PaginationResponse<T>` for list responses

Validation rules:
1. **Schema Compliance**: All types must match OpenAPI schema definitions exactly
2. **Required Fields**: Mark required fields as non-optional in TypeScript
3. **Optional Fields**: Use `?` for optional fields, `| null` for nullable fields
4. **Enums**: Use union types for enum values defined in the API spec
5. **Nested Objects**: Define separate interfaces for complex nested structures

### API Implementation

The `src/api/PaperlessAPI.ts` class implements all API operations:

- **Base URL**: Always use `/api` prefix for all endpoints
- **Authentication**: Include `Authorization: Token ${token}` header
- **Content-Type**: Use `application/json` for JSON requests
- **Version**: Include `Accept: application/json; version=5` header
- **File Uploads**: Use `FormData` for multipart requests
- Use generic types for all API calls; return typed responses matching defined interfaces
- Check HTTP status codes and handle errors gracefully

### Validation Checklist

When adding or modifying endpoints:
1. Verify the endpoint exists in `Paperless_ngx_REST_API.yaml`
2. Add/update interfaces in `src/api/types.ts`
3. Implement the method in `src/api/PaperlessAPI.ts`
4. Add the corresponding MCP tool following patterns in `src/tools/`
5. Include proper error handling and validation
6. Verify against actual API responses

Common issues to watch for: missing required fields, type mismatches, wrong enum values, mishandled nullable fields, and non-ISO 8601 date formats.

## TypeScript Type Safety

### Avoid Using `any`

Never use `any` unless absolutely necessary. Prefer:
- Specific interfaces/types for API parameters, responses, and function signatures
- `Record<string, unknown>` for objects with unknown structure
- `unknown` for truly unknown types (including caught errors: `catch (error: unknown)`)
- Union types for multiple possible types

Instead of:

```typescript
let apiParameters: any = {};
```

Define an interface:

```typescript
interface ApiParameters {
  custom_fields?: Array<{
    field: number;
    value: string | number | boolean | null;
  }>;
  add_tags?: number[];
  remove_tags?: number[];
}

let apiParameters: ApiParameters = {};
```

- Define interfaces in `src/api/types.ts` and reuse existing types.
- Prefer explicit type annotations for arguments and return values, especially for exported functions and tool handlers.
- Use Zod schemas for runtime validation of tool arguments where applicable.

## MCP Server Patterns (Adding a Tool)

Follow the pattern in `src/tools/customFields.ts`:

```typescript
export function registerEntityTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_entities",
    "Description with IMPORTANT notes about caching and efficiency",
    {
      // Zod schema for parameters
    },
    withErrorHandling(async (args, extra) => {
      // Implementation
    })
  );
}
```

### Parameter Validation
- Use Zod schemas for all parameters.
- **Prefer Zod schemas similar to the API** - keep tool inputs close to the API rather than adding reassignment logic in code.
- Include optional parameters with proper defaults; support filtering and pagination.
- Validate enum values against the API specification.

### Caching and Efficiency
- Fetch related entities upfront for name resolution and cache mappings for the session.
- Search locally before making additional API calls.
- Use large page sizes to reduce request counts.
- Note important efficiency considerations in tool descriptions and docs.

### Tool Categories
- **List**: `list_*` - paginated lists with filtering
- **Get**: `get_*` - single entity by ID
- **Create**: `create_*` - create new entities
- **Update**: `update_*` - update existing entities
- **Delete**: `delete_*` - delete entities
- **Bulk**: `bulk_edit_*` - bulk operations

## HTTP Transport Mode (`src/index.ts`)

- The server runs in HTTP mode with the `--http` CLI flag; otherwise it runs in stdio mode.
- In HTTP mode, `src/index.ts` starts an Express server and exposes the MCP API at `/mcp`.
- Each POST to `/mcp` creates a new `McpServer` and `StreamableHTTPServerTransport` for stateless, isolated handling.
- The port is set with `--port` (default: 3000). Express must be installed for HTTP mode.

## Related Documentation
- [Paperless-NGX API Documentation](https://docs.paperless-ngx.com/api/)
- **`Paperless_ngx_REST_API.yaml`** - OpenAPI specification file in the root project folder
  - This is the most detailed documentation of available Paperless-NGX APIs (10,000+ lines, 264KB)
  - When reading this file, use chunking or parsing tools to query specific sections rather than reading the entire file
  - Contains complete endpoint definitions, request/response schemas, and authentication details
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [Repository README](README.md)
