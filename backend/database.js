const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// ── Connection Pool ─────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // ── Users ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('admin', 'student')),
        avatar_url TEXT,
        age INTEGER,
        active INTEGER NOT NULL DEFAULT 1,
        paid INTEGER NOT NULL DEFAULT 0,
        mp_payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Modules ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        icon TEXT DEFAULT '📘',
        order_index INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Lessons ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'video' CHECK(type IN ('video', 'pdf', 'text', 'quiz')),
        content_url TEXT,
        pdf_url TEXT,
        summary TEXT,
        duration INTEGER DEFAULT 0,
        order_index INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── User Progress ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, lesson_id)
      )
    `);

    // ── Payments ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL,
        mp_payment_id TEXT,
        mp_preference_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'refunded')),
        amount REAL NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Comments ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Password Resets ───────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Seed Data ──────────────────────────────────────────
    await seedDatabase(client);
  } finally {
    client.release();
  }
}

async function seedDatabase(client) {
  const check = await client.query("SELECT id FROM users WHERE email = 'admin@easyteach.com'");
  if (check.rows.length > 0) return; // Already seeded

  // Admin user
  const adminHash = bcrypt.hashSync('admin123', 10);
  await client.query(
    "INSERT INTO users (name, email, password_hash, role, paid) VALUES ($1, $2, $3, 'admin', 1)",
    ['Administrador', 'admin@easyteach.com', adminHash]
  );

  // Demo student
  const studentHash = bcrypt.hashSync('aluno123', 10);
  await client.query(
    "INSERT INTO users (name, email, password_hash, role, paid) VALUES ($1, $2, $3, 'student', 1)",
    ['Aluno Demo', 'aluno@easyteach.com', studentHash]
  );

  // Seed modules (8 modules)
  const moduleData = [
    { title: 'Fundamentos do Espelhamento', desc: 'Entenda como o inglês se conecta ao português', icon: '🪞', order: 1 },
    { title: 'Sons e Pronúncia Espelhada', desc: 'Aprenda a pronunciar usando referências do português', icon: '🗣️', order: 2 },
    { title: 'Estruturas Básicas', desc: 'Formação de frases simples pelo método espelhado', icon: '🧱', order: 3 },
    { title: 'Vocabulário do Dia a Dia', desc: 'Palavras essenciais com conexões ao português', icon: '📝', order: 4 },
    { title: 'Conversação Guiada', desc: 'Diálogos práticos com tradução espelhada', icon: '💬', order: 5 },
    { title: 'Leitura e Interpretação', desc: 'Textos simples com técnica de espelhamento', icon: '📖', order: 6 },
    { title: 'Escrita Prática', desc: 'Escreva em inglês pensando em português', icon: '✍️', order: 7 },
    { title: 'Fluência e Autonomia', desc: 'Consolide tudo e ganhe independência', icon: '🚀', order: 8 },
  ];

  for (const mod of moduleData) {
    const modResult = await client.query(
      'INSERT INTO modules (title, description, icon, order_index) VALUES ($1, $2, $3, $4) RETURNING id',
      [mod.title, mod.desc, mod.icon, mod.order]
    );
    const moduleId = modResult.rows[0].id;

    // 4 example sub-lessons per module
    for (let i = 1; i <= 4; i++) {
      const isVideo = i !== 4;
      const type = isVideo ? 'video' : 'pdf';
      const content = isVideo ? 'https://www.youtube.com/embed/dQw4w9WgXcQ' : '';
      const summary = isVideo
        ? "### Resumo da Aula\n\nNesta aula, abordamos os conceitos centrais para você não precisar decorar regras.\n\n* **Ponto Principal:** O foco é entender a lógica.\n* Aplicação prática usando frases do seu dia a dia.\n* Evite pensar a gramática pela gramática; pense de forma contextual."
        : "";

      await client.query(
        'INSERT INTO lessons (module_id, title, type, content_url, summary, order_index) VALUES ($1, $2, $3, $4, $5, $6)',
        [moduleId, `${mod.title} — Aula ${i}`, type, content, summary, i]
      );
    }
  }
}

// ── Helper functions (same interface as before) ───────────
async function queryAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

async function runSql(sql, params = []) {
  const result = await pool.query(sql + (sql.trim().toUpperCase().startsWith('INSERT') && !sql.includes('RETURNING') ? ' RETURNING id' : ''), params);
  return { lastInsertRowid: result.rows[0]?.id || null };
}

async function countSql(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || {};
}

module.exports = { pool, initializeDatabase, queryAll, queryOne, runSql, countSql };
