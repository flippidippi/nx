import * as chalk from 'chalk';
import { prompt } from 'enquirer';
import { readJsonFile } from '../utils/fileutils';

import { readNxJson } from '../config/configuration';
import { ProjectsConfigurations } from '../config/workspace-json-project-json';
import { Workspaces } from '../config/workspaces';
import { FileChange, flushChanges, FsTree } from '../generators/tree';
import {
  createProjectGraphAsync,
  readProjectsConfigurationFromProjectGraph,
} from '../project-graph/project-graph';
import { logger } from '../utils/logger';
import {
  combineOptionsForGenerator,
  handleErrors,
  Options,
  Schema,
} from '../utils/params';
import { getLocalWorkspacePlugins } from '../utils/plugins/local-plugins';
import { printHelp } from '../utils/print-help';
import { workspaceRoot } from '../utils/workspace-root';
import { NxJsonConfiguration } from '../config/nx-json';

export interface GenerateOptions {
  collectionName: string;
  generatorName: string;
  generatorOptions: Options;
  help: boolean;
  dryRun: boolean;
  interactive: boolean;
  defaults: boolean;
}

export function printChanges(fileChanges: FileChange[]) {
  fileChanges.forEach((f) => {
    if (f.type === 'CREATE') {
      console.log(`${chalk.green('CREATE')} ${f.path}`);
    } else if (f.type === 'UPDATE') {
      console.log(`${chalk.white('UPDATE')} ${f.path}`);
    } else if (f.type === 'DELETE') {
      console.log(`${chalk.yellow('DELETE')} ${f.path}`);
    }
  });
}

async function promptForCollection(
  generatorName: string,
  ws: Workspaces,
  interactive: boolean,
  projectsConfiguration: ProjectsConfigurations
): Promise<string> {
  const packageJson = readJsonFile(`${workspaceRoot}/package.json`);
  const localPlugins = getLocalWorkspacePlugins(projectsConfiguration);

  const installedCollections = Array.from(
    new Set([
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
    ])
  );

  const choicesMap = new Set<string>();
  for (const collectionName of installedCollections) {
    try {
      const { resolvedCollectionName, normalizedGeneratorName } =
        ws.readGenerator(collectionName, generatorName);

      choicesMap.add(`${resolvedCollectionName}:${normalizedGeneratorName}`);
    } catch {}
  }

  const choicesFromLocalPlugins: {
    name: string;
    message: string;
    value: string;
  }[] = [];
  for (const [name] of localPlugins) {
    try {
      const { resolvedCollectionName, normalizedGeneratorName } =
        ws.readGenerator(name, generatorName);
      const value = `${resolvedCollectionName}:${normalizedGeneratorName}`;
      if (!choicesMap.has(value)) {
        choicesFromLocalPlugins.push({
          name: value,
          message: chalk.bold(value),
          value,
        });
      }
    } catch {}
  }
  if (choicesFromLocalPlugins.length) {
    choicesFromLocalPlugins[choicesFromLocalPlugins.length - 1].message += '\n';
  }
  const choices = (
    choicesFromLocalPlugins as (
      | string
      | {
          name: string;
          message: string;
          value: string;
        }
    )[]
  ).concat(...choicesMap);
  if (choices.length === 1) {
    return typeof choices[0] === 'string' ? choices[0] : choices[0].value;
  } else if (!interactive && choices.length > 1) {
    throwInvalidInvocation(Array.from(choicesMap));
  } else if (interactive && choices.length > 1) {
    const noneOfTheAbove = `\nNone of the above`;
    choices.push(noneOfTheAbove);
    let { generator, customCollection } = await prompt<{
      generator: string;
      customCollection?: string;
    }>([
      {
        name: 'generator',
        message: `Which generator would you like to use?`,
        type: 'autocomplete',
        // enquirer's typings are incorrect here... It supports (string | Choice)[], but is typed as (string[] | Choice[])
        choices: choices as string[],
      },
      {
        name: 'customCollection',
        type: 'input',
        message: `Which collection would you like to use?`,
        skip: function () {
          // Skip this question if the user did not answer None of the above
          return this.state.answers.generator !== noneOfTheAbove;
        },
        validate: function (value) {
          if (this.skipped) {
            return true;
          }
          try {
            ws.readGenerator(value, generatorName);
            return true;
          } catch {
            logger.error(`\nCould not find ${value}:${generatorName}`);
            return false;
          }
        },
      },
    ]);
    return customCollection
      ? `${customCollection}:${generatorName}`
      : generator;
  } else {
    throw new Error(`Could not find any generators named "${generatorName}"`);
  }
}

function parseGeneratorString(value: string): {
  collection?: string;
  generator: string;
} {
  const separatorIndex = value.lastIndexOf(':');

  if (separatorIndex > 0) {
    return {
      collection: value.slice(0, separatorIndex),
      generator: value.slice(separatorIndex + 1),
    };
  } else {
    return {
      generator: value,
    };
  }
}

