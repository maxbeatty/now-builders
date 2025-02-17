/* global beforeAll, expect, it, jest */
const path = require('path');
const fs = require('fs-extra');
// eslint-disable-next-line import/no-extraneous-dependencies
const execa = require('execa');
const assert = require('assert');
const { glob, download } = require('../');
const { createZip } = require('../dist/lambda');
const {
  getSupportedNodeVersion,
  defaultSelection,
} = require('../dist/fs/node-version');

const {
  packAndDeploy,
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

const { detectBuilders, detectRoutes } = require('../dist');

jest.setTimeout(4 * 60 * 1000);
const builderUrl = '@canary';
let buildUtilsUrl;

beforeAll(async () => {
  const buildUtilsPath = path.resolve(__dirname, '..');
  buildUtilsUrl = await packAndDeploy(buildUtilsPath);
  console.log('buildUtilsUrl', buildUtilsUrl);
});

// unit tests

it('should re-create symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);

  const files2 = await download(files, outDir);
  assert.equal(Object.keys(files2).length, 2);

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should create zip files with symlinks properly', async () => {
  const files = await glob('**', path.join(__dirname, 'symlinks'));
  assert.equal(Object.keys(files).length, 2);

  const outFile = path.join(__dirname, 'symlinks.zip');
  await fs.remove(outFile);

  const outDir = path.join(__dirname, 'symlinks-out');
  await fs.remove(outDir);
  await fs.mkdirp(outDir);

  await fs.writeFile(outFile, await createZip(files));
  await execa('unzip', [outFile], { cwd: outDir });

  const [linkStat, aStat] = await Promise.all([
    fs.lstat(path.join(outDir, 'link.txt')),
    fs.lstat(path.join(outDir, 'a.txt')),
  ]);
  assert(linkStat.isSymbolicLink());
  assert(aStat.isFile());
});

