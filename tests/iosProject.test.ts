import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import capacitorConfig from '../capacitor.config.ts';

// 설치된 Capacitor CLI의 XML 파서를 재사용하며 새 의존성을 추가하지 않는다.
const cliRequire = createRequire(
  new URL('../node_modules/@capacitor/cli/package.json', import.meta.url),
);
const plist = cliRequire('plist');
const { parseStringPromise } = cliRequire('xml2js');
const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

type Value = string | Value[] | { [key: string]: Value };
const dict = (value: Value): Record<string, Value> => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, Value>;
};
const string = (value: Value): string => {
  assert.equal(typeof value, 'string');
  return value as string;
};
const list = (value: Value): string[] => {
  assert.ok(Array.isArray(value) && value.every((item) => typeof item === 'string'));
  return value as string[];
};

// 주석과 따옴표로 감싼 값을 포함해 Xcode 프로젝트의 OpenStep 딕셔너리·배열을 해석한다.
// 문서 전체를 파싱해 단순 텍스트 검색으로 놓칠 수 있는 문법 오류와 중복 객체 ID를 찾는다.
function parseProject(source: string): Record<string, Value> {
  const lexer = /\s+|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\.|[^"\\])*"|[{}()=;,]|[^\s{}()=;,"]+/gy;
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    lexer.lastIndex = offset;
    const match = lexer.exec(source);
    assert.ok(match, `Invalid project token at ${offset}`);
    offset = lexer.lastIndex;
    if (!/^\s|^\/\*|^\/\//.test(match[0])) tokens.push(match[0]);
  }
  let index = 0;
  const expect = (token: string) => assert.equal(tokens[index++], token);
  const atom = () => {
    const token = tokens[index++];
    assert.ok(token && !['{', '}', '(', ')', '=', ';', ','].includes(token));
    return token.startsWith('"') ? (JSON.parse(token) as string) : token;
  };
  const value = (): Value => {
    if (tokens[index] === '{') {
      index++;
      const result: Record<string, Value> = {};
      while (tokens[index] !== '}') {
        const key = atom();
        assert.ok(!Object.hasOwn(result, key), `Duplicate project key: ${key}`);
        expect('=');
        result[key] = value();
        expect(';');
      }
      index++;
      return result;
    }
    if (tokens[index] === '(') {
      index++;
      const result: Value[] = [];
      while (tokens[index] !== ')') {
        result.push(value());
        if (tokens[index] !== ')') expect(',');
      }
      index++;
      return result;
    }
    return atom();
  };
  const result = dict(value());
  assert.equal(index, tokens.length, 'Trailing project tokens');
  return result;
}

const projectRoot = resolve(root, 'ios/App');
const parsed = parseProject(read('ios/App/App.xcodeproj/project.pbxproj'));
const objects = dict(parsed.objects);
const object = (id: string) => dict(objects[id]);
const entries = Object.entries(objects).map(([id, value]) => [id, dict(value)] as const);
const [targetId, target] = entries.find(
  ([, value]) => value.isa === 'PBXNativeTarget' && value.name === 'App',
)!;
const phase = (kind: string) =>
  object(list(target.buildPhases).find((id) => object(id).isa === kind)!);

test('iOS project parses with valid references and includes each original Swift file once in App Sources', () => {
  assert.ok(objects[string(parsed.rootObject)]);
  for (const [id, obj] of entries) {
    assert.match(id, /^[A-F0-9]{24}$/);
    for (const key of [
      'fileRef',
      'productRef',
      'mainGroup',
      'productReference',
      'buildConfigurationList',
      'baseConfigurationReference',
      'productRefGroup',
      'package',
    ]) {
      if (obj[key]) assert.ok(objects[string(obj[key])], `${id}.${key} is dangling`);
    }
    for (const key of [
      'children',
      'files',
      'targets',
      'buildPhases',
      'buildConfigurations',
      'packageProductDependencies',
      'packageReferences',
      'dependencies',
      'buildRules',
    ]) {
      if (obj[key])
        for (const ref of list(obj[key])) assert.ok(objects[ref], `${id}.${key} -> ${ref}`);
    }
  }
  const [groupId, group] = entries.find(
    ([, value]) => value.isa === 'PBXGroup' && value.name === 'ToPeak GPS',
  )!;
  const mainGroup = object(string(object(string(parsed.rootObject)).mainGroup));
  assert.ok(list(mainGroup.children).includes(groupId));
  assert.equal(group.sourceTree, 'SOURCE_ROOT');
  const nativeDir = resolve(projectRoot, string(group.path));
  assert.equal(nativeDir, resolve(root, 'native/ios'));
  const compiled = list(phase('PBXSourcesBuildPhase').files).map((id) =>
    string(object(id).fileRef),
  );
  for (const name of [
    'BackgroundLocationPlugin.swift',
    'LocationRecorder.swift',
    'LocationStore.swift',
    'ToPeakViewController.swift',
  ]) {
    const refs = entries.filter(
      ([, value]) =>
        value.isa === 'PBXFileReference' &&
        value.lastKnownFileType === 'sourcecode.swift' &&
        basename(string(value.path)) === name,
    );
    assert.equal(refs.length, 1, `${name}: duplicate or missing source reference`);
    const [id, ref] = refs[0];
    assert.ok(list(group.children).includes(id));
    assert.equal(ref.sourceTree, '<group>');
    assert.ok(existsSync(resolve(nativeDir, string(ref.path))));
    assert.equal(compiled.filter((ref) => ref === id).length, 1, `${name}: target membership`);
  }
});

test('Capacitor config agrees with the App bundle and generated web configuration when present', () => {
  assert.equal(capacitorConfig.webDir, 'dist');
  const info = plist.parse(read('ios/App/App/Info.plist'));
  assert.equal(info.CFBundleDisplayName, capacitorConfig.appName);
  const configurations = object(string(target.buildConfigurationList));
  for (const id of list(configurations.buildConfigurations)) {
    assert.equal(dict(object(id).buildSettings).PRODUCT_BUNDLE_IDENTIFIER, capacitorConfig.appId);
  }
  const generated = resolve(root, 'ios/App/App/capacitor.config.json');
  if (existsSync(generated)) {
    const config = JSON.parse(readFileSync(generated, 'utf8'));
    assert.equal(config.appId, capacitorConfig.appId);
    assert.equal(config.appName, capacitorConfig.appName);
    assert.equal(config.webDir, capacitorConfig.webDir);
    assert.ok(
      !config.packageClassList.includes('ToPeakBackgroundLocationPlugin'),
      'Local plugin registration belongs to ToPeakViewController, not generated packageClassList',
    );
  }
});

test('App links SDK SQLite and retains the managed Capacitor 8 SPM package', () => {
  const frameworks = list(phase('PBXFrameworksBuildPhase').files).map(object);
  const sqlite = frameworks.filter(
    (build) => build.fileRef && object(string(build.fileRef)).path === 'usr/lib/libsqlite3.tbd',
  );
  assert.equal(sqlite.length, 1);
  assert.equal(object(string(sqlite[0].fileRef)).sourceTree, 'SDKROOT');
  assert.ok(
    frameworks.some(
      (build) => build.productRef && object(string(build.productRef)).productName === 'CapApp-SPM',
    ),
  );
  const product = object(list(target.packageProductDependencies)[0]);
  const localPackage = object(string(product.package));
  const manifest = resolve(projectRoot, string(localPackage.relativePath), 'Package.swift');
  assert.ok(existsSync(manifest));
  const source = readFileSync(manifest, 'utf8');
  assert.match(source, /capacitor-swift-pm\.git", exact: "8\.0\.0"/);
  assert.match(source, /\.product\(name: "Capacitor", package: "capacitor-swift-pm"\)/);
  assert.match(source, /\.product\(name: "Cordova", package: "capacitor-swift-pm"\)/);
  assert.doesNotMatch(source, /LocationRecorder|LocationStore|sqlite|ToPeakBackgroundLocation/);
});

test('Debug and Release use the configured location permissions and background mode', () => {
  const info = plist.parse(read('ios/App/App/Info.plist'));
  const template = plist.parse(read('native/ios/LocationPermissions.plist'));
  for (const key of [
    'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription',
  ]) {
    assert.equal(info[key], template[key]);
    assert.ok(info[key].trim().length > 0);
  }
  assert.equal(info.UIBackgroundModes.filter((mode: string) => mode === 'location').length, 1);
  const project = object(string(parsed.rootObject));
  const attrs = dict(dict(dict(project.attributes).TargetAttributes)[targetId]);
  assert.equal(dict(dict(attrs.SystemCapabilities)['com.apple.BackgroundModes']).enabled, '1');
  const configurations = object(string(target.buildConfigurationList));
  for (const id of list(configurations.buildConfigurations)) {
    const settings = dict(object(id).buildSettings);
    assert.equal(settings.INFOPLIST_FILE, 'App/Info.plist');
    assert.equal(settings.PRODUCT_BUNDLE_IDENTIFIER, 'com.topeak.app');
    assert.equal(settings.SWIFT_VERSION, '5.0');
  }
});

test('initial storyboard loads the controller that registers the same plugin name as TypeScript', async () => {
  const story = await parseStringPromise(read('ios/App/App/Base.lproj/Main.storyboard'));
  const controllers = story.document.scenes
    .flatMap((scenes: { scene: unknown[] }) => scenes.scene)
    .flatMap((scene: { objects: unknown[] }) => scene.objects)
    .flatMap((objects: { viewController?: unknown[] }) => objects.viewController ?? []);
  const initial = controllers.find(
    (controller: { $: { id: string } }) =>
      controller.$.id === story.document.$.initialViewController,
  );
  assert.equal(initial.$.customClass, 'ToPeakViewController');
  assert.equal(initial.$.customModule, 'App');
  assert.equal(initial.$.customModuleProvider, 'target');
  const controller = read('native/ios/ToPeakViewController.swift');
  assert.match(controller, /class ToPeakViewController:\s*CAPBridgeViewController/);
  assert.match(controller, /override func capacitorDidLoad\(\)/);
  assert.match(
    controller,
    /bridge\?\.registerPluginInstance\(ToPeakBackgroundLocationPlugin\(\)\)/,
  );
  const plugin = read('native/ios/BackgroundLocationPlugin.swift');
  assert.match(plugin, /CAPPlugin, CAPBridgedPlugin/);
  const name = plugin.match(/public let jsName = "([^"]+)"/)![1];
  assert.equal(name, 'ToPeakBackgroundLocation');
  assert.ok(
    read('src/native/backgroundLocation.ts').includes(
      `registerPlugin<BackgroundLocationPlugin>('${name}')`,
    ),
  );
  const methods = [...plugin.matchAll(/CAPPluginMethod\(name: "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    methods.sort(),
    ['requestPermissions', 'start', 'pause', 'resume', 'stop', 'getStatus', 'readPoints'].sort(),
  );
  // 기억에 의존하지 않고 설치된 SDK의 실제 플러그인 등록 API와 대조한다.
  assert.match(
    read('node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift'),
    /capacitorDidLoad\(\)/,
  );
  assert.match(
    read('node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift'),
    /public func registerPluginInstance\(_ pluginInstance: CAPPlugin\)/,
  );
});
