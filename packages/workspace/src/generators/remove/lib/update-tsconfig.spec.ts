import {
  ProjectGraph,
  readJson,
  readProjectConfiguration,
  Tree,
} from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { Schema } from '../schema';
import { updateTsconfig } from './update-tsconfig';
import { libraryGenerator } from '../../library/library';

let graph: ProjectGraph;
jest.mock('@nrwl/devkit', () => {
  return {
    ...jest.requireActual('@nrwl/devkit'),
    createProjectGraphAsync: jest.fn().mockImplementation(() => graph),
  };
});
describe('updateTsconfig', () => {
  let tree: Tree;
  let schema: Schema;
  let schemaWithImportPath: Schema;

  beforeEach(async () => {
    tree = createTreeWithEmptyWorkspace();

    schema = {
      projectName: 'my-lib',
      skipFormat: false,
      forceRemove: false,
    };

    schemaWithImportPath = {
      projectName: 'my-lib',
      skipFormat: false,
      forceRemove: false,
      importPath: '@proj/whatever-name',
    };
  });

  it('should delete project ref from the root tsconfig.base.json', async () => {
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schema);

    const tsConfig = readJson(tree, '/tsconfig.base.json');
    expect(tsConfig.compilerOptions.paths).toEqual({});
  });

  it('should delete project ref not under libs from the root tsconfig.base.json', async () => {
    tree.delete('libs');
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schema);

    const tsConfig = readJson(tree, '/tsconfig.base.json');
    expect(tsConfig.compilerOptions.paths).toEqual({});
  });

  it('should delete project ref with importPath from the root tsconfig.base.json', async () => {
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
      importPath: '@proj/whatever-name',
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schemaWithImportPath);

    const tsConfig = readJson(tree, '/tsconfig.base.json');
    expect(tsConfig.compilerOptions.paths).toEqual({});
  });

  it('should delete project ref from the root tsconfig.json when no tsconfig.base.json', async () => {
    tree.rename('tsconfig.base.json', 'tsconfig.json');
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schema);

    const tsConfig = readJson(tree, '/tsconfig.json');
    expect(tsConfig.compilerOptions.paths).toEqual({});
  });

  it('should delete project ref with importPath from the root tsconfig.json when no tsconfig.base.json', async () => {
    tree.rename('tsconfig.base.json', 'tsconfig.json');
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
      importPath: '@proj/whatever-name',
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schemaWithImportPath);

    const tsConfig = readJson(tree, '/tsconfig.json');
    expect(tsConfig.compilerOptions.paths).toEqual({});
  });

  it('should not delete importPaths of nested projects from tsconfig.base.json', async () => {
    await libraryGenerator(tree, {
      name: 'my-lib',
      standaloneConfig: false,
      importPath: '@proj/whatever-name',
    });
    await libraryGenerator(tree, {
      name: 'nested-lib',
      directory: 'libs/my-lib',
      standaloneConfig: false,
      importPath: '@proj/nested/whatever-name',
    });

    graph = {
      nodes: {
        'my-lib': {
          name: 'my-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib').root,
          } as any,
        },
        'my-lib-nested-lib': {
          name: 'my-lib-nested-lib',
          type: 'lib',
          data: {
            root: readProjectConfiguration(tree, 'my-lib-nested-lib').root,
          } as any,
        },
      },
      dependencies: {},
    };

    await updateTsconfig(tree, schemaWithImportPath);

    const tsConfig = readJson(tree, '/tsconfig.base.json');
    expect(tsConfig.compilerOptions.paths).toEqual({
      '@proj/nested/whatever-name': ['libs/my-lib/nested-lib/src/index.ts'],
    });
  });
});