it('should only match supported node versions', () => {
  expect(getSupportedNodeVersion('10.x')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('8.10.x')).resolves.toHaveProperty('major', 8);
  expect(getSupportedNodeVersion('8.11.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('6.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('999.x')).rejects.toThrow();
  expect(getSupportedNodeVersion('foo')).rejects.toThrow();
  expect(getSupportedNodeVersion('')).resolves.toBe(defaultSelection);
  expect(getSupportedNodeVersion(null)).resolves.toBe(defaultSelection);
  expect(getSupportedNodeVersion(undefined)).resolves.toBe(defaultSelection);
});

it('should match all semver ranges', () => {
  // See https://docs.npmjs.com/files/package.json#engines
  expect(getSupportedNodeVersion('10.0.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('10.x')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('>=10')).resolves.toHaveProperty('major', 10);
  expect(getSupportedNodeVersion('>=10.3.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('8.5.0 - 10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('>=9.0.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('>=9.5.0 <=10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('~10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
  expect(getSupportedNodeVersion('^10.5.0')).resolves.toHaveProperty(
    'major',
    10,
  );
});

// own fixtures

const fixturesPath = path.resolve(__dirname, 'fixtures');

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(
        { builderUrl, buildUtilsUrl },
        path.join(fixturesPath, fixture),
      ),
    ).resolves.toBeDefined();
  });
}

// few foreign tests

const buildersToTestWith = ['now-node', 'now-static-build'];

// eslint-disable-next-line no-restricted-syntax
for (const builder of buildersToTestWith) {
  const fixturesPath2 = path.resolve(
    __dirname,
    `../../${builder}/test/fixtures`,
  );

  // eslint-disable-next-line no-restricted-syntax
  for (const fixture of fs.readdirSync(fixturesPath2)) {
    // don't run all foreign fixtures, just some
    if (['01-cowsay', '03-env-vars'].includes(fixture)) {
      // eslint-disable-next-line no-loop-func
      it(`should build ${builder}/${fixture}`, async () => {
        await expect(
          testDeployment(
            { builderUrl, buildUtilsUrl },
            path.join(fixturesPath2, fixture),
          ),
        ).resolves.toBeDefined();
      });
    }
  }
}

it('Test `detectBuilders`', async () => {
  {
    // package.json + no build
    const pkg = { dependencies: { next: '9.0.0' } };
    const files = ['package.json', 'pages/index.js'];
    const { builders, warnings } = await detectBuilders(files, pkg);
    expect(builders).toBe(null);
    expect(warnings).toBe(null);
  }

  {
    // package.json + no build + next
    const pkg = {
      scripts: { build: 'next build' },
      dependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, warnings } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/next');
    expect(warnings).toBe(null);
  }

  {
    // package.json + no build + next
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'pages/index.js'];
    const { builders, warnings } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/next');
    expect(warnings).toBe(null);
  }

  {
    // package.json + no build
    const pkg = {};
    const files = ['package.json'];
    const { builders, warnings } = await detectBuilders(files, pkg);
    expect(builders).toBe(null);
    expect(warnings).toBe(null);
  }

  {
    // no package.json + public
    const files = ['public/index.html'];
    const { builders, warnings } = await detectBuilders(files);
    expect(builders).toBe(null);
    expect(warnings).toBe(null);
  }

  {
    // no package.json + public
    const files = ['api/users.js', 'public/index.html'];
    const { builders, warnings } = await detectBuilders(files);
    expect(builders[1].use).toBe('@now/static');
    expect(warnings).toBe(null);
  }

  {
    // no package.json + no build + raw static + api
    const files = ['api/users.js', 'index.html'];
    const { builders, warnings } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/users.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('index.html');
    expect(builders.length).toBe(2);
    expect(warnings).toBe(null);
  }

  {
    // package.json + no build + root + api
    const files = ['index.html', 'api/[endpoint].js', 'static/image.png'];
    const { builders, warnings } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/[endpoint].js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('index.html');
    expect(builders[2].use).toBe('@now/static');
    expect(builders[2].src).toBe('static/image.png');
    expect(builders.length).toBe(3);
    expect(warnings).toBe(null);
  }

  {
    // api + ignore files
    const files = [
      'api/_utils/handler.js',
      'api/[endpoint]/.helper.js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/[endpoint]/[id].js');
    expect(builders.length).toBe(1);
  }

  {
    // api + next + public
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'public/index.html'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/next');
    expect(builders[1].src).toBe('package.json');
    expect(builders.length).toBe(2);
  }

  {
    // api + next + raw static
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'api/endpoint.js', 'index.html'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/next');
    expect(builders[1].src).toBe('package.json');
    expect(builders.length).toBe(2);
  }

  {
    // api + raw static
    const files = ['api/endpoint.js', 'index.html', 'favicon.ico'];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('favicon.ico');
    expect(builders[2].use).toBe('@now/static');
    expect(builders[2].src).toBe('index.html');
    expect(builders.length).toBe(3);
  }

  {
    // api + public
    const files = [
      'api/endpoint.js',
      'public/index.html',
      'public/favicon.ico',
      'README.md',
    ];

    const { builders } = await detectBuilders(files);
    expect(builders[0].use).toBe('@now/node@canary');
    expect(builders[0].src).toBe('api/endpoint.js');
    expect(builders[1].use).toBe('@now/static');
    expect(builders[1].src).toBe('public/**/*');
    expect(builders.length).toBe(2);
  }

  {
    // next + public
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['package.json', 'public/index.html', 'README.md'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/next');
    expect(builders[0].src).toBe('package.json');
    expect(builders.length).toBe(1);
  }

  {
    // nuxt
    const pkg = {
      scripts: { build: 'nuxt build' },
      dependencies: { nuxt: '2.8.1' },
    };
    const files = ['package.json', 'pages/index.js'];

    const { builders } = await detectBuilders(files, pkg);
    expect(builders[0].use).toBe('@now/nuxt');
    expect(builders[0].src).toBe('package.json');
    expect(builders.length).toBe(1);
  }
});

it('Test `detectRoutes`', async () => {
  {
    const files = ['api/user.go', 'api/team.js', 'api/package.json'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes.length).toBe(2);
    expect(defaultRoutes[0].dest).toBe('/api/team.js');
    expect(defaultRoutes[1].dest).toBe('/api/user.go');
  }

  {
    const files = ['api/user.go', 'api/user.js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[user].go', 'api/[team]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_file_path');
  }

  {
    const files = ['api/[team]/[team].js'];

    const { builders } = await detectBuilders(files);
    const { error } = await detectRoutes(files, builders);
    expect(error.code).toBe('conflicting_path_segment');
  }

  {
    const files = ['api/[endpoint].js', 'api/[endpoint]/[id].js'];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes.length).toBe(2);
  }

  {
    const files = [
      'public/index.html',
      'api/[endpoint].js',
      'api/[endpoint]/[id].js',
    ];

    const { builders } = await detectBuilders(files);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes[2].src).toBe('/(.*)');
    expect(defaultRoutes[2].dest).toBe('/public/$1');
    expect(defaultRoutes.length).toBe(3);
  }

  {
    const pkg = {
      scripts: { build: 'next build' },
      devDependencies: { next: '9.0.0' },
    };
    const files = ['public/index.html', 'api/[endpoint].js'];

    const { builders } = await detectBuilders(files, pkg);
    const { defaultRoutes } = await detectRoutes(files, builders);
    expect(defaultRoutes.length).toBe(1);
  }
});
