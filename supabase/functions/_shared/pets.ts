import { db, playerView, rpcError } from './common.ts'

export async function petRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args)
  rpcError(error)
  return data
}

export function caseResult(data: Record<string, any>) {
  return { ...data, ...(data.player ? { player: playerView(data.player) } : {}) }
}
