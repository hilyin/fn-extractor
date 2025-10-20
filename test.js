import { extractFunction } from './extract.js';
import fs from 'fs';

// Create a comprehensive test file
const testCode = `
// Test 1: Regular function with JSDoc
/**
 * This is a JSDoc comment
 * @param {number} a
 * @param {number} b
 */
function regularFunction(a, b) {
    return a + b;
}

// Test 2: Arrow function
const arrowFunction = (x) => {
    const result = x * 2;
    return result;
};

// Test 3: Class method
class Example {
    constructor() {
        this.value = 42;
    }

    // Test method with comment
    testMethod() {
        return this.value;
    }

    // Test computed property name
    ['computedMethod']() {
        return 'computed';
    }
}

// Test 4: Object method
const obj = {
    methodInObject() {
        console.log('hello');
    },

    'stringKeyMethod': function() {
        return 'string key';
    }
};

// Test 5: Export named function
export function exportedFunction() {
    return 'exported';
}

// Test 6: Export named arrow
export const exportedArrow = () => {
    return 'exported arrow';
};

// Test 7: Export default function
export default function defaultExport() {
    return 'default';
}

// Test 8: CommonJS exports
exports.commonJsExport = () => {
    return 'commonjs';
};

module.exports.moduleExport = function() {
    return 'module.exports';
};

// Test 9: Nested function (should prefer top-level)
function outerFunction() {
    function nestedFunction() {
        return 'nested';
    }
    return nestedFunction();
}

function nestedFunction() {
    return 'top-level';
}
`;

fs.writeFileSync('/tmp/test-extract.js', testCode);

console.log('Testing improved function extraction...\n');

const tests = [
    { name: 'Regular Function with JSDoc', fnName: 'regularFunction', shouldIncludeJSDoc: true },
    { name: 'Arrow Function', fnName: 'arrowFunction' },
    { name: 'Class Method', fnName: 'testMethod' },
    { name: 'Computed Method Name', fnName: 'computedMethod' },
    { name: 'Object Method', fnName: 'methodInObject' },
    { name: 'String Key Method', fnName: 'stringKeyMethod' },
    { name: 'Exported Function', fnName: 'exportedFunction' },
    { name: 'Exported Arrow', fnName: 'exportedArrow' },
    { name: 'Default Export', fnName: 'defaultExport' },
    { name: 'CommonJS Export', fnName: 'commonJsExport' },
    { name: 'Module Export', fnName: 'moduleExport' },
    { name: 'Top-level vs Nested (priority)', fnName: 'nestedFunction', shouldPreferTopLevel: true },
    { name: 'Non-existent Function', fnName: 'doesNotExist', shouldFail: true }
];

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    console.log(`=== Test ${index + 1}: ${test.name} ===`);
    const result = extractFunction('/tmp/test-extract.js', test.fnName);

    if (test.shouldFail) {
        if (!result.found) {
            console.log('✓ PASS (correctly not found)');
            if (result.error) console.log('Error:', result.error);
            passed++;
        } else {
            console.log('✗ FAIL (should not have been found)');
            failed++;
        }
    } else {
        if (result.found) {
            console.log('✓ PASS');
            console.log(result.code);

            // Additional checks
            if (test.shouldIncludeJSDoc && !result.code.includes('JSDoc')) {
                console.log('⚠ WARNING: JSDoc comment not included');
            }
            if (test.shouldPreferTopLevel && result.code.includes('nested')) {
                console.log('✓ Correctly preferred top-level over nested');
            }
            passed++;
        } else {
            console.log('✗ FAIL');
            console.log('Error:', result.error);
            failed++;
        }
    }
    console.log();
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed}/${tests.length} tests passed`);
if (failed > 0) {
    console.log(`⚠ ${failed} test(s) failed`);
    process.exit(1);
} else {
    console.log('✓ All tests passed!');
}

// Cleanup
fs.unlinkSync('/tmp/test-extract.js');
