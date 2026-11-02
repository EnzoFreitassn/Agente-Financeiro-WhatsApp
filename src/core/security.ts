/**
 * Helpers de seguranca: identificacao de remetente e whitelist.
 */

/** Extrai so os digitos do JID do WhatsApp. Ex.: "5585999999999@s.whatsapp.net" -> "5585999999999". */
export function jidToNumber(jid: string): string {
  const base = jid.split('@')[0] ?? '';
  // Remove sufixo de device (ex.: ":12") e tudo que nao for digito.
  return base.split(':')[0]!.replace(/\D/g, '');
}

/** True se o JID e de um grupo (@g.us) — grupos sao ignorados neste bot pessoal. */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

/**
 * Variantes de um numero brasileiro para lidar com o 9o digito de celular.
 * WhatsApp as vezes entrega com e as vezes sem o "9" apos o DDD.
 * Ex.: 5585999999999 (13) <-> 558599999999 (12).
 */
function brazilVariants(num: string): Set<string> {
  const set = new Set<string>([num]);
  if (num.length === 13 && num.startsWith('55') && num[4] === '9') {
    set.add(num.slice(0, 4) + num.slice(5)); // remove o 9o digito
  } else if (num.length === 12 && num.startsWith('55')) {
    set.add(num.slice(0, 4) + '9' + num.slice(4)); // adiciona o 9o digito
  }
  return set;
}

/**
 * Verifica se um numero (so digitos) esta na whitelist, com tolerancia ao 9o digito BR.
 */
export function isAllowed(number: string, allowed: readonly string[]): boolean {
  if (!number) return false;
  const candidateVariants = brazilVariants(number);
  for (const a of allowed) {
    for (const v of brazilVariants(a)) {
      if (candidateVariants.has(v)) return true;
    }
  }
  return false;
}
