import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tsParser from '@typescript-eslint/parser';

const emojiRegex = /\p{Extended_Pictographic}/u;

const customEmojiPlugin = {
  rules: {
    'no-emoji': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow emojis in code (UI must use Lucide vector icons instead)',
        },
        schema: [],
        messages: {
          unexpectedEmoji:
            "Emoji '{{emoji}}' is not allowed in code. Use Lucide vector icons or standard symbols.",
        },
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value === 'string' && emojiRegex.test(node.value)) {
              const match = node.value.match(emojiRegex);
              context.report({
                node,
                messageId: 'unexpectedEmoji',
                data: { emoji: match ? match[0] : '' },
              });
            }
          },
          TemplateElement(node) {
            if (node.value?.raw && emojiRegex.test(node.value.raw)) {
              const match = node.value.raw.match(emojiRegex);
              context.report({
                node,
                messageId: 'unexpectedEmoji',
                data: { emoji: match ? match[0] : '' },
              });
            }
          },
          Program() {
            const comments = context.sourceCode.getAllComments();
            for (const comment of comments) {
              if (emojiRegex.test(comment.value)) {
                const match = comment.value.match(emojiRegex);
                context.report({
                  loc: comment.loc,
                  messageId: 'unexpectedEmoji',
                  data: { emoji: match ? match[0] : '' },
                });
              }
            }
          },
        };
      },
    },
  },
};

const sharedRules = {
  'no-var': 'error',
  'prefer-const': 'warn',
  'no-duplicate-imports': 'error',
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.object.name='console'][callee.property.name='log']",
      message:
        'console.log is not allowed in production code. Use console.warn, console.error or a logger.',
    },
  ],
  'custom/no-emoji': 'error',
  'no-unused-vars': [
    'error',
    {
      vars: 'all',
      args: 'none',
      ignoreRestSiblings: true,
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

export default [
  // Global ignore patterns
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'android/**',
      'www/**',
      'public/**',
      'bun.lock',
      'package-lock.json',
      'dist/**',
      'build/**',
      '.husky/**',
      'app/**',
      'hooks/**',
      'lib/**',
      'next.config.ts',
      'next-env.d.ts',
    ],
  },

  // Base recommended rules
  js.configs.recommended,

  // Browser Vanilla JS scripts
  {
    files: ['*.js', 'banks/**/*.js'],
    plugins: {
      custom: customEmojiPlugin,
    },
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        firebase: 'readonly',
        db: 'writable',
        auth: 'writable',
        Cache: 'writable',
        Capacitor: 'readonly',
        Chart: 'readonly',
        pdfjsLib: 'readonly',
        lucide: 'readonly',
      },
    },
    rules: {
      ...sharedRules,
      'no-undef': 'off', // Browser scripts share global namespace without explicit import/export
      'no-redeclare': 'off', // Top-level variables and functions shared across scripts
      'no-global-assign': 'off', // Cache and other shared globals
    },
  },

  // Node.js scripts and config modules
  {
    files: ['*.mjs', 'scripts/**/*.js'],
    plugins: {
      custom: customEmojiPlugin,
    },
    languageOptions: {
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      ...sharedRules,
      'no-restricted-syntax': 'off', // CLI scripts can use console.log
    },
  },

  // TypeScript files (server.ts)
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      custom: customEmojiPlugin,
    },
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      ...sharedRules,
      'no-restricted-syntax': 'off', // Dev server can use console.log
    },
  },

  // Prettier config must be last to disable conflicting formatting rules
  prettier,
];
