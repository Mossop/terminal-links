# Terminal Links

A Visual Studio Code extension to allow configuring regular expression patterns to identify useful links in
terminals.

Once installed you have to add the link replacements you want in the settings JSON file manually under the `terminalLinks.matchers`
setting key. Visual Studio Code doesn't support a UI for this kind of setting unfortunately.

For example, I built this extension because I was annoyed at constantly having to copy bug numbers
out of the terminal into my browser, so I have this configuration which automatically links bug references
to Mozilla's bug tracker and patch references to Mozilla's Phabricator:

```json
"terminalLinks.matchers": [
    {
      "regex": "\\b[Bb]ug\\s*(\\d+)\\b",
      "uri": "https://bugzilla.mozilla.org/show_bug.cgi?id=$1"
    },
    {
      "regex": "\\b(D\\d+)\\b",
      "uri": "https://phabricator.services.mozilla.com/$1"
    }
],
```

The format is fairly straightforward. Each item of the array is an object with the properties
`regex` (a [regular expression pattern](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions)),
and `uri` (the link to generate).
[String.replace](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace)
is used to generate the replacement so the documentation there should help. In particular you can use
`$n` to reference captured groups from the regular expression.

Due to how Visual Studio Code's APIs work the text to link cannot span multiple lines.

Please [file an issue](https://github.com/Mossop/terminal-links/issues) if you run into a problem or have a suggestion for improvements.

## Supported Variables for URI Expansion

Some [VS Code Predefined Variables](https://code.visualstudio.com/docs/reference/variables-reference#_predefined-variables) are supported. You can use these variables in the `uri` field of your matcher configuration. The following variables are supported:

- `${userHome}`: The path to your home directory.
- `${workspaceFolder}`: The absolute path to the first workspace folder.
- `${workspaceFolderBasename}`: The name of the first workspace folder.
- `${pathSeparator}` or `${/}`: The platform-specific path separator (`/` on macOS/Linux, `\\` on Windows).
- `${env:VARNAME}`: The value of the environment variable `VARNAME`.
- `${workspaceFolder:FolderName}`: The absolute path to the workspace folder named `FolderName`.
- `${workspaceFolderBasename:FolderName}`: The name of the workspace folder named `FolderName`.
