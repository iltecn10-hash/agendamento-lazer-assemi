ILTECN › GESTÃO SINDICAL — AGENDAMENTO ONLINE DO ESPAÇO DE LAZER
Sistema desenvolvido para: ASSEMI
====================================================================

O QUE É
-------
Um site simples e público, para os associados pedirem o uso do
espaço de lazer de qualquer lugar (celular, computador, sem precisar
estar na rede do escritório). A secretaria aprova ou recusa os
pedidos em um painel próprio, também acessível de qualquer lugar.

Importante: este sistema é SEPARADO do sistema local da ASSEMI (o
que tem os sócios, mensalidades, requisições, etc.). Ele guarda só
os pedidos de agendamento — não tem acesso a nenhum dado sensível
dos sócios.

Este guia assume que é a sua primeira vez publicando um sistema na
internet. Vamos usar 3 serviços, todos com plano gratuito:

  • GitHub   → onde o código do sistema fica guardado
  • Turso    → o banco de dados (guarda os agendamentos)
  • Render   → onde o sistema efetivamente "roda" e fica acessível

Leva uns 20-30 minutos na primeira vez. Depois de configurado, fica
tudo automático.


PASSO 1 — CRIAR CONTA NO GITHUB
------------------------------------
1. Acesse https://github.com e clique em "Sign up"
2. Siga o cadastro (e-mail, senha, nome de usuário)
3. Confirme o e-mail quando pedir

Depois de criar a conta:
4. Clique no "+" no canto superior direito → "New repository"
5. Em "Repository name", coloque: agendamento-lazer-assemi
6. Deixe como "Public" (não tem problema, não tem nenhum dado
   sensível no código)
7. NÃO marque nenhuma opção de "Add a README" (deixe tudo desmarcado)
8. Clique em "Create repository"

Você vai cair numa tela vazia com instruções — ignore, use o passo
abaixo:
9. Clique no link "uploading an existing file" (às vezes aparece
   como "upload an existing file")
10. Arraste TODOS os arquivos e pastas desta entrega (a pasta
    "agendamento-lazer" inteira, incluindo a subpasta "public")
    para dentro da página do navegador
11. Espere carregar, escreva algo tipo "Primeira versão" na
    caixinha de descrição no final da página
12. Clique em "Commit changes"

Pronto — o código está no GitHub.


PASSO 2 — CRIAR O BANCO DE DADOS NO TURSO
----------------------------------------------
1. Acesse https://turso.tech e clique em algo como "Get Started" ou
   "Sign up" — pode entrar direto com sua conta do GitHub (mais
   rápido)
2. Depois de logar, procure o botão "Create Database" (ou "New
   Database")
3. Dê um nome, por exemplo: agendamento-assemi
4. Escolha a região mais próxima do Brasil (geralmente aparece
   "São Paulo" ou "gru" — escolha essa se aparecer; senão, qualquer
   uma da América do Sul/EUA)
5. Clique em criar

Depois de criado, você precisa de DUAS informações — guarde as duas,
vamos usar no Render:

  a) A "Database URL" (geralmente começa com libsql://...)
     — normalmente aparece na tela do banco, em "Connect" ou
     parecido, algo como "Connection string" ou "URL"

  b) Um "Auth Token" (token de autenticação)
     — procure um botão "Create Token" ou "Generate Token" dentro
     da tela do banco, e copie o token gerado (é um texto longo)

Guarde essas duas informações num bloco de notas por enquanto —
vamos usar no próximo passo.


PASSO 3 — PUBLICAR NO RENDER
---------------------------------
1. Acesse https://render.com e clique em "Get Started" — pode
   entrar direto com sua conta do GitHub (recomendado, facilita)
2. No painel do Render, clique em "New +" → "Web Service"
3. Conecte sua conta do GitHub se pedir, e escolha o repositório
   "agendamento-lazer-assemi" que você criou no Passo 1
4. Preencha:
     Name: agendamento-assemi (ou o nome que quiser)
     Region: escolha a mais próxima (Oregon costuma ser a única
             gratuita disponível, tudo bem, funciona normalmente)
     Branch: main
     Runtime: Node
     Build Command: npm install
     Start Command: npm start
     Instance Type: Free

