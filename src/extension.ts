import {
  ExtensionContext,
  TerminalLink,
  TerminalLinkContext,
  window,
  Uri,
  env,
  workspace,
  ConfigurationChangeEvent,
} from "vscode";

interface Config {
  regex: RegExp;
  uriPattern: string;
}

let LINKS: Config[] = [];

class FoundLink extends TerminalLink {
  #uri: Uri;

  constructor(startIndex: number, length: number, uri: Uri) {
    super(startIndex, length, uri.toString());

    this.#uri = uri;
  }

  get uri(): Uri {
    return this.#uri;
  }
}

function parseMatchers(matchers: unknown) {
  function isObject(item: unknown): item is Record<string, unknown> {
    return typeof item === "object";
  }

  function asString(obj: Record<string, unknown>, key: string): string {
    let expectedFormat = `Every item of terminalLinks.matchers must contain a string ${key} property.`;
    if (!(key in obj)) {
      throw new Error(expectedFormat);
    }

    let value = obj[key];
    if (typeof value !== "string") {
      throw new Error(expectedFormat);
    }

    return value;
  }

  let expectedFormat = `terminalLinks.matchers is expected to be an array of { "regex": "...", "replacement": "..." }`;
  let foundLinks: Config[] = [];

  if (!Array.isArray(matchers)) {
    throw new Error(expectedFormat);
  }

  for (let item of matchers) {
    if (!isObject(item)) {
      throw new Error(expectedFormat);
    }

    foundLinks.push({
      regex: new RegExp(asString(item, "regex"), "g"),
      uriPattern: asString(item, "uriPattern"),
    });
  }

  LINKS = foundLinks;
}

function parseConfig() {
  let config = workspace.getConfiguration(
    "terminalLinks",
    workspace.workspaceFile
  );

  let matchers = config.get("matchers") ?? [];
  try {
    parseMatchers(matchers);
  } catch (e) {
    console.error(e);
  }
}

export function activate(context: ExtensionContext) {
  console.log("Activated");

  parseConfig();
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e: ConfigurationChangeEvent) => {
      if (e.affectsConfiguration("terminalLinks", workspace.workspaceFile)) {
        parseConfig();
      }
    }, null)
  );

  let disposable = window.registerTerminalLinkProvider({
    async handleTerminalLink(link: FoundLink): Promise<void> {
      await env.openExternal(link.uri);
    },

    provideTerminalLinks(context: TerminalLinkContext): FoundLink[] {
      let links: FoundLink[] = [];

      let { line } = context;
      let index = 0;

      while (line.length) {
        let first: [RegExpExecArray, Config] | null = null;

        for (let { regex, uriPattern } of LINKS) {
          let result = regex.exec(line);

          if (result) {
            if (!first || first[0].index > result.index) {
              first = [result, { regex, uriPattern }];
            }
          }
        }

        if (!first) {
          break;
        }

        let [match, { regex, uriPattern }] = first;
        let uri = Uri.parse(match[0].replace(regex, uriPattern), true);
        links.push(new FoundLink(match.index + index, match[0].length, uri));

        line = line.substring(match.index + match[0].length);
        index += match.index + match[0].length;
      }

      return links;
    },
  });

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {
  // Nothing to do.
}