async function convertToGenerateOptions(
  generatorOptions: { [p: string]: any },
  ws: Workspaces,
  defaultCollectionName: string,
  mode: 'generate' | 'new',
  projectsConfiguration?: ProjectsConfigurations
): Promise<GenerateOptions> {
  let collectionName: string | null = null;
  let generatorName: string | null = null;
  const interactive = generatorOptions.interactive as boolean;

  if (mode === 'generate') {
    const generatorDescriptor = generatorOptions['generator'] as string;
    const { collection, generator } = parseGeneratorString(generatorDescriptor);

    if (collection) {
      collectionName = collection;
      generatorName = generator;
    } else if (!defaultCollectionName) {
      const generatorString = await promptForCollection(
        generatorDescriptor,
        ws,
        interactive,
        projectsConfiguration
      );
      const parsedGeneratorString = parseGeneratorString(generatorString);
      collectionName = parsedGeneratorString.collection;
      generatorName = parsedGeneratorString.generator;
    } else {
      collectionName = defaultCollectionName;
      generatorName = generatorDescriptor;
    }
  } else {
    collectionName = generatorOptions.collection as string;
    generatorName = 'new';
  }

  if (!collectionName) {
    throwInvalidInvocation(['@nrwl/workspace:library']);
  }

  const res = {
    collectionName,
    generatorName,
    generatorOptions,
    help: generatorOptions.help as boolean,
    dryRun: generatorOptions.dryRun as boolean,
    interactive,
    defaults: generatorOptions.defaults as boolean,
  };

  delete generatorOptions.d;
  delete generatorOptions.dryRun;
  delete generatorOptions['dry-run'];
  delete generatorOptions.interactive;
  delete generatorOptions.help;
  delete generatorOptions.collection;
  delete generatorOptions.verbose;
  delete generatorOptions.generator;
  delete generatorOptions['--'];
  delete generatorOptions['$0'];

  return res;
}

function throwInvalidInvocation(availableGenerators: string[]) {
  throw new Error(
    `Specify the generator name (e.g., nx generate ${availableGenerators.join(
      ', '
    )})`
  );
}

function readDefaultCollection(nxConfig: NxJsonConfiguration) {
  return nxConfig.cli ? nxConfig.cli.defaultCollection : null;
}

export function printGenHelp(
  opts: GenerateOptions,
  schema: Schema,
  normalizedGeneratorName: string,
  aliases: string[]
) {
  printHelp(
    `generate ${opts.collectionName}:${normalizedGeneratorName}`,
    {
      ...schema,
      properties: schema.properties,
    },
    {
      mode: 'generate',
      plugin: opts.collectionName,
      entity: normalizedGeneratorName,
      aliases,
    }
  );
}

export async function generate(cwd: string, args: { [k: string]: any }) {
  if (args['verbose']) {
    process.env.NX_VERBOSE_LOGGING = 'true';
  }
  const verbose = process.env.NX_VERBOSE_LOGGING === 'true';

  const ws = new Workspaces(workspaceRoot);
  const nxJsonConfiguration = readNxJson();
  const projectGraph = await createProjectGraphAsync({ exitOnError: true });
  const projectsConfigurations =
    readProjectsConfigurationFromProjectGraph(projectGraph);

  return handleErrors(verbose, async () => {
    const opts = await convertToGenerateOptions(
      args,
      ws,
      readDefaultCollection(nxJsonConfiguration),
      'generate',
      projectsConfigurations
    );
    if (opts.dryRun) {
      process.env.NX_DRY_RUN = 'true';
    }
    const { normalizedGeneratorName, schema, implementationFactory, aliases } =
      ws.readGenerator(opts.collectionName, opts.generatorName);

    logger.info(
      `NX Generating ${opts.collectionName}:${normalizedGeneratorName}`
    );

    if (opts.help) {
      printGenHelp(opts, schema, normalizedGeneratorName, aliases);
      return 0;
    }

    const combinedOpts = await combineOptionsForGenerator(
      opts.generatorOptions,
      opts.collectionName,
      normalizedGeneratorName,
      projectsConfigurations,
      nxJsonConfiguration,
      schema,
      opts.interactive,
      ws.calculateDefaultProjectName(
        cwd,
        projectsConfigurations,
        nxJsonConfiguration
      ),
      ws.relativeCwd(cwd),
      verbose
    );

    if (ws.isNxGenerator(opts.collectionName, normalizedGeneratorName)) {
      const host = new FsTree(workspaceRoot, verbose);
      const implementation = implementationFactory();
      const task = await implementation(host, combinedOpts);
      const changes = host.listChanges();

      printChanges(changes);
      if (!opts.dryRun) {
        flushChanges(workspaceRoot, changes);
        if (task) {
          await task();
        }
      } else {
        logger.warn(`\nNOTE: The "dryRun" flag means no changes were made.`);
      }
    } else {
      require('../adapter/compat');
      return (await import('../adapter/ngcli-adapter')).generate(
        workspaceRoot,
        {
          ...opts,
          generatorOptions: combinedOpts,
        },
        verbose
      );
    }
  });
}
