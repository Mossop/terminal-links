# Test Workspace Guide

## Launch Configurations

Defined in [launch.json](../.vscode/launch.json):
- Run Extension (Multifolder): Opens a multi-root workspace with two folders (`main-folder` and `another-folder`). Use this to test variable substitution for `${workspaceFolder:FolderName}` and `${workspaceFolderBasename:FolderName}`.
- Run Extension (Single Folder): Contains a single folder workspace. Use this to test basic variable substitution like `${workspaceFolder}`, `${cwd}`, `${userHome}`, etc.

## How to See Variable Substitutions

**Check the Output Log**
   - Go to the Output panel (`View` > `Output`).
   - Select `Terminal Links` from the dropdown.
   - Enable Trace logs through the filter and channel settings (cog icon)
   - Look for log lines like:
     - `[expandVariables] input: ...` — shows the input string with variables.
     - `[expandVariables] result: ...` — shows the result after variable substitution.
   - You will also see trace logs for each regex match attempt and the final parsed config.

This allows you to verify that variables in your matcher configuration are being expanded as expected.

---

For more details on supported variables, see the main project [README](../README.md).