5. Antes de clicar em criar, desça até "Environment Variables" e
   adicione estas três (clique em "Add Environment Variable" para
   cada uma):

     Chave: TURSO_DATABASE_URL
     Valor: (cole a Database URL que você guardou no Passo 2)

     Chave: TURSO_AUTH_TOKEN
     Valor: (cole o Auth Token que você guardou no Passo 2)

     Chave: NODE_ENV
     Valor: production

6. Clique em "Create Web Service"

O Render vai instalar e iniciar o sistema sozinho — leva uns 2-5
minutos na primeira vez. Quando terminar, aparece um endereço tipo:

     https://agendamento-assemi.onrender.com

Esse é o link que os associados vão usar! O painel da secretaria
fica em:

     https://agendamento-assemi.onrender.com/admin


PASSO 4 — PEGAR A SENHA INICIAL DO ADMINISTRADOR
-----------------------------------------------------
Como o Render (no plano grátis) não guarda arquivos permanentemente,
a senha inicial não fica salva num arquivo como no sistema local —
ela só aparece nos REGISTROS (logs) do sistema.

1. No painel do Render, clique no seu serviço
   (agendamento-assemi)
2. Clique na aba "Logs"
3. Procure por uma mensagem assim:

     Conta admin criada. Usuário: admin  |  Senha: xxxxxxxx

4. Anote essa senha AGORA — se perder, veja "Dúvidas frequentes"
   abaixo sobre como redefinir.

5. Acesse https://SEU-ENDERECO.onrender.com/admin e faça login com
   usuário "admin" e essa senha. Depois de entrar, clique em "Minha
   conta" no topo da página e troque a senha assim que possível.


PASSO 5 — AVISO AUTOMÁTICO NO WHATSAPP (OPCIONAL, RECOMENDADO)
--------------------------------------------------------------------
Isso faz a secretaria receber um aviso automático no WhatsApp toda
vez que um associado fizer um pedido novo. Leva uns 5 minutos, e é
gratuito. Se pular esse passo, o sistema funciona normalmente do
mesmo jeito — só não manda esse aviso automático.

1. No WhatsApp do celular da secretaria, adicione este número como
   contato:  +34 621 331 709  (nome: "CallMeBot" ou qualquer nome)

   Atenção: esse número pode mudar de vez em quando. Se não der
   certo, confira o número atualizado em https://www.callmebot.com
   (procure "WhatsApp API" no site).

2. Mande uma mensagem de texto pra esse contato, exatamente assim:

     I allow callmebot to send me messages

3. Em alguns segundos, o CallMeBot responde com uma mensagem
   contendo sua "API Key" (um número, tipo: 123456). Anote esse
   número.

4. Volte no Render, no seu serviço → aba "Environment" → adicione
   mais duas variáveis (do mesmo jeito que fez com as do Turso no
   Passo 3):

     Chave: CALLMEBOT_PHONE
     Valor: o número de telefone da secretaria com código do país,
            só números, sem espaços nem símbolos.
            Exemplo: 5594999998888

     Chave: CALLMEBOT_APIKEY
     Valor: (a API Key que o CallMeBot te mandou no passo 3)

5. Salve — o Render reinicia sozinho o sistema com a nova
   configuração (leva 1-2 minutos).

Pronto! A partir de agora, toda vez que alguém pedir uma reserva
pelo site público, esse número do WhatsApp recebe um aviso
automático. Não precisa fazer nada além disso.

Observação: o CallMeBot é um serviço de terceiros, gratuito para uso
pessoal/baixo volume — não tem relação com a Meta/WhatsApp oficial.
Funciona bem para esse tipo de aviso interno, mas tem limite de
mensagens por dia (raramente um problema para o volume de pedidos
de uma associação).


COMO FUNCIONA NO DIA A DIA
-------------------------------
• Associados acessam o link público, veem as datas já reservadas
  daquele mês, e preenchem um formulário simples (nome, telefone,
  data, finalidade) — sem precisar de login.

• A secretaria acessa "/admin", faz login, e vê a lista de pedidos.
  Pode aprovar, recusar (com motivo opcional) ou excluir.

• O sistema nunca deixa confirmar duas reservas na mesma data — se
  tentar aprovar uma data já confirmada por outro pedido, ele avisa.

• Pedidos ficam pendentes até alguém da secretaria decidir.

