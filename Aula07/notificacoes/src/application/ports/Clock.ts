// PORTA DE SAÍDA — "que horas são?". No original era `new Date()` e
// `Date.now()` direto no meio do código, o que impedia testar o limite por
// minuto. Com a porta, os testes usam um relógio fixo que dá para avançar.
export interface Clock {
  now(): Date;
}
