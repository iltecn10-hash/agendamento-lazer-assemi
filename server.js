const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { createClient } = require('@libsql/client');

// ---------------------------------------------------------------------------
// Configuração / banco de dados
// ---------------------------------------------------------------------------
// Em produção (Render), defina as variáveis de ambiente TURSO_DATABASE_URL e
// TURSO_AUTH_TOKEN (veja DEPLOY.md). Sem elas, usa um arquivo local — útil só
// para testar no seu computador antes de publicar.
const DB_URL = process.env.TURSO_DATABASE_URL || 'file:local-dev.db';
const DB_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

const db = createClient({ url: DB_URL, authToken: DB_AUTH_TOKEN });

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const NOME_ASSOCIACAO = process.env.NOME_ASSOCIACAO || 'ASSEMI';

// CallMeBot: avisa automaticamente a secretaria no WhatsApp quando chega um pedido novo.
// Configure via variáveis de ambiente (veja DEPLOY.md). Se não configurado, o sistema
// simplesmente não envia o aviso — tudo o mais continua funcionando normalmente.
const CALLMEBOT_PHONE = process.env.CALLMEBOT_PHONE || '';
const CALLMEBOT_APIKEY = process.env.CALLMEBOT_APIKEY || '';

async function avisarSecretariaWhatsApp(mensagem) {
  if (!CALLMEBOT_PHONE || !CALLMEBOT_APIKEY) return; // não configurado, ignora silenciosamente
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(CALLMEBOT_PHONE)}&text=${encodeURIComponent(mensagem)}&apikey=${encodeURIComponent(CALLMEBOT_APIKEY)}`;
    await fetch(url);
  } catch (e) {
    console.log('Aviso: não foi possível enviar notificação ao WhatsApp da secretaria:', e.message);
  }
}


async function migrar() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS solicitacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      matricula TEXT DEFAULT '',
      telefone TEXT DEFAULT '',
      data TEXT NOT NULL,
      finalidade TEXT NOT NULL,
      observacoes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente',
      aprovado_por TEXT,
      aprovado_em TEXT,
      motivo_recusa TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nome TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    )
  `);

  // Módulo de usuários: perfil (admin = gerencia usuários / secretaria = só agendamentos)
  // e ativo (1 = pode entrar, 0 = acesso bloqueado). Contas que já existiam viram "admin".
  const cols = await db.execute('PRAGMA table_info(admins)');
  const nomes = cols.rows.map(c => c.name);
  if (!nomes.includes('perfil')) {
    await db.execute("ALTER TABLE admins ADD COLUMN perfil TEXT NOT NULL DEFAULT 'admin'");
  }
  if (!nomes.includes('ativo')) {
    await db.execute('ALTER TABLE admins ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1');
  }
}

const PERFIS = ['admin', 'secretaria'];
const USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;

function usuarioPublico(u) {
  return {
    id: Number(u.id),
    username: u.username,
    nome: u.nome,
    perfil: u.perfil || 'admin',
    ativo: Number(u.ativo) === 1,
    created_at: u.created_at,
  };
}

async function contarAdminsAtivos(excetoId) {
  const r = await db.execute({
    sql: "SELECT COUNT(*) AS c FROM admins WHERE perfil = 'admin' AND ativo = 1 AND id != ?",
    args: [excetoId || 0],
  });
  return Number(r.rows[0].c);
}

async function garantirAdmin() {
  const r = await db.execute('SELECT COUNT(*) AS c FROM admins');
  if (Number(r.rows[0].c) > 0) return;
  const senha = crypto.randomBytes(6).toString('base64url');
  const hash = bcrypt.hashSync(senha, 12);
  await db.execute({
    sql: 'INSERT INTO admins (username, password_hash, nome) VALUES (?, ?, ?)',
    args: ['admin', hash, 'Administrador(a)'],
  });
  const msg = `ILTECN › Gestão Sindical — AGENDAMENTO DO ESPAÇO DE LAZER
CREDENCIAIS INICIAIS DO ADMINISTRADOR
========================================
Usuário: admin
Senha:   ${senha}

IMPORTANTE: guarde essa senha em local seguro. Ela também fica salva
no próprio banco de dados (Turso) — se perder este arquivo, peça ao
desenvolvedor para redefinir a senha do usuário "admin".
Gerado em: ${new Date().toLocaleString('pt-BR')}
`;
  try { fs.writeFileSync(path.join(__dirname, 'SENHA-INICIAL-ADMIN.txt'), msg, 'utf-8'); } catch (e) { /* Render free tier: ok se não conseguir gravar em disco */ }
  console.log('========================================================');
  console.log(' Conta admin criada. Usuário: admin  |  Senha: ' + senha);
  console.log(' ANOTE ESSA SENHA AGORA — pode não aparecer de novo se o');
  console.log(' arquivo local não puder ser salvo neste ambiente.');
  console.log('========================================================');
}

