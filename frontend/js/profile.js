document.addEventListener('DOMContentLoaded', () => {
    const user = EasyTeach.requireAuth();
    if (!user) return;

    // ── Load profile ─────────────────────────────────────────
    async function loadProfile() {
        try {
            const profile = await EasyTeach.api('/api/profile');
            document.getElementById('profileName').value = profile.name || '';
            document.getElementById('profileAge').value = profile.age || '';
            document.getElementById('profileEmail').value = profile.email || '';

            // Avatar
            if (profile.avatar_url) {
                const img = document.getElementById('avatarImg');
                img.src = profile.avatar_url;
                img.style.display = 'block';
                document.getElementById('avatarInitials').style.display = 'none';
            } else {
                const initials = (profile.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                document.getElementById('avatarInitials').textContent = initials;
            }

            // Member since
            if (profile.created_at) {
                const date = new Date(profile.created_at);
                document.getElementById('memberSince').textContent = date.toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric'
                });
            }
        } catch (err) {
            EasyTeach.showToast('Erro ao carregar perfil', 'error');
        }
    }

    loadProfile();

    // ── Save profile ─────────────────────────────────────────
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveProfileBtn');
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const result = await EasyTeach.api('/api/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    name: document.getElementById('profileName').value,
                    age: document.getElementById('profileAge').value
                })
            });
            EasyTeach.showToast('Perfil atualizado!', 'success');

            // Update localStorage user data
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            storedUser.name = result.name;
            storedUser.age = result.age;
            localStorage.setItem('user', JSON.stringify(storedUser));
        } catch (err) {
            EasyTeach.showToast(err.message || 'Erro ao atualizar perfil', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar alterações';
        }
    });

    // ── Change password ──────────────────────────────────────
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;

        if (newPass !== confirmPass) {
            EasyTeach.showToast('As senhas não conferem', 'error');
            return;
        }

        const btn = document.getElementById('changePasswordBtn');
        btn.disabled = true;
        btn.textContent = 'Alterando...';

        try {
            await EasyTeach.api('/api/profile/password', {
                method: 'PUT',
                body: JSON.stringify({
                    currentPassword: document.getElementById('currentPassword').value,
                    newPassword: newPass
                })
            });
            EasyTeach.showToast('Senha alterada com sucesso!', 'success');
            document.getElementById('passwordForm').reset();
        } catch (err) {
            EasyTeach.showToast(err.message || 'Erro ao alterar senha', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Alterar senha';
        }
    });

    // ── Avatar upload ────────────────────────────────────────
    document.getElementById('avatarInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            EasyTeach.showToast('Selecione uma imagem válida', 'error');
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.getElementById('avatarImg');
            img.src = ev.target.result;
            img.style.display = 'block';
            document.getElementById('avatarInitials').style.display = 'none';
        };
        reader.readAsDataURL(file);

        // Upload
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${EasyTeach.API_URL}/api/profile/avatar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            EasyTeach.showToast('Foto atualizada!', 'success');

            // Update localStorage
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            storedUser.avatar_url = data.data.avatar_url;
            localStorage.setItem('user', JSON.stringify(storedUser));
        } catch (err) {
            EasyTeach.showToast(err.message || 'Erro ao enviar foto', 'error');
        }
    });
});
