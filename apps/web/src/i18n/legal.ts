/** Textos legais (pt-BR). Mantidos fora dos componentes para facilitar revisão e tradução. */
export interface LegalDoc { title: string; updated: string; sections: { heading: string; paragraphs: string[] }[] }

export const TERMS: LegalDoc = {
  title: "Termos de uso",
  updated: "16 de setembro de 2026",
  sections: [
    { heading: "1. O que é o Fireshot", paragraphs: [
      "O Fireshot é um jogo educacional gratuito, jogado no navegador, que ensina conceitos de redes de computadores e cibersegurança por meio de mecânicas de jogo.",
      "Todo o conteúdo é defensivo e conceitual. O jogo não ensina, não incentiva e não fornece instruções operacionais para atacar sistemas reais.",
    ] },
    { heading: "2. Conta", paragraphs: [
      "Para salvar progresso, conquistas e emitir certificado é preciso criar uma conta com nome, nome de jogador, e-mail e senha. Você é responsável por manter sua senha em sigilo.",
      "O nome de jogador é público (aparece no rank). Não é permitido usar nomes que se passem pela equipe do jogo ou por outras pessoas, nem nomes ofensivos; esses nomes podem ser alterados ou a conta suspensa.",
      "É possível experimentar o tutorial sem conta; nesse caso nada é salvo.",
    ] },
    { heading: "3. Uso aceitável", paragraphs: [
      "Não é permitido manipular o cliente ou a API para obter XP, conquistas, tempo ativo ou certificados de forma fraudulenta. O servidor valida os eventos e pode rejeitar resultados implausíveis.",
      "Não é permitido tentar invadir, sobrecarregar ou testar a segurança da plataforma sem autorização expressa.",
    ] },
    { heading: "4. Certificado de conclusão", paragraphs: [
      "O certificado é um certificado de conclusão livre, emitido pela plataforma, sem reconhecimento do MEC e sem valor de diploma ou de curso regulamentado.",
      "A carga horária informada corresponde ao tempo ativo medido no jogo, arredondado, e não ao tempo total com a página aberta.",
      "O nome é informado e confirmado por você no momento da emissão e não pode ser alterado depois. Cada certificado tem um código único e uma assinatura digital verificável publicamente.",
      "Certificados obtidos de forma fraudulenta podem ser revogados.",
    ] },
    { heading: "5. Disponibilidade", paragraphs: [
      "O serviço é oferecido como está, sem garantia de disponibilidade contínua. Podemos alterar fases, regras de progressão e critérios de certificado para melhorar o conteúdo educacional.",
    ] },
    { heading: "6. Encerramento", paragraphs: [
      "Você pode excluir sua conta a qualquer momento pelo Perfil. Contas usadas para fraude ou abuso podem ser suspensas.",
    ] },
    { heading: "7. Contato", paragraphs: [
      "Dúvidas, sugestões e denúncias de uso indevido: fireshotIO@gmail.com.",
      "Encontrou uma falha de segurança? Escreva para o mesmo e-mail antes de divulgá-la, para que possamos corrigir e proteger os jogadores.",
    ] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Política de privacidade",
  updated: "16 de setembro de 2026",
  sections: [
    { heading: "1. Dados que coletamos", paragraphs: [
      "Dados de cadastro: nome, nome de jogador, agente escolhido, e-mail e a senha, que é armazenada apenas como hash (argon2). Nunca guardamos a senha em texto.",
      "Dados de uso do jogo: progresso nas fases, respostas nos terminais, eventos de jogo (como abates e itens coletados), conquistas, upgrades e tempo ativo (heartbeats enviados apenas enquanto a aba está visível e você está interagindo).",
      "No certificado: nome completo informado por você, carga horária ativa, data de conclusão e lista de módulos.",
      "Não coletamos localização, contatos, dados de pagamento, nem usamos rastreadores de publicidade.",
    ] },
    { heading: "2. Para que usamos", paragraphs: [
      "Para manter sua conta, salvar o progresso, calcular XP e conquistas, medir o tempo ativo, emitir e permitir a verificação do certificado e proteger a plataforma contra fraudes.",
      "Base legal (LGPD, art. 7º): execução do serviço solicitado por você e legítimo interesse na prevenção de fraudes e na verificação pública de certificados emitidos.",
    ] },
    { heading: "3. Cookies", paragraphs: [
      "Usamos apenas cookies essenciais de sessão (httpOnly), necessários para manter você conectado. Preferências do jogo, como sensibilidade do mouse e teclas, ficam salvas no seu navegador.",
    ] },
    { heading: "4. Compartilhamento", paragraphs: [
      "Não vendemos nem compartilhamos seus dados com terceiros. A página pública de verificação exibe apenas os dados impressos no certificado, para quem possuir o código.",
      "O rank é público e mostra apenas nome de jogador, agente, nível, XP, fases concluídas e tempos. Seu nome e seu e-mail nunca aparecem no rank.",
    ] },
    { heading: "5. Seus direitos", paragraphs: [
      "Você pode acessar e corrigir seus dados de cadastro, e excluir sua conta a qualquer momento pelo Perfil.",
      "Ao excluir a conta, removemos nome, e-mail, senha, progresso, respostas, eventos, conquistas, upgrades e tempo ativo.",
      "Mantemos apenas o registro de verificação de certificados já emitidos, para que continuem verificáveis por terceiros. Se você pedir, o nome no registro é anonimizado; a verificação passa a indicar que o titular foi anonimizado.",
    ] },
    { heading: "6. Segurança e retenção", paragraphs: [
      "Senhas com argon2 (senhas muito comuns são recusadas), sessões em cookies httpOnly e Secure com tokens de curta duração, bloqueio temporário do login após tentativas erradas seguidas, conexão criptografada e verificada com o banco de dados, assinatura digital Ed25519 nos certificados e limitação de requisições.",
      "Dados de jogo são mantidos enquanto a conta existir. Registros técnicos de heartbeat podem ser agregados e descartados periodicamente.",
    ] },
    { heading: "7. Contato", paragraphs: [
      "Para exercer seus direitos (acesso, correção, exclusão, informação sobre o uso dos dados) ou tirar dúvidas sobre privacidade, escreva para fireshotIO@gmail.com. Respondemos em até 15 dias.",
      "A exclusão da conta também pode ser feita a qualquer momento, sem precisar de contato, pelo Perfil.",
    ] },
  ],
};
