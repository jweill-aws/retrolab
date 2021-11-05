// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  createToolbarFactory,
  SessionContext,
  Toolbar,
  ToolbarRegistry,
  ToolbarWidgetRegistry
} from '@jupyterlab/apputils';
import { ISettingRegistry, SettingRegistry } from '@jupyterlab/settingregistry';
import { IDataConnector } from '@jupyterlab/statedb';
import {
  createSessionContext,
  framePromise,
  JupyterServer
} from '@jupyterlab/testutils';
import { ITranslator } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';

const server = new JupyterServer();

beforeAll(async () => {
  await server.start();
});

afterAll(async () => {
  await server.shutdown();
});

describe('@jupyterlab/apputils', () => {
  describe('Toolbar', () => {
    describe('Kernel buttons', () => {
      let sessionContext: SessionContext;
      beforeEach(async () => {
        sessionContext = await createSessionContext();
      });

      afterEach(async () => {
        await sessionContext.shutdown();
        sessionContext.dispose();
      });

      describe('.createInterruptButton()', () => {
        it("should add an inline svg node with the 'stop' icon", async () => {
          const button = Toolbar.createInterruptButton(sessionContext);
          Widget.attach(button, document.body);
          await framePromise();
          expect(
            button.node.querySelector("[data-icon$='stop']")
          ).toBeDefined();
        });
      });

      describe('.createRestartButton()', () => {
        it("should add an inline svg node with the 'refresh' icon", async () => {
          const button = Toolbar.createRestartButton(sessionContext);
          Widget.attach(button, document.body);
          await framePromise();
          expect(
            button.node.querySelector("[data-icon$='refresh']")
          ).toBeDefined();
        });
      });

      describe('.createKernelNameItem()', () => {
        it("should display the `'display_name'` of the kernel", async () => {
          const item = Toolbar.createKernelNameItem(sessionContext);
          await sessionContext.initialize();
          Widget.attach(item, document.body);
          await framePromise();
          const node = item.node.querySelector(
            '.jp-ToolbarButtonComponent-label'
          )!;
          expect(node.textContent).toBe(sessionContext.kernelDisplayName);
        });
      });

      describe('.createKernelStatusItem()', () => {
        beforeEach(async () => {
          await sessionContext.initialize();
          await sessionContext.session?.kernel?.info;
        });

        it('should display a busy status if the kernel status is busy', async () => {
          const item = Toolbar.createKernelStatusItem(sessionContext);
          let called = false;
          sessionContext.statusChanged.connect((_, status) => {
            if (status === 'busy') {
              // eslint-disable-next-line jest/no-conditional-expect
              expect(
                item.node.querySelector("[data-icon$='circle']")
              ).toBeDefined();
              called = true;
            }
          });
          const future = sessionContext.session!.kernel!.requestExecute({
            code: 'a = 109\na'
          })!;
          await future.done;
          expect(called).toBe(true);
        });

        it('should show the current status in the node title', async () => {
          const item = Toolbar.createKernelStatusItem(sessionContext);
          const status = sessionContext.session?.kernel?.status;
          expect(item.node.title.toLowerCase()).toContain(status);
          let called = false;
          const future = sessionContext.session!.kernel!.requestExecute({
            code: 'a = 1'
          })!;
          future.onIOPub = msg => {
            if (sessionContext.session?.kernel?.status === 'busy') {
              // eslint-disable-next-line jest/no-conditional-expect
              expect(item.node.title.toLowerCase()).toContain('busy');
              called = true;
            }
          };
          await future.done;
          expect(called).toBe(true);
        });

        it('should handle a starting session', async () => {
          await sessionContext.session?.kernel?.info;
          await sessionContext.shutdown();
          sessionContext = await createSessionContext();
          await sessionContext.initialize();
          const item = Toolbar.createKernelStatusItem(sessionContext);
          expect(item.node.title).toBe('Kernel Connecting');
          expect(
            item.node.querySelector("[data-icon$='circle-empty']")
          ).toBeDefined();
          await sessionContext.initialize();
          await sessionContext.session?.kernel?.info;
        });
      });
    });
  });

  describe('ToolbarWidgetRegistry', () => {
    describe('#constructor', () => {
      it('should set a default factory', () => {
        const dummy = jest.fn();
        const registry = new ToolbarWidgetRegistry({
          defaultFactory: dummy
        });

        expect(registry.defaultFactory).toBe(dummy);
      });
    });

    describe('#defaultFactory', () => {
      it('should set a default factory', () => {
        const dummy = jest.fn();
        const dummy2 = jest.fn();
        const registry = new ToolbarWidgetRegistry({
          defaultFactory: dummy
        });

        registry.defaultFactory = dummy2;

        expect(registry.defaultFactory).toBe(dummy2);
      });
    });

    describe('#createWidget', () => {
      it('should call the default factory as fallback', () => {
        const documentWidget = new Widget();
        const dummyWidget = new Widget();
        const dummy = jest.fn().mockReturnValue(dummyWidget);
        const registry = new ToolbarWidgetRegistry({
          defaultFactory: dummy
        });

        const item: ToolbarRegistry.IWidget = {
          name: 'test'
        };

        const widget = registry.createWidget('factory', documentWidget, item);

        expect(widget).toBe(dummyWidget);
        expect(dummy).toBeCalledWith('factory', documentWidget, item);
      });

      it('should call the registered factory', () => {
        const documentWidget = new Widget();
        const dummyWidget = new Widget();
        const defaultFactory = jest.fn().mockReturnValue(dummyWidget);
        const dummy = jest.fn().mockReturnValue(dummyWidget);
        const registry = new ToolbarWidgetRegistry({
          defaultFactory
        });

        const item: ToolbarRegistry.IWidget = {
          name: 'test'
        };

        registry.registerFactory('factory', item.name, dummy);

        const widget = registry.createWidget('factory', documentWidget, item);

        expect(widget).toBe(dummyWidget);
        expect(dummy).toBeCalledWith(documentWidget);
        expect(defaultFactory).toBeCalledTimes(0);
      });
    });

    describe('#registerFactory', () => {
      it('should return the previous registered factory', () => {
        const defaultFactory = jest.fn();
        const dummy = jest.fn();
        const dummy2 = jest.fn();
        const registry = new ToolbarWidgetRegistry({
          defaultFactory
        });

        const item: ToolbarRegistry.IWidget = {
          name: 'test'
        };

        expect(
          registry.registerFactory('factory', item.name, dummy)
        ).toBeUndefined();
        expect(registry.registerFactory('factory', item.name, dummy2)).toBe(
          dummy
        );
      });
    });
  });

  describe('createToolbarFactory', () => {
    it('should return the toolbar items', async () => {
      const factoryName = 'dummyFactory';
      const pluginId = 'test-plugin:settings';
      const toolbarRegistry = new ToolbarWidgetRegistry({
        defaultFactory: jest.fn()
      });

      const bar: ISettingRegistry.IPlugin = {
        data: {
          composite: {},
          user: {}
        },
        id: pluginId,
        raw: '{}',
        schema: {
          'jupyter.lab.toolbars': {
            dummyFactory: [
              {
                name: 'insert',
                command: 'notebook:insert-cell-below',
                rank: 20
              },
              { name: 'spacer', type: 'spacer', rank: 100 },
              { name: 'cut', command: 'notebook:cut-cell', rank: 21 }
            ]
          },
          'jupyter.lab.transform': true,
          properties: {
            toolbar: {
              type: 'array'
            }
          },
          type: 'object'
        },
        version: 'test'
      };

      const connector: IDataConnector<
        ISettingRegistry.IPlugin,
        string,
        string,
        string
      > = {
        fetch: jest.fn().mockImplementation((id: string) => {
          switch (id) {
            case bar.id:
              return bar;
            default:
              return {};
          }
        }),
        list: jest.fn(),
        save: jest.fn(),
        remove: jest.fn()
      };

      const settingRegistry = new SettingRegistry({
        connector
      });

      const translator: ITranslator = {
        load: jest.fn()
      };

      const factory = createToolbarFactory(
        toolbarRegistry,
        settingRegistry,
        factoryName,
        pluginId,
        translator
      );

      await settingRegistry.load(bar.id);
      // Trick push this test after all other promise in the hope they get resolve
      // before going further - in particular we are looking at the update of the items
      // factory in `createToolbarFactory`
      await Promise.resolve();

      const items = factory(null as any);
      expect(items).toHaveLength(3);
    });

    it('should update the toolbar items with late settings load', async () => {
      const factoryName = 'dummyFactory';
      const pluginId = 'test-plugin:settings';
      const toolbarRegistry = new ToolbarWidgetRegistry({
        defaultFactory: jest.fn()
      });

      const foo: ISettingRegistry.IPlugin = {
        data: {
          composite: {},
          user: {}
        },
        id: 'foo',
        raw: '{}',
        schema: {
          'jupyter.lab.toolbars': {
            dummyFactory: [
              { name: 'cut', command: 'notebook:cut-cell', rank: 21 }
            ]
          },
          type: 'object'
        },
        version: 'test'
      };
      const bar: ISettingRegistry.IPlugin = {
        data: {
          composite: {},
          user: {}
        },
        id: pluginId,
        raw: '{}',
        schema: {
          'jupyter.lab.toolbars': {
            dummyFactory: [
              {
                name: 'insert',
                command: 'notebook:insert-cell-below',
                rank: 20
              }
            ]
          },
          'jupyter.lab.transform': true,
          properties: {
            toolbar: {
              type: 'array'
            }
          },
          type: 'object'
        },
        version: 'test'
      };

      const connector: IDataConnector<
        ISettingRegistry.IPlugin,
        string,
        string,
        string
      > = {
        fetch: jest.fn().mockImplementation((id: string) => {
          switch (id) {
            case bar.id:
              return bar;
            case foo.id:
              return foo;
            default:
              return {};
          }
        }),
        list: jest.fn(),
        save: jest.fn(),
        remove: jest.fn()
      };

      const settingRegistry = new SettingRegistry({
        connector
      });

      const translator: ITranslator = {
        load: jest.fn()
      };

      const factory = createToolbarFactory(
        toolbarRegistry,
        settingRegistry,
        factoryName,
        pluginId,
        translator
      );

      await settingRegistry.load(bar.id);
      // Trick push this test after all other promise in the hope they get resolve
      // before going further - in particular we are looking at the update of the items
      // factory in `createToolbarFactory`
      await Promise.resolve();
      await settingRegistry.load(foo.id);

      const items = factory(null as any);
      expect(items).toHaveLength(2);
    });
  });
});
