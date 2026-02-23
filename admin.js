document.addEventListener('DOMContentLoaded', () => {
    let ADMIN_PASSWORD = '';
    let CURRENT_SECTION = 'tours';
    let editModal;

    const loginContainer = document.getElementById('login-container');
    const adminPanel = document.getElementById('admin-panel');
    const loginForm = document.getElementById('loginForm');
    const adminPassInput = document.getElementById('adminPass');
    const itemList = document.getElementById('item-list');
    const sectionTitle = document.getElementById('section-title');
    const addNewBtn = document.getElementById('add-new-btn');
    const modalTitle = document.getElementById('modal-title');
    const editForm = document.getElementById('edit-form');
    
    // Initialize Modal
    editModal = new bootstrap.Modal(document.getElementById('editModal'));

    // --- LOGIN ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        ADMIN_PASSWORD = adminPassInput.value.trim();
        if (ADMIN_PASSWORD) {
            loginContainer.classList.add('d-none');
            adminPanel.classList.remove('d-none');
            loadSectionData(CURRENT_SECTION);
        }
    });

    // --- NAVIGATION ---
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.sidebar .nav-link.active').classList.remove('active');
            e.currentTarget.classList.add('active');
            CURRENT_SECTION = e.currentTarget.getAttribute('data-section');
            sectionTitle.textContent = e.currentTarget.textContent.trim();
            addNewBtn.style.display = ['bookings', 'contacts'].includes(CURRENT_SECTION) ? 'none' : 'block';
            loadSectionData(CURRENT_SECTION);
        });
    });

    // --- DATA LOADING ---
    async function loadSectionData(section) {
        itemList.innerHTML = `<div class="d-flex justify-content-center mt-3"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
        
        let url = ['bookings', 'contacts'].includes(section) ? `/api/${section}` : `/api/admin/${section}`;
        
        try {
            const res = await fetch(url, { headers: { 'x-admin-pass': ADMIN_PASSWORD } });
            if (res.status === 401) throw new Error('Giriş uğursuz oldu. Şifrə yanlışdır və ya sessiya bitib.');
            if (!res.ok) throw new Error('Məlumatları yükləmək mümkün olmadı.');
            const data = await res.json();
            renderList(data);
        } catch (error) {
            itemList.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        }
    }
    
    // --- RENDERING LIST ---
    function renderList(data) {
        itemList.innerHTML = '';
        if (!data || data.length === 0) {
            itemList.innerHTML = '<p class="text-muted mt-3">Heç bir məlumat tapılmadı.</p>';
            return;
        }

        const listGroup = document.createElement('div');
        listGroup.className = 'list-group list-group-flush';
        
        data.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'list-group-item item-card p-3';
            const id = item.id || item.bookingId || item.contactId;

            let title = 'N/A';
            let image = 'https://via.placeholder.com/100x70.png?text=No+Image';
            let subtitle = '';

            switch(CURRENT_SECTION) {
                case 'tours':
                    title = item.title?.az || 'Başlıqsız Tur';
                    image = item.image;
                    subtitle = `Qiymət: $${item.price || 0}`;
                    break;
                case 'destinations':
                    title = item.name?.az || 'Adsız Məkan';
                    image = item.image;
                    subtitle = item.description?.az?.substring(0, 50) + '...';
                    break;
                case 'cars':
                    title = item.title || 'Adsız Avtomobil';
                    image = item.images?.[0];
                    subtitle = `${item.images?.length || 0} şəkil`;
                    break;
                case 'ideas':
                    title = item.title?.az || 'Başlıqsız İdeya';
                    image = item.image;
                    break;
                case 'bookings':
                    title = `${item.ad || ''} ${item.soyad || ''}`;
                    subtitle = `Avtomobil: ${item.avtomobil_modeli || 'Qeyd edilməyib'}`;
                    image = null;
                    break;
                case 'contacts':
                    title = item.name || 'Adsız';
                    subtitle = `Mövzu: ${item.subject || 'Qeyd edilməyib'}`;
                    image = null;
                    break;
            }
            
            // YENİLƏNMİŞ HİSSƏ: "Bax" düyməsi əlavə edildi
            const actionsHTML = !['bookings', 'contacts'].includes(CURRENT_SECTION) ? `
                <div class="actions">
                    <button class="btn btn-sm btn-primary view-btn" data-id="${id}" title="Bax"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${id}" title="Redaktə et"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${id}" title="Sil"><i class="fas fa-trash"></i></button>
                </div>` : '';
            
            const imageHTML = image ? `<img src="${image}" alt="${title}">` : '';

            itemEl.innerHTML = `
                ${imageHTML}
                <div class="info">
                    <h6 class="mb-1">${title}</h6>
                    <small class="text-muted">${subtitle}</small>
                    ${item.receivedAt ? `<div class="text-muted small mt-1">${new Date(item.receivedAt).toLocaleString()}</div>` : ''}
                </div>
                ${actionsHTML}
            `;
            listGroup.appendChild(itemEl);
        });
        itemList.appendChild(listGroup);
    }
    
    // --- UNIVERSAL FORM GENERATOR ---
    function generateFormFields(item = {}) {
        const id = item.id || '';
        let html = `<input type="hidden" name="id" value="${id}">`;

        switch(CURRENT_SECTION) {
            case 'tours':
                html += createTranslatableInput('title', 'Başlıq', item.title);
                html += createTranslatableInput('location', 'Məkan', item.location);
                html += createTranslatableInput('duration', 'Müddət', item.duration);
                html += `<div class="mb-3"><label class="form-label">Qiymət</label><input name="price" type="number" class="form-control" value="${item.price || ''}"></div>`;
                html += `<div class="mb-3"><label class="form-label">Tur Şəkli (Yeni yükləmək üçün seçin)</label><input name="imageFile" type="file" class="form-control"></div>`;
                html += createTranslatableTextarea('short', 'Qısa Təsvir', item.short);
                html += createTranslatableTextarea('details', 'Tam Təsvir', item.details, 5);
                break;
            case 'destinations':
                html += createTranslatableInput('name', 'Məkanın Adı', item.name);
                html += createTranslatableTextarea('description', 'Açıqlama', item.description);
                html += `<div class="mb-3"><label class="form-label">Əsas Şəkil</label><input name="image" type="file" class="form-control"></div>`;
                html += `<div class="mb-3"><label class="form-label">Xəritə Şəkli (PNG)</label><input name="mapImage" type="file" class="form-control"></div>`;
                break;
            case 'cars':
                html += `<div class="mb-3"><label class="form-label">Avtomobilin Adı</label><input name="title" class="form-control" value="${item.title || ''}"></div>`;
                html += `<div class="mb-3"><label class="form-label">Avtomobil Şəkilləri (Maks. 5)</label><input name="images" type="file" class="form-control" multiple></div>`;
                break;
            case 'ideas':
                html += createTranslatableInput('title', 'İdeyanın Başlığı', item.title);
                html += `<div class="mb-3"><label class="form-label">Şəkil</label><input name="image" type="file" class="form-control"></div>`;
                break;
            default:
                html = '<p>Bu bölmə üçün redaktə forması mövcud deyil.</p>';
        }
        editForm.innerHTML = html;
    }

    // --- FORM HELPERS ---
    function createTranslatableInput(name, label, values = {}) {
        return `
        <div class="mb-3">
            <label class="form-label fw-bold">${label}</label>
            <div class="input-group input-group-sm mb-1">
                <span class="input-group-text">AZ</span>
                <input name="${name}_az" class="form-control" value="${values.az || ''}">
            </div>
            <div class="input-group input-group-sm mb-1">
                <span class="input-group-text">EN</span>
                <input name="${name}_en" class="form-control" value="${values.en || ''}">
            </div>
            <div class="input-group input-group-sm">
                <span class="input-group-text">RU</span>
                <input name="${name}_ru" class="form-control" value="${values.ru || ''}">
            </div>
        </div>`;
    }
    function createTranslatableTextarea(name, label, values = {}, rows = 2) {
        return `
        <div class="mb-3">
            <label class="form-label fw-bold">${label}</label>
            <div class="input-group input-group-sm mb-1"><span class="input-group-text">AZ</span><textarea name="${name}_az" class="form-control" rows="${rows}">${values.az || ''}</textarea></div>
            <div class="input-group input-group-sm mb-1"><span class="input-group-text">EN</span><textarea name="${name}_en" class="form-control" rows="${rows}">${values.en || ''}</textarea></div>
            <div class="input-group input-group-sm"><span class="input-group-text">RU</span><textarea name="${name}_ru" class="form-control" rows="${rows}">${values.ru || ''}</textarea></div>
        </div>`;
    }

    // --- EVENT LISTENERS (VIEW, EDIT, DELETE, ADD) ---
    itemList.addEventListener('click', e => {
        // YENİLƏNMİŞ HİSSƏ: "Bax" düyməsinin klik hadisəsi əlavə edildi
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            viewItem(viewBtn.dataset.id);
        }

        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            openEditModal(editBtn.dataset.id);
        }
        
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            if (confirm('Bu elementi silməyə əminsiniz? Bu əməliyyat geri qaytarıla bilməz.')) {
                deleteItem(deleteBtn.dataset.id);
            }
        }
    });
    
    addNewBtn.addEventListener('click', () => openEditModal(null));
    editForm.addEventListener('submit', handleFormSubmit);

    // --- YENİ FUNKSİYA: Elementə baxış üçün ---
    function viewItem(id) {
        let url = '';
        switch(CURRENT_SECTION) {
            case 'tours':
                // Turlar üçün detallı səhifəyə yönləndirir
                url = `/tour.html?id=${id}`;
                break;
            // Gələcəkdə digər bölmələr üçün də detallı səhifələr yaratsanız, bura əlavə edə bilərsiniz
            // case 'cars':
            //     url = `/car-detail.html?id=${id}`;
            //     break;
            default:
                // Əgər detallı səhifə yoxdursa, xəbərdarlıq verir
                alert('Bu bölmə üçün detallı baxış səhifəsi mövcud deyil.');
                return;
        }
        // Yönləndirməni yeni pəncərədə açır
        window.open(url, '_blank');
    }

    // --- MODAL & FORM HANDLING ---
    async function openEditModal(id) {
        const isNew = id === null;
        modalTitle.textContent = isNew ? `Yeni ${sectionTitle.textContent} Əlavə Et` : `${sectionTitle.textContent} Redaktə Et`;
        editForm.innerHTML = '<div class="spinner-border" role="status"></div>';
        editForm.dataset.id = id || '';
        
        let item = {};
        if (!isNew) {
            try {
                const res = await fetch(`/api/admin/${CURRENT_SECTION}`, { headers: { 'x-admin-pass': ADMIN_PASSWORD } });
                const items = await res.json();
                item = items.find(i => i.id === id);
            } catch (error) {
                editForm.innerHTML = `<p class="text-danger">Məlumat yüklənərkən xəta baş verdi.</p>`;
                return;
            }
        }
        
        generateFormFields(item);
        editModal.show();
    }
    
    // --- API CALLS (CREATE, UPDATE, DELETE) ---
    async function handleFormSubmit(e) {
        e.preventDefault();
        const id = e.target.dataset.id;
        const isNew = !id;
        const url = `/api/admin/${CURRENT_SECTION}${isNew ? '' : '/' + id}`;
        const method = isNew ? 'POST' : 'PUT';
        
        const formData = new FormData(editForm);
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'x-admin-pass': ADMIN_PASSWORD },
                body: formData
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Əməliyyat uğursuz oldu.');
            editModal.hide();
            loadSectionData(CURRENT_SECTION);
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    }

    async function deleteItem(id) {
        try {
            const res = await fetch(`/api/admin/${CURRENT_SECTION}/${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-pass': ADMIN_PASSWORD }
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Silmək mümkün olmadı.');
            loadSectionData(CURRENT_SECTION);
        } catch (error) {
            alert(`Xəta: ${error.message}`);
        }
    }
});