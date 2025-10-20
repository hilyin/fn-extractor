# extract-fn

A production-ready tool to extract function/method source code from JavaScript/TypeScript files using AST parsing.

## Features

- **Comprehensive Function Support:**
  - Function declarations: `function foo() {}`
  - Arrow functions: `const foo = () => {}`
  - Function expressions: `const foo = function() {}`
  - Class methods: `class Bar { foo() {} }`
  - Object methods: `{ foo() {} }`
  - Computed property names: `class X { ['foo']() {} }`
  - Private methods: `class X { #foo() {} }`

- **Export Handling:**
  - Named exports: `export function foo() {}`
  - Export declarations: `export const foo = () => {}`
  - Default exports: `export default function foo() {}`
  - CommonJS: `exports.foo = () => {}`, `module.exports.foo = function() {}`

- **Smart Features:**
  - Includes JSDoc comments and decorators
  - Priority system (prefers top-level over nested)
  - TypeScript overload signature handling
  - String literal property keys: `{ 'foo': () => {} }`

- **Robust Parsing:**
  - Uses Babel parser for accurate AST-based extraction
  - Handles edge cases (strings, comments, nested braces)
  - Error recovery for partial/invalid syntax
  - Modern JavaScript/TypeScript syntax support

## Installation

```bash
npm install
```

## Usage

### CLI

```bash
node extract.js <file-path> <function-name>
```

Example:
```bash
node extract.js ./src/services/MyService.js myFunction
```

### Programmatic

```javascript
import { extractFunction } from './extract.js';

const result = extractFunction('/path/to/file.js', 'functionName');

if (result.found) {
    console.log(result.code);
    console.log('Location:', result.location);
} else {
    console.error(result.error);
}
```

### Return Value

```javascript
{
    found: boolean,
    code: string | null,        // The extracted source code
    location: {                 // Line/column information
        start: number,
        end: number,
        startColumn: number,
        endColumn: number
    } | null,
    error: string | undefined   // Error message if found === false
}
```

## Testing

```bash
npm test
```

This runs test cases for:
- Class methods
- Regular functions
- Arrow functions
- Object methods
- Non-existent functions

## How It Works

1. Reads the source file
2. Parses it into an AST (Abstract Syntax Tree) using Babel
3. Traverses the AST to find the function by name
4. Extracts the exact source code using location information
5. Returns the code with proper line/column boundaries

## Why AST Parsing?

Simple regex or brace-counting fails on:
- Braces in strings: `console.log("{ not real }")`
- Braces in comments: `// { also not real }`
- Template literals: `` `${x}` ``
- Nested functions
- Different function syntaxes

AST parsing handles all these cases correctly by understanding the code structure.
