#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

// helper: get a comparable name from a node key or identifier-like node
function keyName(node) {
  if (!node) return null;
  switch (node.type) {
    case 'Identifier': return node.name;
    case 'StringLiteral': return node.value;
    case 'PrivateName': return node.id?.name ?? null;
    default: return null; // ignore Symbol/computed for CLI-by-name matching
  }
}

// helper: choose earliest start considering leading comments and decorators
function computeStartLoc(node) {
  let start = node.loc.start;
  if (node.leadingComments?.length) {
    const first = node.leadingComments[0];
    if (first.loc && first.loc.start.line < start.line ||
        (first.loc && first.loc.start.line === start.line && first.loc.start.column < start.column)) {
      start = first.loc.start;
    }
  }
  if (node.decorators?.length) {
    const first = node.decorators[0];
    if (first.loc && (first.loc.start.line < start.line ||
        (first.loc.start.line === start.line && first.loc.start.column < start.column))) {
      start = first.loc.start;
    }
  }
  return start;
}

/**
 * Extract function/method source code from a JS/TS file.
 * @param {string} filePath
 * @param {string} functionName
 * @returns {{found:boolean, code:string|null, location: {start:number,end:number,startColumn:number,endColumn:number}|null, error?:string}}
 */
export function extractFunction(filePath, functionName) {
  try {
    const sourceCode = fs.readFileSync(filePath, 'utf8');
    const lines = sourceCode.split('\n');

    const ext = path.extname(filePath).toLowerCase();
    const isTS = ext === '.ts' || ext === '.tsx';
    const isJSX = ext === '.jsx' || ext === '.tsx';

    const ast = parse(sourceCode, {
      sourceType: 'module',
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      plugins: [
        isTS && 'typescript',
        isJSX && 'jsx',
        // keep modern syntax on to avoid parse fails
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        ['decorators', { decoratorsBeforeExport: true }],
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'importAttributes',
        'topLevelAwait'
      ].filter(Boolean),
    });

    /** @type {{node:any, priority:number}|null} */
    let bestMatch = null;

    function setMatch(node, priority) {
      // pick highest priority; lower number means higher priority
      if (!bestMatch || priority < bestMatch.priority) {
        bestMatch = { node, priority };
      }
    }

    traverse.default(ast, {
      // function foo() {}
      FunctionDeclaration(path) {
        const n = path.node;
        // skip TS overload signatures that have no body
        if (!n.body) return;
        if (n.id && n.id.name === functionName) {
          // top-level wins over nested
          const priority = path.parent.type === 'Program' ? 0 : 3;
          setMatch(n, priority);
        }
      },

      // export function foo() {}, export default function foo() {}
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (decl?.type === 'FunctionDeclaration' && decl.id?.name === functionName && decl.body) {
          setMatch(decl, 0);
        }
        if (decl?.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id?.type === 'Identifier' && d.id.name === functionName &&
                d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')) {
              setMatch(decl, 0);
            }
          }
        }
      },
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if ((decl?.type === 'FunctionDeclaration' && (decl.id?.name === functionName || !decl.id)) ||
            (decl?.type === 'ArrowFunctionExpression' || decl?.type === 'FunctionExpression')) {
          // only treat as match if default name equals requested name; unnamed default is not a match
          if (decl?.id?.name === functionName) {
            setMatch(decl, 0);
          }
        }
      },

      // const foo = () => {}  |  const foo = function() {}
      VariableDeclarator(path) {
        const id = path.node.id;
        if (id?.type === 'Identifier' && id.name === functionName) {
          const init = path.node.init;
          if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
            setMatch(path.parent, path.parentPath.parent.type === 'Program' ? 1 : 4);
          }
        }
      },

      // class Foo { foo() {} }  |  class Foo { ['foo']() {} }
      ClassMethod(path) {
        const name = keyName(path.node.key);
        if (name === functionName) {
          setMatch(path.node, 2);
        }
      },
      ClassPrivateMethod(path) {
        const name = keyName(path.node.key);
        if (name === functionName) {
          setMatch(path.node, 2);
        }
      },

      // object literal methods and properties
      ObjectMethod(path) {
        const name = keyName(path.node.key);
        if (name === functionName) {
          setMatch(path.node, 2);
        }
      },
      ObjectProperty(path) {
        const name = keyName(path.node.key);
        const v = path.node.value;
        if (name === functionName &&
            v && (v.type === 'ArrowFunctionExpression' || v.type === 'FunctionExpression')) {
          setMatch(path.node, 2);
        }
      },

      // CommonJS: exports.foo = () => {}  |  module.exports.foo = function() {}
      AssignmentExpression(path) {
        const { left, right } = path.node;
        if (right && (right.type === 'ArrowFunctionExpression' || right.type === 'FunctionExpression')) {
          if (left.type === 'MemberExpression' && !left.computed) {
            const prop = left.property;
            if (prop.type === 'Identifier' && prop.name === functionName) {
              // capture the whole statement
              const stmt = path.getStatementParent()?.node ?? path.node;
              setMatch(stmt, 1);
            }
          }
          if (left.type === 'MemberExpression' && left.computed && left.property.type === 'StringLiteral') {
            if (left.property.value === functionName) {
              const stmt = path.getStatementParent()?.node ?? path.node;
              setMatch(stmt, 1);
            }
          }
        }
      },
    });

    if (!bestMatch) {
      return { found: false, code: null, location: null, error: `Function '${functionName}' not found in ${filePath}` };
    }

    const node = bestMatch.node;

    // compute slice with comments/decorators included at the start
    const start = computeStartLoc(node);
    const end = node.loc.end;

    const slice = lines.slice(start.line - 1, end.line);
    if (slice.length === 1) {
      slice[0] = slice[0].substring(start.column, end.column);
    } else {
      slice[0] = slice[0].substring(start.column);
      slice[slice.length - 1] = slice[slice.length - 1].substring(0, end.column);
    }
    const code = slice.join('\n');

    return {
      found: true,
      code,
      location: {
        start: start.line,
        end: end.line,
        startColumn: start.column,
        endColumn: end.column,
      },
    };
  } catch (error) {
    return { found: false, code: null, location: null, error: error.message };
  }
}

// CLI
if (import.meta.url === fileURLToPath(new URL(import.meta.url)) || import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: extract-fn <file-path> <function-name>');
    console.error('Example: extract-fn ../server/services/MediaService.js getMediaById');
    process.exit(1);
  }

  const [filePath, functionName] = args;
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const result = extractFunction(filePath, functionName);
  if (result.found) {
    console.log(result.code);
  } else {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}
