# Security Policy

## Reporting Security Issues

If you discover a security vulnerability, please email the maintainers directly rather than opening a public issue. See [CONTRIBUTING.md](CONTRIBUTING.md) for contact information.

## Security Considerations

### File Upload Security (`file_path` parameter)

The `file_path` parameter in `post_document` allows uploading files directly from the server's filesystem, which is more efficient than base64 encoding but requires careful security configuration.

**⚠️ Important Security Measures:**

1. **Restrict Upload Directories**: Always set the `PAPERLESS_MCP_UPLOAD_PATHS` environment variable to limit which directories can be accessed:

   ```bash
   export PAPERLESS_MCP_UPLOAD_PATHS="/var/uploads:/tmp/scans"
   ```

2. **Without `PAPERLESS_MCP_UPLOAD_PATHS`**: Any file on the server's filesystem could potentially be uploaded to Paperless-NGX. Only use this in trusted environments where all users are authorized to access all files.

3. **File Size Limits**: Both `file` (base64) and `file_path` modes enforce a 100MB maximum file size to prevent memory exhaustion attacks.

4. **Path Validation**: The server validates that:
   - Paths are absolute (no relative paths like `../../../etc/passwd`)
   - Files are regular files (not directories, sockets, or devices)
   - Symbolic links are resolved and validated against allowed paths
   - Files exist and are readable

### HTTP Mode Authentication

When running in HTTP mode (`--http` flag), authentication is **required by default** as of v2.0.0:

- Clients must send `Authorization: Bearer <paperless-token>` header
- Each request uses the client's token, enforcing their Paperless-NGX permissions
- To restore v1.x behavior (single shared token), use `--no-auth` flag (⚠️ trusted networks only)

**Never expose HTTP mode to the public internet without authentication.**

### Best Practices

1. **Principle of Least Privilege**: Configure `PAPERLESS_MCP_UPLOAD_PATHS` to the minimum required directories
2. **Network Isolation**: Run the MCP server on a trusted network, not exposed to the internet
3. **Regular Updates**: Keep the server and dependencies updated
4. **Monitor Logs**: Watch for unusual file access patterns
5. **File Permissions**: Ensure upload directories have appropriate OS-level permissions

## Vulnerability History

| CVE | Severity | Description | Fixed In |
|-----|----------|-------------|----------|
| N/A | N/A | Initial release with path validation | v1.0.0 |

## Security Features

- ✅ Path traversal prevention
- ✅ Symbolic link resolution and validation
- ✅ File size limits (100MB)
- ✅ File type validation (regular files only)
- ✅ Configurable directory restrictions
- ✅ Authentication required in HTTP mode (v2.0.0+)
- ✅ Per-request token support

## Development Security

When developing:

1. Never commit API tokens or credentials
2. Use `.env` files for local configuration (gitignored)
3. Run tests in isolated environments
4. Review security implications of new features
5. Follow secure coding practices (input validation, error handling)
