import { fs as fsMock, vol } from 'memfs';
import * as fs from 'fs';

import { ExecutorContext } from '@nrwl/devkit';

jest.mock('@storybook/core-server', () => ({
  buildDev: jest.fn().mockImplementation(() => Promise.resolve()),
  build: jest.fn().mockImplementation(() => Promise.resolve()),
}));
import { buildDev } from '@storybook/core-server';

import storybookExecutor from './storybook.impl';
import { join } from 'path';
import { readFileSync } from 'fs-extra';
import { CLIOptions } from '@storybook/types';
import { CommonNxStorybookConfig } from '../../utils/models';

// TODO(katerina): Update when Storybook 7

describe('@nrwl/storybook:storybook', () => {
  let context: ExecutorContext;
  let options: CLIOptions & CommonNxStorybookConfig;
  beforeEach(() => {
    // preserve original package.json file to memory
    const rootPath = join(__dirname, `../../../../../`);
    const packageJsonPath = join(
      rootPath,
      `node_modules/@storybook/react/package.json`
    );
    const storybookPath = join(rootPath, '.storybook');

    options = {
      uiFramework: '@storybook/react',
      port: 4400,
      configDir: storybookPath,
    };
    vol.fromJSON({
      [packageJsonPath]: readFileSync(packageJsonPath).toString(),
    });
    vol.mkdirSync(storybookPath, {
      recursive: true,
    });
    context = {
      root: rootPath,
      cwd: rootPath,
      projectName: 'proj',
      targetName: 'storybook',
      projectsConfigurations: {
        version: 2,
        projects: {
          proj: {
            root: '',
            sourceRoot: 'src',
            targets: {
              build: {
                executor: '@nrwl/web:webpack',
                options: {
                  compiler: 'babel',
                  outputPath: 'dist/apps/webre',
                  index: 'apps/webre/src/index.html',
                  baseHref: '/',
                  main: 'apps/webre/src/main.tsx',
                  polyfills: 'apps/webre/src/polyfills.ts',
                  tsConfig: 'apps/webre/tsconfig.app.json',
                  assets: [
                    'apps/webre/src/favicon.ico',
                    'apps/webre/src/assets',
                  ],
                  styles: ['apps/webre/src/styles.css'],
                  scripts: [],
                  webpackConfig: '@nrwl/react/plugins/webpack',
                },
              },
              storybook: {
                executor: '@nrwl/storybook:storybook',
                options,
              },
            },
          },
        },
      },
      nxJsonConfiguration: {},
      isVerbose: false,
    };
    jest.mock('fs', () => fsMock);
    jest.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);
  });

  it('should provide options to storybook', async () => {
    const iterator = storybookExecutor(options, context);
    const { value } = await iterator.next();
    expect(value).toEqual({ success: true });
    expect(buildDev).toHaveBeenCalled();
  });
});
