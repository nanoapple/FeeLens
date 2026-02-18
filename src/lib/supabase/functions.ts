/**
 * FeeLens — write API (barrel)
 *
 * UI layer should import from this file.
 * Internally we split into:
 * - edge.ts  : Edge Functions (business writes)
 * - rpc.ts   : RPC + Storage helpers (verification/linking)
 * - types.ts : shared contracts
 */

export * from './types'
export * from './edge'
export * from './rpc'
