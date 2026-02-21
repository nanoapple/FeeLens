// eslint.config.cjs
const next = require('eslint-config-next')

const nextConfigs = Array.isArray(next) ? next : [next]

module.exports = [
  { ignores: ['.next/**', 'node_modules/**', 'supabase/**'] },

  // IMPORTANT: eslint-config-next is an array -> spread it
  ...nextConfigs,

  // Keep overrides minimal and safe (no TS-plugin rules unless installed explicitly)
  {
    rules: {
        'no-unused-vars': 'warn',
        'react-hooks/set-state-in-effect': 'warn',
        'react-hooks/refs': 'warn',
        "react-hooks/preserve-manual-memoization": "warn"
    },
  },
]