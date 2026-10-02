/**
 * Um valor em dinheiro na tela.
 *
 * Existe para o modo privado ter o que esconder: o CSS borra `[data-money]`, e envolver o valor aqui é
 * o que o marca. Sem isto, cada tela precisaria lembrar de marcar os seus próprios números — e a que
 * esquecesse vazaria o saldo justamente quando o olhinho está ligado.
 */
export function Money({ children }: { children: React.ReactNode }) {
  return <span data-money>{children}</span>;
}
