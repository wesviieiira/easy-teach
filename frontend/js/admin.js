/* ══════════════════════════════════════════════════════════
   EASY TEACH — Admin Panel (admin.js)
   Module/Lesson CRUD, student management, stats
   ══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    if (!EasyTeach.requireAuth('admin')) return;

    let deleteCallback = null;

    // ── Tab switching ────────────────────────────────────────
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
        });
    });

    // ── Load all data ────────────────────────────────────────
    async function loadAll() {
        await Promise.all([loadModules(), loadStudents(), loadComments()]);
    }

    // ── Load modules ─────────────────────────────────────────
    async function loadModules() {
        try {
            const modules = await EasyTeach.api('/api/admin/modules');
            renderModules(modules);
            updateModuleSelect(modules);
            updateStats(modules);
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar módulos', 'error');
        }
    }

    function renderModules(modules) {
        const container = document.getElementById('modulesContainer');
        if (modules.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:var(--space-12);color:var(--text-muted);">Nenhum módulo cadastrado.</div>';
            return;
        }

        container.innerHTML = modules.map(mod => `
      <div class="card" style="margin-bottom:var(--space-4);">
        <div style="display:flex;align-items:center;gap:var(--space-4);margin-bottom:var(--space-4);">
          <span style="font-size:1.5rem;">${mod.icon}</span>
          <div style="flex:1;">
            <h3 style="font-family:var(--font-heading);font-size:1.1rem;">${mod.title}</h3>
            <p style="color:var(--text-muted);font-size:0.85rem;">${mod.description || 'Sem descrição'} • Ordem: ${mod.order_index}</p>
          </div>
          <span class="badge ${mod.active ? 'badge-success' : 'badge-error'}">${mod.active ? 'Ativo' : 'Inativo'}</span>
          <button class="btn btn-ghost" onclick="toggleModule(${mod.id}, ${mod.active ? 0 : 1})" style="font-size:0.85rem;">
            ${mod.active ? '⏸️' : '▶️'}
          </button>
          <button class="btn btn-ghost" onclick="confirmDelete('module', ${mod.id}, '${mod.title.replace(/'/g, "\\'")}')" style="font-size:0.85rem;color:var(--error);">🗑️</button>
        </div>
        ${mod.lessons.length > 0 ? `
          <table class="admin-table" style="margin-top:0;">
            <thead>
              <tr>
                <th>Aula</th>
                <th>Tipo</th>
                <th>Ordem</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${mod.lessons.map(lesson => `
                <tr>
                  <td>${lesson.title}</td>
                  <td><span class="badge badge-info">${lesson.type}</span></td>
                  <td>${lesson.order_index}</td>
                  <td><span class="badge ${lesson.active ? 'badge-success' : 'badge-error'}">${lesson.active ? 'Ativa' : 'Inativa'}</span></td>
                  <td>
                    <button class="btn btn-ghost" onclick="editLesson(${lesson.id})" style="font-size:0.8rem;padding:4px 8px;" title="Editar aula">✏️</button>
                    <button class="btn btn-ghost" onclick="toggleLesson(${lesson.id}, ${lesson.active ? 0 : 1})" style="font-size:0.8rem;padding:4px 8px;">
                      ${lesson.active ? '⏸️' : '▶️'}
                    </button>
                    <button class="btn btn-ghost" onclick="confirmDelete('lesson', ${lesson.id}, '${lesson.title.replace(/'/g, "\\\\\'")}')" style="font-size:0.8rem;padding:4px 8px;color:var(--error);">🗑️</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color:var(--text-muted);font-size:0.9rem;margin-top:var(--space-2);">Nenhuma aula neste módulo.</p>'}
      </div>
    `).join('');
    }

    function updateModuleSelect(modules) {
        const select = document.getElementById('lessonModule');
        select.innerHTML = '<option value="">Selecione um módulo...</option>';
        modules.forEach(mod => {
            select.innerHTML += `<option value="${mod.id}">${mod.icon} ${mod.title}</option>`;
        });
    }

    function updateStats(modules) {
        let totalLessons = 0;
        modules.forEach(m => totalLessons += m.lessons.length);
        document.getElementById('statModules').textContent = modules.length;
        document.getElementById('statLessons').textContent = totalLessons;
    }

    // ── Load students ────────────────────────────────────────
    async function loadStudents() {
        try {
            const students = await EasyTeach.api('/api/admin/students');
            document.getElementById('statStudents').textContent = students.length;
            renderStudents(students);
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar alunos', 'error');
        }
    }

    function renderStudents(students) {
        const tbody = document.getElementById('studentsBody');
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-8);color:var(--text-muted);">Nenhum aluno cadastrado.</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td style="color:var(--text-secondary);">${s.email}</td>
        <td>
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <div class="progress-bar" style="width:80px;height:6px;">
              <div class="progress-bar-fill" style="width:${s.total_lessons > 0 ? Math.round((s.completed_lessons / s.total_lessons) * 100) : 0}%"></div>
            </div>
            <span style="font-size:0.8rem;color:var(--text-muted);">${s.completed_lessons}/${s.total_lessons}</span>
          </div>
        </td>
        <td><span class="badge ${s.active ? 'badge-success' : 'badge-error'}">${s.active ? 'Ativo' : 'Inativo'}</span></td>
        <td><span class="badge ${s.paid ? 'badge-success' : 'badge-warning'}">${s.paid ? 'Pago' : 'Pendente'}</span></td>
        <td>
          <button class="btn btn-ghost" onclick="toggleStudent(${s.id}, 'active', ${s.active ? 0 : 1})" style="font-size:0.8rem;padding:4px 8px;">
            ${s.active ? '🚫' : '✅'}
          </button>
          <button class="btn btn-ghost" onclick="toggleStudent(${s.id}, 'paid', ${s.paid ? 0 : 1})" style="font-size:0.8rem;padding:4px 8px;">
            ${s.paid ? '💰❌' : '💰✅'}
          </button>
        </td>
      </tr>
    `).join('');
    }

    // ── Add Module ───────────────────────────────────────────
    document.getElementById('addModuleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await EasyTeach.api('/api/admin/modules', {
                method: 'POST',
                body: JSON.stringify({
                    title: document.getElementById('moduleTitle').value,
                    description: document.getElementById('moduleDesc').value,
                    icon: document.getElementById('moduleIcon').value || '📘',
                    order_index: parseInt(document.getElementById('moduleOrder').value) || 0
                })
            });
            EasyTeach.showToast('Módulo criado com sucesso!', 'success');
            document.getElementById('addModuleForm').reset();
            document.getElementById('moduleIcon').value = '📘';
            loadModules();
            // Switch to modules tab
            document.querySelector('[data-panel="modules"]').click();
        } catch (err) {
            EasyTeach.showToast(err.message, 'error');
        }
    });

    // ── Add Lesson ───────────────────────────────────────────
    document.getElementById('addLessonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            let pdfUrl = '';

            // Upload PDF if provided
            const pdfFile = document.getElementById('lessonPdf').files[0];
            if (pdfFile) {
                const formData = new FormData();
                formData.append('file', pdfFile);

                const token = EasyTeach.getToken();
                const uploadRes = await fetch(`${EasyTeach.API_URL}/api/admin/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.success) {
                    pdfUrl = uploadData.data.url;
                }
            }

            await EasyTeach.api('/api/admin/lessons', {
                method: 'POST',
                body: JSON.stringify({
                    module_id: parseInt(document.getElementById('lessonModule').value),
                    title: document.getElementById('lessonTitleInput').value,
                    type: document.getElementById('lessonType').value,
                    content_url: document.getElementById('lessonUrl').value,
                    pdf_url: pdfUrl,
                    summary: document.getElementById('lessonSummary').value,
                    order_index: parseInt(document.getElementById('lessonOrder').value) || 0
                })
            });

            EasyTeach.showToast('Aula criada com sucesso!', 'success');
            document.getElementById('addLessonForm').reset();
            loadModules();
            document.querySelector('[data-panel="modules"]').click();
        } catch (err) {
            EasyTeach.showToast(err.message, 'error');
        }
    });

    // ── Toggle type visibility ───────────────────────────────
    document.getElementById('lessonType').addEventListener('change', (e) => {
        const videoGroup = document.getElementById('videoUrlGroup');
        videoGroup.style.display = e.target.value === 'video' ? 'block' : 'none';
    });

    // ── Delete modal ─────────────────────────────────────────
    window.confirmDelete = function (type, id, name) {
        document.getElementById('deleteModalText').textContent = `Tem certeza que deseja remover "${name}"? Esta ação não pode ser desfeita.`;
        document.getElementById('deleteModal').classList.add('show');
        deleteCallback = async () => {
            try {
                const endpoint = type === 'module' ? `/api/admin/modules/${id}` : `/api/admin/lessons/${id}`;
                await EasyTeach.api(endpoint, { method: 'DELETE' });
                EasyTeach.showToast('Item removido com sucesso', 'success');
                loadModules();
            } catch (err) {
                EasyTeach.showToast(err.message, 'error');
            }
        };
    };

    document.getElementById('deleteModalConfirm').addEventListener('click', () => {
        if (deleteCallback) deleteCallback();
        document.getElementById('deleteModal').classList.remove('show');
        deleteCallback = null;
    });

    document.getElementById('deleteModalCancel').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.remove('show');
        deleteCallback = null;
    });

    document.getElementById('deleteModalClose').addEventListener('click', () => {
        document.getElementById('deleteModal').classList.remove('show');
        deleteCallback = null;
    });

    // ── Global toggle functions ──────────────────────────────
    window.toggleModule = async function (id, active) {
        try {
            await EasyTeach.api(`/api/admin/modules/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ active })
            });
            EasyTeach.showToast('Módulo atualizado', 'success');
            loadModules();
        } catch (err) {
            EasyTeach.showToast(err.message, 'error');
        }
    };

    window.toggleLesson = async function (id, active) {
        try {
            await EasyTeach.api(`/api/admin/lessons/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ active })
            });
            EasyTeach.showToast('Aula atualizada', 'success');
            loadModules();
        } catch (err) {
            EasyTeach.showToast(err.message, 'error');
        }
    };

    window.toggleStudent = async function (id, field, value) {
        try {
            await EasyTeach.api(`/api/admin/students/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ [field]: value })
            });
            EasyTeach.showToast('Aluno atualizado', 'success');
            loadStudents();
        } catch (err) {
            EasyTeach.showToast(err.message, 'error');
        }
    };

    // ── Edit Lesson (open modal) ─────────────────────────────
    window.editLesson = async function (id) {
        try {
            const lesson = await EasyTeach.api(`/api/admin/lessons/${id}`);
            document.getElementById('editLessonId').value = lesson.id;
            document.getElementById('editLessonTitle').value = lesson.title || '';
            document.getElementById('editLessonType').value = lesson.type || 'video';
            document.getElementById('editLessonOrder').value = lesson.order_index || 0;
            document.getElementById('editLessonUrl').value = lesson.content_url || '';
            document.getElementById('editLessonSummary').value = lesson.summary || '';
            document.getElementById('editLessonModal').classList.add('show');
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar aula: ' + err.message, 'error');
        }
    };

    // ── Save edited lesson ───────────────────────────────────
    document.getElementById('editLessonForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editLessonId').value;
        try {
            await EasyTeach.api(`/api/admin/lessons/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    title: document.getElementById('editLessonTitle').value,
                    type: document.getElementById('editLessonType').value,
                    content_url: document.getElementById('editLessonUrl').value,
                    order_index: parseInt(document.getElementById('editLessonOrder').value) || 0,
                    summary: document.getElementById('editLessonSummary').value
                })
            });
            EasyTeach.showToast('Aula atualizada com sucesso! ✅', 'success');
            document.getElementById('editLessonModal').classList.remove('show');
            loadModules();
        } catch (err) {
            EasyTeach.showToast('Erro ao salvar: ' + err.message, 'error');
        }
    });

    // ── Edit modal close buttons ─────────────────────────────
    ['editLessonModalClose', 'editLessonCancel'].forEach(btnId => {
        document.getElementById(btnId).addEventListener('click', () => {
            document.getElementById('editLessonModal').classList.remove('show');
        });
    });

    // ── Load comments (admin) ───────────────────────────────
    async function loadComments() {
        try {
            const lessonsWithComments = await EasyTeach.api('/api/admin/comments');
            renderComments(lessonsWithComments);
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar comentários', 'error');
        }
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr + 'Z').getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'agora';
        if (mins < 60) return `${mins}min`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d`;
        return `${Math.floor(days / 30)}m`;
    }

    function renderComments(lessons) {
        const container = document.getElementById('adminCommentsContainer');
        if (!lessons || lessons.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align:center;padding:var(--space-12);color:var(--text-muted);">
                    <p>💬 Nenhum comentário encontrado.</p>
                </div>`;
            return;
        }

        container.innerHTML = lessons.map(lesson => `
            <div class="card" style="margin-bottom:var(--space-4);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);padding-bottom:var(--space-3);border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div>
                        <span style="font-size:0.8rem;color:var(--text-muted);">${lesson.module_title}</span>
                        <h4 style="font-family:var(--font-heading);font-size:1rem;margin-top:2px;">${lesson.title}</h4>
                    </div>
                    <span class="badge badge-info">${lesson.comment_count} comentário${lesson.comment_count !== 1 ? 's' : ''}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:var(--space-3);">
                    ${lesson.comments.map(c => {
            const initials = c.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const avatarContent = c.avatar_url
                ? `<img src="${c.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                : initials;
            return `
                            <div style="display:flex;gap:var(--space-3);padding:var(--space-3);background:rgba(255,255,255,0.02);border-radius:var(--radius-md);align-items:flex-start;">
                                <div style="width:32px;height:32px;min-width:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-light));display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:white;overflow:hidden;">${avatarContent}</div>
                                <div style="flex:1;min-width:0;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;">
                                        <span style="font-weight:600;font-size:0.85rem;">${c.user_name}</span>
                                        <span style="font-size:0.75rem;color:var(--text-muted);">${timeAgo(c.created_at)}</span>
                                    </div>
                                    <p style="margin-top:4px;font-size:0.9rem;color:var(--text-secondary);word-break:break-word;">${c.content}</p>
                                </div>
                                <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 8px;color:var(--error);" onclick="deleteAdminComment(${c.id})" title="Excluir">🗑️</button>
                            </div>`;
        }).join('')}
                </div>
            </div>
        `).join('');
    }

    // Make deleteAdminComment global
    window.deleteAdminComment = async function (commentId) {
        if (!confirm('Excluir este comentário?')) return;
        try {
            await EasyTeach.api(`/api/comments/${commentId}`, { method: 'DELETE' });
            EasyTeach.showToast('Comentário excluído', 'success');
            loadComments();
        } catch (err) {
            EasyTeach.showToast(err.message || 'Erro ao excluir', 'error');
        }
    };

    // ── Init ─────────────────────────────────────────────
    loadAll();
});