• Cada aprovação ou recusa mostra o nome de quem decidiu.


USUÁRIOS DO PAINEL (VÁRIAS PESSOAS COM LOGIN PRÓPRIO)
-------------------------------------------------------
Quem entra com perfil "Administrador" vê o botão "Usuários" no topo.
Por ele é possível:

• Cadastrar um novo usuário: nome, login, senha inicial e perfil.
  Passe o login e a senha para a pessoa; ela pode trocar a senha
  depois em "Minha conta".
• Editar o nome e o perfil de um usuário.
• Definir uma nova senha para quem esqueceu a sua.
• Desativar (bloqueia o acesso na hora, mas mantém o cadastro) ou
  reativar. Para quem saiu da secretaria, prefira "Desativar".
• Excluir definitivamente.

Perfis:
• Administrador — agendamentos + gerenciar usuários.
• Secretaria    — só agendamentos (aprovar, recusar, excluir, imprimir).

Proteções: ninguém consegue desativar, rebaixar ou excluir a própria
conta, e o sistema sempre mantém pelo menos um administrador ativo.
A conta "admin" que já existia continua funcionando como Administrador.


MANUAL COM VIDEOAULAS
-----------------------
O endereço /ajuda (botão "Ajuda" no topo do painel e link na tela de
login) abre o manual com 7 videoaulas narradas, de cerca de 1 minuto
cada, e o passo a passo escrito de cada função. Os vídeos ficam na
pasta public/videos e usam só dados fictícios.


SOBRE O PLANO GRATUITO DO RENDER — UM DETALHE IMPORTANTE
--------------------------------------------------------------
No plano grátis, o sistema "dorme" depois de 15 minutos sem
visitas, e demora uns 30-60 segundos para "acordar" na visita
seguinte (a pessoa vai ver a página carregando devagar na primeira
vez, e rápido depois). Isso é normal e não afeta os dados — só o
tempo de carregamento da primeira visita do dia.

Se isso incomodar muito no futuro, dá para trocar para um plano
pago do Render (a partir de uns R$35/mês) que elimina essa demora.


TROCANDO PARA UM DOMÍNIO PRÓPRIO NO FUTURO
------------------------------------------------
Quando vocês registrarem um domínio (ex.: iltecn.com.br), é só ir
em Settings → Custom Domain dentro do serviço no Render, e seguir
as instruções de lá — o Render cuida do certificado de segurança
automaticamente, sem precisar configurar nada manualmente.


DÚVIDAS FREQUENTES
-----------------------
- "Configurei o CallMeBot mas o aviso não chega no WhatsApp" →
  confira se as duas variáveis (CALLMEBOT_PHONE e CALLMEBOT_APIKEY)
  foram salvas certinho no Render, sem espaços a mais. O número de
  telefone deve ser só dígitos com código do país (ex: 5594999998888,
  sem "+", sem espaço, sem traço). Se ainda não funcionar, tente
  refazer a autorização no WhatsApp (passo 1-3) — o CallMeBot às
  vezes expira a autorização depois de um tempo sem uso.

- "O botão 'Avisar no WhatsApp' abre uma conversa em branco" →
  o telefone que o associado digitou no formulário pode estar num
  formato estranho (com letras, faltando números). O sistema tenta
  corrigir automaticamente adicionando o "55" do Brasil, mas não
  consegue validar se o número em si está certo.

- "Perdi a senha inicial do admin e não consigo mais entrar" →
  Isso precisa ser corrigido diretamente no banco de dados (Turso).
  Peça ajuda ao desenvolvedor, ou: no painel do Turso, procure uma
  opção de "Shell"/"Console" do banco e rode um comando SQL para
  apagar a linha da tabela "admins" — o sistema cria uma conta nova
  automaticamente na próxima vez que reiniciar.

- "O site demorou muito pra abrir" → normal no plano grátis do
  Render após um tempo sem uso (veja a seção acima).

- "Quero ver todos os pedidos, não só os pendentes" → no painel
  admin, troque o filtro de status para "Todos os status".

- "Posso hospedar outros sistemas nesse mesmo Render/Turso?" → sim!
  Cada sistema novo é um "Web Service" separado no Render (mesma
  conta), e pode ser um banco novo no Turso ou o mesmo banco com
  tabelas diferentes, dependendo do projeto.
