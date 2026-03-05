/* ══════════════════════════════════════════════════════════
   EASY TEACH — Student Dashboard (dashboard.js)
   Module navigation, video player, progress tracking
   ══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    if (!EasyTeach.requireAuth('student')) return;

    // Verify payment status from backend
    try {
        const profile = await EasyTeach.api('/api/profile');
        if (profile && !profile.paid) {
            // User hasn't paid — redirect to payment
            try {
                const payRes = await EasyTeach.api('/api/payment/create', {
                    method: 'POST',
                    body: JSON.stringify({ email: profile.email, name: profile.name })
                });
                if (payRes.checkout_url) {
                    window.location.href = payRes.checkout_url;
                    return;
                }
            } catch (e) { /* MP not configured, allow access */ }
        }
    } catch (e) { /* If profile check fails, continue */ }

    const user = EasyTeach.getUser();
    let allModules = [];
    let currentLesson = null;
    let allLessonsFlat = [];

    // Set user name
    const userName = document.getElementById('userName');
    const welcomeTitle = document.getElementById('welcomeTitle');
    if (userName) userName.textContent = user.name;
    if (welcomeTitle) welcomeTitle.textContent = `Bem-vindo, ${user.name.split(' ')[0]}! 👋`;

    // Sidebar profile avatar
    const sidebarInitials = (user.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const sidebarAvatarEl = document.getElementById('sidebarAvatar');
    const sidebarNameEl = document.getElementById('sidebarProfileName');
    if (sidebarNameEl) sidebarNameEl.textContent = user.name || 'Meu perfil';
    if (sidebarAvatarEl) {
        if (user.avatar_url) {
            sidebarAvatarEl.innerHTML = `<img src="${user.avatar_url}" alt="">`;
        } else {
            document.getElementById('sidebarAvatarInitials').textContent = sidebarInitials;
        }
    }

    // ── Load modules and lessons ─────────────────────────────
    async function loadModules() {
        try {
            allModules = await EasyTeach.api('/api/modules');
            allLessonsFlat = [];
            allModules.forEach(mod => {
                mod.lessons.forEach(lesson => {
                    allLessonsFlat.push({ ...lesson, moduleName: mod.title, moduleIcon: mod.icon });
                });
            });
            renderSidebar();
            loadProgress();
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar módulos', 'error');
        }
    }

    // ── Render sidebar ───────────────────────────────────────
    function renderSidebar() {
        const container = document.getElementById('sidebarModules');
        container.innerHTML = '';

        allModules.forEach((mod, modIndex) => {
            const moduleEl = document.createElement('div');
            moduleEl.className = 'sidebar-module';
            if (modIndex === 0) moduleEl.classList.add('open');

            const completedInModule = mod.lessons.filter(l => l.completed).length;
            const totalInModule = mod.lessons.length;

            moduleEl.innerHTML = `
        <button class="sidebar-module-header" data-module-id="${mod.id}">
          <span class="sidebar-module-icon">${mod.icon}</span>
          <span style="flex:1;">${mod.title}</span>
          <span style="font-size:0.75rem;color:var(--text-muted);margin-right:8px;">${completedInModule}/${totalInModule}</span>
          <span class="sidebar-module-chevron">›</span>
        </button>
        <div class="sidebar-lessons">
          ${mod.lessons.map(lesson => `
            <button class="sidebar-lesson ${lesson.completed ? 'completed' : ''}" data-lesson-id="${lesson.id}">
              <span class="sidebar-lesson-check">${lesson.completed ? '✓' : ''}</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lesson.title}</span>
              <span class="sidebar-lesson-type">${lesson.type === 'video' ? '🎬' : lesson.type === 'pdf' ? '📄' : '📝'}</span>
            </button>
          `).join('')}
        </div>
      `;

            container.appendChild(moduleEl);
        });

        // Module toggle
        container.querySelectorAll('.sidebar-module-header').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.sidebar-module').classList.toggle('open');
            });
        });

        // Lesson click
        container.querySelectorAll('.sidebar-lesson').forEach(btn => {
            btn.addEventListener('click', () => {
                const lessonId = parseInt(btn.dataset.lessonId);
                selectLesson(lessonId);

                // Highlight active
                container.querySelectorAll('.sidebar-lesson').forEach(l => l.classList.remove('active'));
                btn.classList.add('active');

                // Close sidebar on mobile
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });
        });
    }

    // ── Select lesson ────────────────────────────────────────
    function selectLesson(lessonId) {
        const lesson = allLessonsFlat.find(l => l.id === lessonId);
        if (!lesson) return;
        currentLesson = lesson;

        // Update title
        document.getElementById('lessonTitle').textContent = lesson.title;

        // Show/hide elements
        document.getElementById('welcomeState').style.display = 'none';
        document.getElementById('lessonActions').style.display = 'flex';
        document.getElementById('lessonInfo').style.display = 'block';

        const summaryPanel = document.getElementById('summaryPanel');
        const summaryContent = document.getElementById('summaryContent');

        // Video
        const videoContainer = document.getElementById('videoContainer');
        const placeholder = document.getElementById('videoPlaceholder');

        if (lesson.type === 'video' && lesson.content_url) {
            const url = lesson.content_url;
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                // YouTube embed
                let embedUrl = url;
                if (url.includes('watch?v=')) {
                    embedUrl = url.replace('watch?v=', 'embed/');
                }
                videoContainer.innerHTML = `<iframe src="${embedUrl}" allowfullscreen allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
            } else {
                // Direct video
                videoContainer.innerHTML = `<video controls src="${url}"></video>`;
            }
        } else if (lesson.type === 'pdf') {
            videoContainer.innerHTML = `
        <div class="video-placeholder">
          <span class="video-placeholder-icon">📄</span>
          <span>Esta é uma aula em PDF</span>
          <span style="font-size:0.9rem;">Clique em "Baixar Material PDF" abaixo</span>
        </div>
      `;
        } else {
            videoContainer.innerHTML = `
        <div class="video-placeholder">
          <span class="video-placeholder-icon">📝</span>
          <span>Conteúdo em texto</span>
        </div>
      `;
        }

        // PDF button
        const pdfBtn = document.getElementById('downloadPdfBtn');
        if (lesson.pdf_url) {
            pdfBtn.style.display = 'inline-flex';
            pdfBtn.href = lesson.pdf_url;
        } else {
            pdfBtn.style.display = 'none';
        }

        // Complete button
        const completeBtn = document.getElementById('markCompleteBtn');
        if (lesson.completed) {
            completeBtn.textContent = '✓ Concluída';
            completeBtn.classList.remove('btn-primary');
            completeBtn.classList.add('btn-outline');
            completeBtn.style.color = 'var(--success)';
            completeBtn.style.borderColor = 'var(--success)';
        } else {
            completeBtn.textContent = '✓ Marcar como Concluída';
            completeBtn.classList.add('btn-primary');
            completeBtn.classList.remove('btn-outline');
            completeBtn.style.color = '';
            completeBtn.style.borderColor = '';
        }

        // Lesson info
        document.getElementById('lessonInfoTitle').textContent = `${lesson.moduleIcon} ${lesson.moduleName}`;
        document.getElementById('lessonInfoDesc').textContent = `Aula: ${lesson.title}`;

        // Summary Panel
        if (lesson.summary) {
            summaryContent.innerHTML = parseSummaryMarkdown(lesson.summary);
            summaryPanel.classList.add('show');
        } else {
            summaryPanel.classList.remove('show');
        }

        // Nav buttons
        updateNavButtons();

        // Comments
        document.getElementById('commentsSection').style.display = 'block';
        loadComments(lesson.id);
    }

    // Basic markdown parser for summary
    function parseSummaryMarkdown(text) {
        if (!text) return '';
        let html = text
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            // Lists
            .replace(/^\s*\*(.*$)/gim, '<li>$1</li>')
            .replace(/^\s*\-(.*$)/gim, '<li>$1</li>')
            // Paragraphs
            .replace(/\n\n/g, '</p><p>')
            .replace(/<\/p><p><li>/g, '<li>'); // cleanup

        // Wrap orphaned lis in ul
        if (html.includes('<li>')) {
            html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
        }
        return '<p>' + html + '</p>';
    }

    // ── Navigation buttons ───────────────────────────────────
    function updateNavButtons() {
        const index = allLessonsFlat.findIndex(l => l.id === currentLesson?.id);
        document.getElementById('prevLessonBtn').disabled = index <= 0;
        document.getElementById('nextLessonBtn').disabled = index >= allLessonsFlat.length - 1;
    }

    document.getElementById('prevLessonBtn').addEventListener('click', () => {
        const index = allLessonsFlat.findIndex(l => l.id === currentLesson?.id);
        if (index > 0) {
            selectLesson(allLessonsFlat[index - 1].id);
            highlightActiveLesson(allLessonsFlat[index - 1].id);
        }
    });

    document.getElementById('nextLessonBtn').addEventListener('click', () => {
        const index = allLessonsFlat.findIndex(l => l.id === currentLesson?.id);
        if (index < allLessonsFlat.length - 1) {
            selectLesson(allLessonsFlat[index + 1].id);
            highlightActiveLesson(allLessonsFlat[index + 1].id);
        }
    });

    function highlightActiveLesson(lessonId) {
        document.querySelectorAll('.sidebar-lesson').forEach(l => {
            l.classList.remove('active');
            if (parseInt(l.dataset.lessonId) === lessonId) {
                l.classList.add('active');
                // Open parent module
                l.closest('.sidebar-module').classList.add('open');
            }
        });
    }

    // ── Mark as complete ─────────────────────────────────────
    document.getElementById('markCompleteBtn').addEventListener('click', async () => {
        if (!currentLesson) return;

        const newState = !currentLesson.completed;
        try {
            await EasyTeach.api('/api/progress', {
                method: 'POST',
                body: JSON.stringify({ lesson_id: currentLesson.id, completed: newState })
            });

            // Update local state
            currentLesson.completed = newState;
            const lessonInFlat = allLessonsFlat.find(l => l.id === currentLesson.id);
            if (lessonInFlat) lessonInFlat.completed = newState;

            // Update in modules
            allModules.forEach(mod => {
                const lesson = mod.lessons.find(l => l.id === currentLesson.id);
                if (lesson) lesson.completed = newState;
            });

            renderSidebar();
            highlightActiveLesson(currentLesson.id);
            selectLesson(currentLesson.id);
            loadProgress();

            EasyTeach.showToast(
                newState ? 'Aula marcada como concluída! 🎉' : 'Aula desmarcada',
                newState ? 'success' : 'info'
            );
        } catch (err) {
            EasyTeach.showToast('Erro ao atualizar progresso', 'error');
        }
    });

    // ── Load progress ────────────────────────────────────────
    async function loadProgress() {
        try {
            const progress = await EasyTeach.api('/api/progress');
            document.getElementById('progressPercent').textContent = `${progress.percentage}%`;
            document.getElementById('progressBar').style.width = `${progress.percentage}%`;
            document.getElementById('progressCompleted').textContent = progress.completed;
            document.getElementById('progressTotal').textContent = progress.total;
        } catch (err) {
            console.error('Progress error:', err);
        }
    }

    // ── Sidebar toggle (mobile) ──────────────────────────────
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });
    }

    // ── Summary Panel Close ──────────────────────────────────
    const closeSummaryBtn = document.getElementById('closeSummaryBtn');
    if (closeSummaryBtn) {
        closeSummaryBtn.addEventListener('click', () => {
            document.getElementById('summaryPanel').classList.remove('show');
        });
    }

    // ── Comments ─────────────────────────────────────────────
    let commentsPage = 1;
    let commentsOpen = true;

    // Toggle collapsible
    document.getElementById('commentsToggle').addEventListener('click', () => {
        commentsOpen = !commentsOpen;
        document.getElementById('commentsBody').style.display = commentsOpen ? 'block' : 'none';
        document.getElementById('commentsChevron').textContent = commentsOpen ? '▲' : '▼';
    });

    async function loadComments(lessonId, page = 1) {
        commentsPage = page;
        const list = document.getElementById('commentsList');
        const countEl = document.getElementById('commentsCount');
        const pagination = document.getElementById('commentsPagination');

        try {
            const result = await EasyTeach.api(`/api/lessons/${lessonId}/comments?page=${page}&limit=20`);
            const { comments, total, totalPages } = result;

            // Update count badge
            countEl.textContent = total > 0 ? `(${total})` : '';

            if (!comments || comments.length === 0) {
                list.innerHTML = '<p class="comments-empty">Nenhum comentário ainda. Seja o primeiro!</p>';
                pagination.style.display = 'none';
                return;
            }

            list.innerHTML = comments.map(c => {
                const initials = c.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const avatarContent = c.avatar_url
                    ? `<img src="${c.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
                    : initials;
                return `
                    <div class="comment-item">
                        <div class="comment-avatar">${avatarContent}</div>
                        <div class="comment-body">
                            <div class="comment-meta">
                                <strong class="comment-author">${c.user_name}</strong>
                                <span class="comment-time">${timeAgo(c.created_at)}</span>
                            </div>
                            <p class="comment-text">${escapeHtml(c.content)}</p>
                        </div>
                    </div>
                `;
            }).join('');

            // Pagination
            if (totalPages > 1) {
                pagination.style.display = 'flex';
                document.getElementById('commentsPageInfo').textContent = `Página ${page} de ${totalPages}`;
                document.getElementById('commentsPrev').disabled = page <= 1;
                document.getElementById('commentsNext').disabled = page >= totalPages;
            } else {
                pagination.style.display = 'none';
            }
        } catch (err) {
            console.error('Load comments error:', err);
            list.innerHTML = '<p class="comments-empty">Erro ao carregar comentários.</p>';
        }
    }

    // Pagination buttons
    document.getElementById('commentsPrev').addEventListener('click', () => {
        if (currentLesson && commentsPage > 1) loadComments(currentLesson.id, commentsPage - 1);
    });
    document.getElementById('commentsNext').addEventListener('click', () => {
        if (currentLesson) loadComments(currentLesson.id, commentsPage + 1);
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function timeAgo(dateStr) {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'agora';
        if (diffMin < 60) return `há ${diffMin} min`;
        const diffHrs = Math.floor(diffMin / 60);
        if (diffHrs < 24) return `há ${diffHrs}h`;
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays < 30) return `há ${diffDays}d`;
        return date.toLocaleDateString('pt-BR');
    }

    // Submit comment
    document.getElementById('submitCommentBtn').addEventListener('click', async () => {
        if (!currentLesson) return;
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content) return;

        try {
            await EasyTeach.api(`/api/lessons/${currentLesson.id}/comments`, {
                method: 'POST',
                body: JSON.stringify({ content })
            });
            input.value = '';
            loadComments(currentLesson.id, 1); // Go back to page 1 to see new comment
            EasyTeach.showToast('Comentário adicionado!', 'success');
        } catch (err) {
            EasyTeach.showToast('Erro ao enviar comentário', 'error');
        }
    });

    // Allow Ctrl+Enter to submit
    document.getElementById('commentInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            document.getElementById('submitCommentBtn').click();
        }
    });

    // Delete comment (global)
    window.deleteComment = async function (commentId) {
        try {
            await EasyTeach.api(`/api/comments/${commentId}`, { method: 'DELETE' });
            if (currentLesson) loadComments(currentLesson.id, commentsPage);
            EasyTeach.showToast('Comentário removido', 'info');
        } catch (err) {
            EasyTeach.showToast('Erro ao remover', 'error');
        }
    };

    // ── Init ─────────────────────────────────────────────────
    loadModules();
});
