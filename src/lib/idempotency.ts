import { randomUUID } from "node:crypto";

/**
 * Chave de idempotência gerada no servidor ao renderizar o formulário.
 * Reenvios do mesmo formulário (duplo clique, nova tentativa) reutilizam a chave
 * e o banco devolve o registro já criado em vez de duplicar a operação.
 */
export function newIdempotencyKey(): string {
  return randomUUID();
}