async function getOrCreateSessionSecret() {
  const r = await db.execute({ sql: 'SELECT valor FROM config WHERE chave = ?', args: ['session_secret'] });
  if (r.rows.length) return r.rows[0].valor;
  const secret = crypto.randomBytes(32).toString('hex');
  await db.execute({ sql: 'INSERT INTO config (chave, valor) VALUES (?, ?)', args: ['session_secret', secret] });
  return secret;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
async function start() {
  await migrar();
  await garantirAdmin();
  const sessionSecret = await getOrCreateSessionSecret();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // necessário no Render (fica atrás de um proxy) para cookies "secure" funcionarem
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    secret: sessionSecret,
    name: 'agendamento.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12,
    },
  }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Proteção simples contra força bruta no login
  const loginAttempts = new Map();
  function isBlocked(key) {
    const rec = loginAttempts.get(key);
    return !!(rec && rec.blockedUntil && Date.now() < rec.blockedUntil);
  }
  function registerFailure(key) {
    const rec = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= 5) { rec.blockedUntil = Date.now() + 5 * 60 * 1000; rec.count = 0; }
    loginAttempts.set(key, rec);
  }

  // Confere a cada acesso se o usuário ainda existe e está ativo — assim, quem for
  // desativado ou excluído perde o acesso na hora, mesmo já estando logado.
  async function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(401).json({ error: 'Não autenticado.' });
    try {
      const r = await db.execute({ sql: 'SELECT * FROM admins WHERE id = ?', args: [req.session.admin.id] });
      const u = r.rows[0];
      if (!u || Number(u.ativo) !== 1) {
        return req.session.destroy(() => res.status(401).json({ error: 'Acesso encerrado. Fale com o administrador.' }));
      }
      req.session.admin = { id: Number(u.id), username: u.username, nome: u.nome, perfil: u.perfil || 'admin' };
      next();
    } catch (e) { next(e); }
  }

  function requireGestor(req, res, next) {
    if (req.session.admin.perfil !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem gerenciar usuários.' });
    next();
  }

  // Proteção simples contra spam no formulário público (por IP)
  const pedidosPorIp = new Map();
  function rateLimitPublico(req, res, next) {
    const ip = req.ip || 'ip';
    const agora = Date.now();
    const registros = (pedidosPorIp.get(ip) || []).filter(t => agora - t < 60 * 60 * 1000);
    if (registros.length >= 8) {
      return res.status(429).json({ error: 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.' });
    }
    registros.push(agora);
    pedidosPorIp.set(ip, registros);
    next();
  }

  // --- Auth ---
  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Informe usuário e senha.' });
    const key = (req.ip || 'ip') + ':' + String(username).toLowerCase();
    if (isBlocked(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });

    const r = await db.execute({ sql: 'SELECT * FROM admins WHERE username = ?', args: [String(username).toLowerCase().trim()] });
    const user = r.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      registerFailure(key);
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    if (Number(user.ativo) !== 1) {
      return res.status(403).json({ error: 'Este usuário está desativado. Fale com o administrador.' });
    }
    loginAttempts.delete(key);
    req.session.admin = { id: Number(user.id), username: user.username, nome: user.nome, perfil: user.perfil || 'admin' };
    res.json({ admin: req.session.admin });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => { res.clearCookie('agendamento.sid'); res.json({ ok: true }); });
  });

  app.get('/api/me', requireAdmin, (req, res) => res.json({ admin: req.session.admin }));

  app.post('/api/me/senha', requireAdmin, async (req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    if (!novaSenha || String(novaSenha).length < 6) return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
    const r = await db.execute({ sql: 'SELECT * FROM admins WHERE id = ?', args: [req.session.admin.id] });
    const user = r.rows[0];
    if (!user || !bcrypt.compareSync(senhaAtual || '', user.password_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const hash = bcrypt.hashSync(novaSenha, 12);
    await db.execute({ sql: 'UPDATE admins SET password_hash = ? WHERE id = ?', args: [hash, user.id] });
    res.json({ ok: true });
  });

  // --- Usuários do painel (só perfil "admin") ---
  app.get('/api/usuarios', requireAdmin, requireGestor, async (req, res) => {
    const r = await db.execute('SELECT * FROM admins ORDER BY ativo DESC, nome COLLATE NOCASE');
    res.json({ usuarios: r.rows.map(usuarioPublico) });
  });

  app.post('/api/usuarios', requireAdmin, requireGestor, async (req, res) => {
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    const username = String(b.username || '').toLowerCase().trim();
    const senha = String(b.senha || '');
    const perfil = PERFIS.includes(b.perfil) ? b.perfil : 'secretaria';
    const errors = {};
    if (!nome) errors.nome = 'Informe o nome.';
    if (!USERNAME_REGEX.test(username)) errors.username = 'Use de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _. Sem espaços.';
    if (senha.length < 6) errors.senha = 'A senha deve ter ao menos 6 caracteres.';
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const existe = await db.execute({ sql: 'SELECT id FROM admins WHERE username = ?', args: [username] });
    if (existe.rows.length) return res.status(409).json({ errors: { username: 'Já existe um usuário com esse login.' } });

    await db.execute({
      sql: 'INSERT INTO admins (username, password_hash, nome, perfil, ativo) VALUES (?, ?, ?, ?, 1)',
      args: [username, bcrypt.hashSync(senha, 12), nome, perfil],
    });
    res.status(201).json({ ok: true });
  });

  app.put('/api/usuarios/:id', requireAdmin, requireGestor, async (req, res) => {
    const id = Number(req.params.id);
    const r = await db.execute({ sql: 'SELECT * FROM admins WHERE id = ?', args: [id] });
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const b = req.body || {};
    const nome = b.nome !== undefined ? String(b.nome).trim() : u.nome;
    const perfil = b.perfil !== undefined ? b.perfil : (u.perfil || 'admin');
    const ativo = b.ativo !== undefined ? (b.ativo ? 1 : 0) : Number(u.ativo);
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' });
    if (!PERFIS.includes(perfil)) return res.status(400).json({ error: 'Perfil inválido.' });

    const ehVoceMesmo = id === req.session.admin.id;
    if (ehVoceMesmo && (ativo !== 1 || perfil !== 'admin')) {
      return res.status(400).json({ error: 'Você não pode desativar nem rebaixar a sua própria conta.' });
    }
    const deixaDeSerAdminAtivo = (u.perfil || 'admin') === 'admin' && Number(u.ativo) === 1 && (perfil !== 'admin' || ativo !== 1);
    if (deixaDeSerAdminAtivo && (await contarAdminsAtivos(id)) === 0) {
      return res.status(400).json({ error: 'É preciso manter pelo menos um administrador ativo.' });
    }

    await db.execute({ sql: 'UPDATE admins SET nome = ?, perfil = ?, ativo = ? WHERE id = ?', args: [nome, perfil, ativo, id] });
    res.json({ ok: true });
  });

  app.post('/api/usuarios/:id/senha', requireAdmin, requireGestor, async (req, res) => {
    const id = Number(req.params.id);
    const novaSenha = String((req.body || {}).novaSenha || '');
    if (novaSenha.length < 6) return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
    const r = await db.execute({ sql: 'UPDATE admins SET password_hash = ? WHERE id = ?', args: [bcrypt.hashSync(novaSenha, 12), id] });
    if (!r.rowsAffected) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  });

  app.delete('/api/usuarios/:id', requireAdmin, requireGestor, async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.session.admin.id) return res.status(400).json({ error: 'Você não pode excluir a sua própria conta.' });
    const r = await db.execute({ sql: 'SELECT * FROM admins WHERE id = ?', args: [id] });
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if ((u.perfil || 'admin') === 'admin' && Number(u.ativo) === 1 && (await contarAdminsAtivos(id)) === 0) {
      return res.status(400).json({ error: 'É preciso manter pelo menos um administrador ativo.' });
    }
    await db.execute({ sql: 'DELETE FROM admins WHERE id = ?', args: [id] });
    res.json({ ok: true });
  });

  // --- Público: calendário de datas já confirmadas (para evitar pedir data ocupada) ---
  app.get('/api/calendario', async (req, res) => {
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const r = await db.execute({
      sql: "SELECT data, finalidade FROM solicitacoes WHERE status = 'confirmado' AND substr(data,1,4) = ?",
      args: [String(ano)],
    });
    res.json({ ano, confirmadas: r.rows });
  });

  // --- Público: criar solicitação ---
  app.post('/api/solicitacoes', rateLimitPublico, async (req, res) => {
    const body = req.body || {};
    const errors = {};
    const dataRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!body.nome || !String(body.nome).trim()) errors.nome = 'Informe seu nome.';
    if (!body.data || !dataRegex.test(body.data)) errors.data = 'Informe uma data válida.';
    if (!body.finalidade || !String(body.finalidade).trim()) errors.finalidade = 'Informe a finalidade da reserva.';
    if (body.data && dataRegex.test(body.data) && body.data < new Date().toISOString().slice(0, 10)) {
      errors.data = 'Não é possível solicitar uma data que já passou.';
    }
    if (Object.keys(errors).length) return res.status(400).json({ errors });

    const conflito = await db.execute({
      sql: "SELECT id FROM solicitacoes WHERE data = ? AND status = 'confirmado'",
      args: [body.data],
    });
    if (conflito.rows.length) return res.status(409).json({ errors: { data: 'Essa data já está reservada e confirmada.' } });

    await db.execute({
      sql: `INSERT INTO solicitacoes (nome, matricula, telefone, data, finalidade, observacoes, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pendente')`,
      args: [String(body.nome).trim(), body.matricula || '', body.telefone || '', body.data, String(body.finalidade).trim(), body.observacoes || ''],
    });

    const [ano2, mes2, dia2] = body.data.split('-');
    avisarSecretariaWhatsApp(
      `📅 Novo pedido de agendamento — ${NOME_ASSOCIACAO}\n\n` +
      `Nome: ${String(body.nome).trim()}\n` +
      `Data: ${dia2}/${mes2}/${ano2}\n` +
      `Finalidade: ${String(body.finalidade).trim()}\n` +
      `Telefone: ${body.telefone || 'não informado'}\n\n` +
      `Acesse o painel para aprovar ou recusar.`
    );

    res.status(201).json({ ok: true });
  });

  // --- Admin: listar / aprovar / recusar / excluir ---
  app.get('/api/solicitacoes', requireAdmin, async (req, res) => {
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const status = req.query.status || 'todos';
    let sql = 'SELECT * FROM solicitacoes WHERE substr(data,1,4) = ?';
    const args = [String(ano)];
    if (status !== 'todos') { sql += ' AND status = ?'; args.push(status); }
    sql += ' ORDER BY data';
    const r = await db.execute({ sql, args });
    res.json({ ano, status, solicitacoes: r.rows });
  });

  app.put('/api/solicitacoes/:id/status', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db.execute({ sql: 'SELECT * FROM solicitacoes WHERE id = ?', args: [id] });
    if (!existing.rows.length) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const row = existing.rows[0];

    const novoStatus = (req.body || {}).status;
    if (!['confirmado', 'recusado', 'pendente'].includes(novoStatus)) return res.status(400).json({ error: 'Status inválido.' });

    if (novoStatus === 'confirmado') {
      const conflito = await db.execute({
        sql: "SELECT id FROM solicitacoes WHERE data = ? AND status = 'confirmado' AND id != ?",
        args: [row.data, id],
      });
      if (conflito.rows.length) return res.status(409).json({ error: 'Já existe outra reserva confirmada para essa data.' });
    }

    const motivoRecusa = novoStatus === 'recusado' ? ((req.body || {}).motivoRecusa || '') : null;
    await db.execute({
      sql: 'UPDATE solicitacoes SET status = ?, aprovado_por = ?, aprovado_em = ?, motivo_recusa = ? WHERE id = ?',
      args: [novoStatus, req.session.admin.nome, new Date().toISOString(), motivoRecusa, id],
    });
    const updated = await db.execute({ sql: 'SELECT * FROM solicitacoes WHERE id = ?', args: [id] });
    res.json({ solicitacao: updated.rows[0] });
  });

  app.delete('/api/solicitacoes/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    await db.execute({ sql: 'DELETE FROM solicitacoes WHERE id = ?', args: [id] });
    res.json({ ok: true });
  });

  app.get('/api/config', (req, res) => {
    res.json({ nomeAssociacao: NOME_ASSOCIACAO });
  });

  // --- Estático ---
  const PUBLIC_DIR = path.join(__dirname, 'public');
  app.use(express.static(PUBLIC_DIR));
  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.get('/ajuda', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'ajuda.html')));
  app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  app.listen(PORT, () => {
    console.log('');
    console.log('========================================================');
    console.log(' ILTECN › Gestão Sindical — Agendamento do Espaço de Lazer');
    console.log(` Rodando em: http://localhost:${PORT}`);
    console.log(` Página pública:  http://localhost:${PORT}/`);
    console.log(` Painel do admin: http://localhost:${PORT}/admin`);
    console.log(` Banco de dados: ${DB_URL.startsWith('file:') ? 'arquivo local (' + DB_URL + ')' : 'Turso (remoto)'}`);
    console.log('========================================================');
  });
}

start().catch((e) => {
  console.error('Erro ao iniciar o servidor:', e);
  process.exit(1);
});
