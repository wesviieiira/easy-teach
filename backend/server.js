require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, queryAll, queryOne, runSql, countSql } = require('./database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// ── Ensure uploads dir exists ────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Middleware ────────────────────────────────────────────
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);
        const allowed = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://localhost:5500'
        ].filter(Boolean);
        // If no FRONTEND_URL set, allow all
        if (allowed.length <= 2 || allowed.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Serve frontend only in development
if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(path.join(__dirname, '..', 'frontend')));
}

// ── Email transporter ────────────────────────────────────
let emailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
}

// ── Multer config for file uploads ───────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.mp4', '.webm', '.png', '.jpg', '.jpeg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Tipo de arquivo não permitido'));
    }
});

// ── Auth Middleware ───────────────────────────────────────
function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    try {
        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Token inválido' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Acesso restrito a administradores' });
    }
    next();
}

// ═════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═════════════════════════════════════════════════════════

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Nome, email e senha são obrigatórios' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' });
        }

        const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email já cadastrado' });
        }

        const hash = bcrypt.hashSync(password, 10);
        const result = await runSql(
            'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
            [name.trim(), email.toLowerCase().trim(), hash, 'student']
        );

        const token = jwt.sign(
            { id: result.lastInsertRowid, email: email.toLowerCase(), role: 'student', name: name.trim() },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({ success: true, data: { token, user: { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), role: 'student' } } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
        }

        const user = await queryOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (!user) {
            return res.status(401).json({ success: false, error: 'Email ou senha incorretos' });
        }
        if (!user.active) {
            return res.status(403).json({ success: false, error: 'Conta desativada. Contate o suporte.' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Email ou senha incorretos' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            data: {
                token,
                user: { id: user.id, name: user.name, email: user.email, role: user.role, paid: user.paid, avatar_url: user.avatar_url, age: user.age }
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ═════════════════════════════════════════════════════════
//  PASSWORD RECOVERY
// ═════════════════════════════════════════════════════════

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email é obrigatório' });

        const user = await queryOne('SELECT id, name, email FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (!user) return res.json({ success: true, data: { message: 'Se o email estiver cadastrado, você receberá as instruções.' } });

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        await runSql('UPDATE password_resets SET used = 1 WHERE user_id = $1 AND used = 0', [user.id]);
        await runSql('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, token, expiresAt]);

        // Use FRONTEND_URL for reset link in production
        const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${frontendBase}/login.html?reset_token=${token}`;

        if (emailTransporter) {
            emailTransporter.sendMail({
                from: process.env.SMTP_FROM || 'Easy Teach <noreply@easyteach.com>',
                to: user.email,
                subject: 'Easy Teach — Recuperação de senha',
                html: `<h2>Olá, ${user.name}!</h2><p>Clique no link abaixo para redefinir sua senha:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Este link expira em 1 hora.</p>`
            }).catch(err => console.error('Email send error:', err));
        } else {
            console.log(`\n📧 Password reset link for ${user.email}:\n   ${resetUrl}\n`);
        }

        res.json({ success: true, data: { message: 'Se o email estiver cadastrado, você receberá as instruções.' } });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ success: false, error: 'Token e nova senha são obrigatórios' });
        if (password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' });

        const reset = await queryOne(
            'SELECT * FROM password_resets WHERE token = $1 AND used = 0 AND expires_at > NOW()',
            [token]
        );
        if (!reset) return res.status(400).json({ success: false, error: 'Link expirado ou inválido. Solicite um novo.' });

        const hash = bcrypt.hashSync(password, 10);
        await runSql('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, reset.user_id]);
        await runSql('UPDATE password_resets SET used = 1 WHERE id = $1', [reset.id]);

        res.json({ success: true, data: { message: 'Senha redefinida com sucesso!' } });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
});

// ═════════════════════════════════════════════════════════
//  STUDENT PROFILE
// ═════════════════════════════════════════════════════════

app.get('/api/profile', authMiddleware, async (req, res) => {
    try {
        const user = await queryOne('SELECT id, name, email, role, avatar_url, age, created_at FROM users WHERE id = $1', [req.user.id]);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Profile GET error:', err);
        res.status(500).json({ success: false, error: 'Erro ao carregar perfil' });
    }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        const { name, age } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });

        const ageVal = age !== undefined && age !== '' ? parseInt(age) : null;
        await runSql('UPDATE users SET name = $1, age = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [name.trim(), ageVal, req.user.id]);

        res.json({ success: true, data: { message: 'Perfil atualizado!', name: name.trim(), age: ageVal } });
    } catch (err) {
        console.error('Profile PUT error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar perfil' });
    }
});

app.put('/api/profile/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Senhas são obrigatórias' });
        if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Nova senha deve ter no mínimo 6 caracteres' });

        const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
        }

        const hash = bcrypt.hashSync(newPassword, 10);
        await runSql('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [hash, req.user.id]);

        res.json({ success: true, data: { message: 'Senha alterada com sucesso!' } });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar senha' });
    }
});

app.post('/api/profile/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada' });

        const avatarUrl = `/uploads/${req.file.filename}`;
        await runSql('UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [avatarUrl, req.user.id]);

        res.json({ success: true, data: { avatar_url: avatarUrl } });
    } catch (err) {
        console.error('Avatar upload error:', err);
        res.status(500).json({ success: false, error: 'Erro ao enviar imagem' });
    }
});

// ═════════════════════════════════════════════════════════
//  STUDENT ROUTES
// ═════════════════════════════════════════════════════════

app.get('/api/modules', authMiddleware, async (req, res) => {
    try {
        const modules = await queryAll('SELECT * FROM modules WHERE active = 1 ORDER BY order_index ASC');

        const result = [];
        for (const mod of modules) {
            const lessons = await queryAll(
                'SELECT * FROM lessons WHERE module_id = $1 AND active = 1 ORDER BY order_index ASC',
                [mod.id]
            );

            const lessonsWithProgress = [];
            for (const lesson of lessons) {
                const progress = await queryOne(
                    'SELECT lesson_id, completed FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
                    [req.user.id, lesson.id]
                );
                lessonsWithProgress.push({ ...lesson, completed: progress ? progress.completed : 0 });
            }

            result.push({ ...mod, lessons: lessonsWithProgress });
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('Modules error:', err);
        res.status(500).json({ success: false, error: 'Erro ao carregar módulos' });
    }
});

app.get('/api/progress', authMiddleware, async (req, res) => {
    try {
        const totalResult = await countSql('SELECT COUNT(*) as total FROM lessons WHERE active = 1');
        const completedResult = await countSql(
            'SELECT COUNT(*) as completed FROM user_progress WHERE user_id = $1 AND completed = 1',
            [req.user.id]
        );

        const total = parseInt(totalResult.total) || 0;
        const completed = parseInt(completedResult.completed) || 0;

        res.json({
            success: true,
            data: {
                total,
                completed,
                percentage: total > 0 ? Math.round((completed / total) * 100) : 0
            }
        });
    } catch (err) {
        console.error('Progress error:', err);
        res.status(500).json({ success: false, error: 'Erro ao carregar progresso' });
    }
});

app.post('/api/progress', authMiddleware, async (req, res) => {
    try {
        const { lesson_id, completed } = req.body;
        if (lesson_id === undefined) {
            return res.status(400).json({ success: false, error: 'lesson_id é obrigatório' });
        }

        const existing = await queryOne(
            'SELECT id FROM user_progress WHERE user_id = $1 AND lesson_id = $2',
            [req.user.id, lesson_id]
        );

        if (existing) {
            await runSql(
                'UPDATE user_progress SET completed = $1, completed_at = CASE WHEN $2 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE user_id = $3 AND lesson_id = $4',
                [completed ? 1 : 0, completed ? 1 : 0, req.user.id, lesson_id]
            );
        } else {
            await runSql(
                'INSERT INTO user_progress (user_id, lesson_id, completed, completed_at) VALUES ($1, $2, $3, CASE WHEN $4 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)',
                [req.user.id, lesson_id, completed ? 1 : 0, completed ? 1 : 0]
            );
        }

        res.json({ success: true, message: 'Progresso atualizado' });
    } catch (err) {
        console.error('Progress update error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar progresso' });
    }
});

// ═════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═════════════════════════════════════════════════════════

// Admin: list all comments grouped by lesson
app.get('/api/admin/comments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const lessons = await queryAll(`
            SELECT l.id, l.title, m.title as module_title,
                   (SELECT COUNT(*) FROM comments WHERE lesson_id = l.id) as comment_count
            FROM lessons l
            JOIN modules m ON l.module_id = m.id
            ORDER BY m.order_index ASC, l.order_index ASC
        `);

        const result = [];
        for (const l of lessons.filter(l => parseInt(l.comment_count) > 0)) {
            const comments = await queryAll(`
                SELECT c.id, c.content, c.created_at, c.user_id, u.name as user_name, u.avatar_url
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.lesson_id = $1
                ORDER BY c.created_at DESC
            `, [l.id]);
            result.push({ ...l, comments });
        }

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('Admin comments error:', err);
        res.status(500).json({ success: false, error: 'Erro ao listar comentários' });
    }
});

app.get('/api/admin/modules', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const modules = await queryAll('SELECT * FROM modules ORDER BY order_index ASC');
        const result = [];
        for (const m of modules) {
            const lessons = await queryAll('SELECT * FROM lessons WHERE module_id = $1 ORDER BY order_index ASC', [m.id]);
            result.push({ ...m, lessons });
        }
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao listar módulos' });
    }
});

app.post('/api/admin/modules', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { title, description, icon, order_index } = req.body;
        if (!title) return res.status(400).json({ success: false, error: 'Título é obrigatório' });

        const result = await runSql(
            'INSERT INTO modules (title, description, icon, order_index) VALUES ($1, $2, $3, $4)',
            [title, description || '', icon || '📘', order_index || 0]
        );

        res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao criar módulo' });
    }
});

app.put('/api/admin/modules/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { title, description, icon, order_index, active } = req.body;
        const current = await queryOne('SELECT * FROM modules WHERE id = $1', [req.params.id]);
        if (!current) return res.status(404).json({ success: false, error: 'Módulo não encontrado' });

        await runSql(
            'UPDATE modules SET title = $1, description = $2, icon = $3, order_index = $4, active = $5 WHERE id = $6',
            [
                title !== undefined ? title : current.title,
                description !== undefined ? description : current.description,
                icon !== undefined ? icon : current.icon,
                order_index !== undefined ? order_index : current.order_index,
                active !== undefined ? active : current.active,
                req.params.id
            ]
        );
        res.json({ success: true, message: 'Módulo atualizado' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao atualizar módulo' });
    }
});

app.delete('/api/admin/modules/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await runSql('DELETE FROM lessons WHERE module_id = $1', [req.params.id]);
        await runSql('DELETE FROM modules WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Módulo removido' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao remover módulo' });
    }
});

app.get('/api/admin/lessons/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const lesson = await queryOne('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
        if (!lesson) return res.status(404).json({ success: false, error: 'Aula não encontrada' });
        res.json({ success: true, data: lesson });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao carregar aula' });
    }
});

app.post('/api/admin/lessons', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { module_id, title, type, content_url, pdf_url, duration, order_index, summary } = req.body;
        if (!module_id || !title) {
            return res.status(400).json({ success: false, error: 'module_id e title são obrigatórios' });
        }

        const result = await runSql(
            'INSERT INTO lessons (module_id, title, type, content_url, pdf_url, duration, order_index, summary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [module_id, title, type || 'video', content_url || '', pdf_url || '', duration || 0, order_index || 0, summary || '']
        );

        res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao criar aula' });
    }
});

app.put('/api/admin/lessons/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { title, type, content_url, pdf_url, duration, order_index, active, summary } = req.body;
        const current = await queryOne('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
        if (!current) return res.status(404).json({ success: false, error: 'Aula não encontrada' });

        await runSql(
            'UPDATE lessons SET title = $1, type = $2, content_url = $3, pdf_url = $4, duration = $5, order_index = $6, active = $7, summary = $8 WHERE id = $9',
            [
                title !== undefined ? title : current.title,
                type !== undefined ? type : current.type,
                content_url !== undefined ? content_url : current.content_url,
                pdf_url !== undefined ? pdf_url : current.pdf_url,
                duration !== undefined ? duration : current.duration,
                order_index !== undefined ? order_index : current.order_index,
                active !== undefined ? active : current.active,
                summary !== undefined ? summary : current.summary,
                req.params.id
            ]
        );
        res.json({ success: true, message: 'Aula atualizada' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao atualizar aula' });
    }
});

app.delete('/api/admin/lessons/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await runSql('DELETE FROM lessons WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Aula removida' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao remover aula' });
    }
});

app.get('/api/admin/students', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const students = await queryAll(
            "SELECT id, name, email, active, paid, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC"
        );

        const totalResult = await countSql('SELECT COUNT(*) as total FROM lessons WHERE active = 1');
        const totalLessons = parseInt(totalResult.total) || 0;

        const result = [];
        for (const s of students) {
            const completedResult = await countSql(
                'SELECT COUNT(*) as count FROM user_progress WHERE user_id = $1 AND completed = 1',
                [s.id]
            );
            const completed = parseInt(completedResult.count) || 0;
            result.push({ ...s, completed_lessons: completed, total_lessons: totalLessons });
        }

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao listar alunos' });
    }
});

app.put('/api/admin/students/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { active, paid } = req.body;
        const current = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (!current) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

        await runSql(
            'UPDATE users SET active = $1, paid = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [
                active !== undefined ? active : current.active,
                paid !== undefined ? paid : current.paid,
                req.params.id
            ]
        );
        res.json({ success: true, message: 'Aluno atualizado' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao atualizar aluno' });
    }
});

app.post('/api/admin/upload', authMiddleware, adminMiddleware, upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, data: { url: fileUrl, filename: req.file.originalname } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro no upload' });
    }
});

// ═════════════════════════════════════════════════════════
//  PAYMENT ROUTES (Mercado Pago)
// ═════════════════════════════════════════════════════════

app.post('/api/payment/create', async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email é obrigatório' });
        }

        if (process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.startsWith('TEST-0000')) {
            const { MercadoPagoConfig, Preference } = require('mercadopago');
            const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
            const preference = new Preference(client);

            const frontendBase = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
            const result = await preference.create({
                body: {
                    items: [{
                        title: 'Easy Teach - Curso Completo de Inglês',
                        quantity: 1,
                        unit_price: 197.00,
                        currency_id: 'BRL'
                    }],
                    payer: { email, name: name || '' },
                    back_urls: {
                        success: `${frontendBase}/login.html?payment=success`,
                        failure: `${frontendBase}/index.html?payment=failure`,
                        pending: `${frontendBase}/index.html?payment=pending`
                    },
                    auto_return: 'approved',
                    notification_url: `${process.env.BACKEND_URL || `http://localhost:${PORT}`}/api/payment/webhook`
                }
            });

            await runSql(
                'INSERT INTO payments (email, mp_preference_id, status, amount) VALUES ($1, $2, $3, $4)',
                [email, result.id, 'pending', 197.00]
            );

            return res.json({ success: true, data: { checkout_url: result.init_point, preference_id: result.id } });
        }

        res.json({
            success: true,
            data: {
                checkout_url: null,
                sandbox: true,
                message: 'Mercado Pago não configurado. Configure MP_ACCESS_TOKEN no .env para ativar pagamentos reais.'
            }
        });
    } catch (err) {
        console.error('Payment creation error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar pagamento' });
    }
});

app.post('/api/payment/webhook', (req, res) => {
    try {
        const { type, data } = req.body;
        if (type === 'payment') {
            console.log('📩 Payment webhook received:', data?.id);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err);
        res.sendStatus(500);
    }
});

// ══════════════════════════════════════════════════════════
// COMMENTS
// ══════════════════════════════════════════════════════════

app.get('/api/lessons/:lessonId/comments', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const totalResult = await countSql(
            'SELECT COUNT(*) as count FROM comments WHERE lesson_id = $1',
            [req.params.lessonId]
        );
        const total = parseInt(totalResult.count) || 0;

        const comments = await queryAll(
            `SELECT c.id, c.content, c.created_at, c.user_id, u.name as user_name, u.avatar_url
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.lesson_id = $1
             ORDER BY c.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.lessonId, limit, offset]
        );
        res.json({ success: true, data: { comments, total, page, totalPages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('Comments GET error:', err);
        res.status(500).json({ success: false, error: 'Erro ao carregar comentários' });
    }
});

app.post('/api/lessons/:lessonId/comments', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Comentário não pode ser vazio' });
        }
        await runSql(
            'INSERT INTO comments (lesson_id, user_id, content) VALUES ($1, $2, $3)',
            [req.params.lessonId, req.user.id, content.trim()]
        );
        res.json({ success: true, data: { message: 'Comentário adicionado' } });
    } catch (err) {
        console.error('Comments POST error:', err);
        res.status(500).json({ success: false, error: 'Erro ao adicionar comentário' });
    }
});

app.delete('/api/comments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const comment = await queryOne('SELECT * FROM comments WHERE id = $1', [req.params.id]);
        if (!comment) return res.status(404).json({ success: false, error: 'Comentário não encontrado' });

        await runSql('DELETE FROM comments WHERE id = $1', [req.params.id]);
        res.json({ success: true, data: { message: 'Comentário removido' } });
    } catch (err) {
        console.error('Comments DELETE error:', err);
        res.status(500).json({ success: false, error: 'Erro ao remover comentário' });
    }
});

// ── Serve frontend SPA (dev only) ────────────────────────
if (process.env.NODE_ENV !== 'production') {
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
    });
}

// ── Error handler ────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    }
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
});

// ── Start ────────────────────────────────────────────────
async function start() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`\n🚀 Easy Teach server running at http://localhost:${PORT}`);
        console.log(`📚 Admin: admin@easyteach.com / admin123`);
        console.log(`👨‍🎓 Aluno: aluno@easyteach.com / aluno123\n`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
