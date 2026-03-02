# Binary Dependency Auto-Update System

This plugin includes an automatic binary update system that fetches the latest compiled binaries from the git repository without using GitHub API.

## How It Works

The plugin automatically checks for binary updates weekly using git sparse-checkout to efficiently download only the binary files.

## Configuration

1. Copy the example configuration:
   ```bash
   cp .binary_source.example .binary_source
   ```

2. Edit `.binary_source` to set your repository URL:
   ```bash
   REPO_URL="https://github.com/your-username/modern_format_boost.git"
   BRANCH="main"
   ```

## Manual Update

To manually update binaries:

```bash
cd plugin
./update_binaries.sh
```

## How It Works

1. **Sparse Checkout**: Uses git sparse-checkout to download only binary files from `target/release/`
2. **Shallow Clone**: Only fetches the latest commit (depth=1) for efficiency
3. **No API Calls**: Direct git clone, no GitHub API usage
4. **Auto-Update**: Plugin checks weekly and updates in background

## Binaries Managed

- `img-hevc` - HEIC/HEIF image processor
- `vid-hevc` - HEVC video processor
- `img-av1` - AV1 image processor
- `vid-av1` - AV1 video processor

## Requirements

- Git installed on system
- Network access to repository
- Write permissions to plugin directory

## Troubleshooting

If update fails:
1. Check repository URL in `.binary_source`
2. Verify git is installed: `git --version`
3. Check network connection
4. Manually run: `./update_binaries.sh` to see detailed errors

## Security

- Only downloads from configured git repository
- Verifies file existence before installation
- Sets proper executable permissions
- No external API dependencies
