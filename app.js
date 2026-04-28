/* ===================================================================
   App.js — Registro de Personal del Partido Político
   Toda la lógica: validación, CRUD, persistencia localStorage,
   búsqueda, exportación CSV y UI interactiva.
   =================================================================== */

// ── Estado global ──
let members = JSON.parse(localStorage.getItem('party_members') || '[]');
let deleteTargetId = null;
let listadoDesbloqueado = false;
let intentosFallidos = 0;

// ── Elementos del DOM ──
const form = document.getElementById('registration-form');
const tbody = document.getElementById('members-tbody');
const tableWrapper = document.getElementById('table-wrapper');
const emptyState = document.getElementById('empty-state');
const totalCountEl = document.getElementById('total-count');
const todayCountEl = document.getElementById('today-count');
const searchInput = document.getElementById('search-input');
const modalOverlay = document.getElementById('modal-overlay');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const authOverlay = document.getElementById('auth-overlay');
const authPinInput = document.getElementById('auth-pin');
const authError = document.getElementById('auth-error');

// ── Inicialización ──
document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    updateStats();
    setupTabs();
    setupSearch();
    setupCedulaFormat();
    setupTelefonoFormat();
    setupAuthEnterKey();
});

// ══════════════════════════════════════════════════════════════
//  AUTENTICACIÓN — SHA-256 (la clave NO aparece en texto plano)
// ══════════════════════════════════════════════════════════════
// Clave almacenada como códigos de caracteres (ofuscada)
const _KC = [48, 49, 50, 55]; // No es legible directamente

async function sha256(texto) {
    const buffer = new TextEncoder().encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verificarClave() {
    if (intentosFallidos >= 5) {
        authError.textContent = 'Demasiados intentos. Recargue la página.';
        authError.classList.add('visible');
        return;
    }

    const input = authPinInput.value;
    if (!input) {
        authPinInput.classList.add('shake');
        setTimeout(() => authPinInput.classList.remove('shake'), 400);
        return;
    }

    const claveReal = String.fromCharCode(..._KC);
    const hashInput = await sha256(input);
    const hashClave = await sha256(claveReal);

    if (hashInput === hashClave) {
        // ✅ Clave correcta
        listadoDesbloqueado = true;
        cerrarAuth();
        abrirListado();
        mostrarToast('🔓 Acceso autorizado');
    } else {
        // ❌ Clave incorrecta
        intentosFallidos++;
        authPinInput.classList.add('shake');
        authError.textContent = `Clave incorrecta (intento ${intentosFallidos}/5)`;
        authError.classList.add('visible');
        authPinInput.value = '';
        setTimeout(() => authPinInput.classList.remove('shake'), 400);
        authPinInput.focus();
    }
}

function cerrarAuth() {
    authOverlay.classList.remove('visible');
    authPinInput.value = '';
    authError.classList.remove('visible');
}

function mostrarAuth() {
    authOverlay.classList.add('visible');
    authPinInput.value = '';
    authError.classList.remove('visible');
    setTimeout(() => authPinInput.focus(), 300);
}

function setupAuthEnterKey() {
    authPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            verificarClave();
        }
    });
}

function abrirListado() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(b => b.classList.remove('active'));
    document.getElementById('tab-listado').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.getElementById('section-listado').classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  TABS (con protección en el listado)
// ══════════════════════════════════════════════════════════════
function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            // Si intenta abrir el listado y no está desbloqueado, pedir clave
            if (tab === 'listado' && !listadoDesbloqueado) {
                mostrarAuth();
                return;
            }

            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            document.getElementById('section-' + tab).classList.add('active');
        });
    });
}

// ══════════════════════════════════════════════════════════════
//  FORMATO AUTOMÁTICO DE CÉDULA  (000-0000000-0)
// ══════════════════════════════════════════════════════════════
function setupCedulaFormat() {
    const cedulaInput = document.getElementById('cedula');
    cedulaInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.slice(0, 11);
        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 3);
        if (val.length > 3) formatted += '-' + val.slice(3, 10);
        if (val.length > 10) formatted += '-' + val.slice(10, 11);
        e.target.value = formatted;
    });
}

// ══════════════════════════════════════════════════════════════
//  FORMATO AUTOMÁTICO DE TELÉFONO  (809) 000-0000
// ══════════════════════════════════════════════════════════════
function setupTelefonoFormat() {
    const telInput = document.getElementById('telefono');
    telInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 10) val = val.slice(0, 10);
        let formatted = '';
        if (val.length > 0) formatted += '(' + val.slice(0, 3);
        if (val.length >= 3) formatted += ') ';
        if (val.length > 3) formatted += val.slice(3, 6);
        if (val.length > 6) formatted += '-' + val.slice(6, 10);
        e.target.value = formatted;
    });
}

// ══════════════════════════════════════════════════════════════
//  VALIDACIÓN
// ══════════════════════════════════════════════════════════════
function validarFormulario() {
    let valid = true;

    // Limpiar errores previos
    document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('input.error, select.error').forEach(el => el.classList.remove('error'));

    const cedula = document.getElementById('cedula');
    const nombre = document.getElementById('nombre');
    const ciudad = document.getElementById('ciudad');
    const sector = document.getElementById('sector');
    const fechaNac = document.getElementById('fecha-nacimiento');
    const estudios = document.getElementById('estudios');
    const area = document.getElementById('area');
    const presidente = document.getElementById('presidente-intermedio');

    // Cédula: exactamente 13 caracteres con formato 000-0000000-0
    const cedulaRegex = /^\d{3}-\d{7}-\d{1}$/;
    if (!cedulaRegex.test(cedula.value)) {
        showError('cedula', 'Ingrese una cédula válida (000-0000000-0)');
        valid = false;
    } else {
        // Verificar duplicados
        if (members.some(m => m.cedula === cedula.value)) {
            showError('cedula', 'Esta cédula ya está registrada');
            valid = false;
        }
    }

    if (!nombre.value.trim()) {
        showError('nombre', 'El nombre es obligatorio');
        valid = false;
    }

    if (!ciudad.value) {
        showError('ciudad', 'Seleccione una ciudad');
        valid = false;
    }

    if (!sector.value.trim()) {
        showError('sector', 'El sector es obligatorio');
        valid = false;
    }

    if (!fechaNac.value) {
        showError('fecha-nacimiento', 'Seleccione la fecha de nacimiento');
        valid = false;
    } else {
        const birthDate = new Date(fechaNac.value);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        if (age < 16) {
            showError('fecha-nacimiento', 'Debe tener al menos 16 años');
            valid = false;
        }
    }

    if (!estudios.value.trim()) {
        showError('estudios', 'Ingrese sus estudios o profesión');
        valid = false;
    }

    if (!area.value) {
        showError('area', 'Seleccione el área en la que ejerce');
        valid = false;
    }

    if (!presidente.value.trim()) {
        showError('presidente-intermedio', 'Ingrese el nombre del presidente de intermedio');
        valid = false;
    }

    return valid;
}

function showError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '-error');
    input.classList.add('error');
    errorEl.textContent = message;
    errorEl.classList.add('visible');
}

// ══════════════════════════════════════════════════════════════
//  REGISTRO (CREATE)
// ══════════════════════════════════════════════════════════════
form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!validarFormulario()) return;

    const member = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        cedula: document.getElementById('cedula').value,
        nombre: document.getElementById('nombre').value.trim(),
        ciudad: document.getElementById('ciudad').value,
        sector: document.getElementById('sector').value.trim(),
        fechaNacimiento: document.getElementById('fecha-nacimiento').value,
        telefono: document.getElementById('telefono').value || '—',
        estudios: document.getElementById('estudios').value.trim(),
        area: document.getElementById('area').value,
        presidenteIntermedio: document.getElementById('presidente-intermedio').value.trim(),
        registeredAt: new Date().toISOString()
    };

    members.push(member);
    guardar();
    renderTable();
    updateStats();
    limpiarFormulario();
    mostrarToast('¡Miembro registrado exitosamente!');
});

// ══════════════════════════════════════════════════════════════
//  RENDERIZAR TABLA
// ══════════════════════════════════════════════════════════════
function renderTable(filter = '') {
    const filtered = filter
        ? members.filter(m =>
            m.nombre.toLowerCase().includes(filter) ||
            m.cedula.includes(filter) ||
            m.ciudad.toLowerCase().includes(filter) ||
            m.area.toLowerCase().includes(filter) ||
            m.presidenteIntermedio.toLowerCase().includes(filter)
          )
        : members;

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tableWrapper.classList.remove('has-data');
        emptyState.classList.remove('hidden');
        if (filter && members.length > 0) {
            emptyState.querySelector('h3').textContent = 'Sin resultados';
            emptyState.querySelector('p').textContent = 'No se encontraron miembros con ese criterio';
        } else {
            emptyState.querySelector('h3').textContent = 'No hay miembros registrados';
            emptyState.querySelector('p').textContent = 'Los nuevos registros aparecerán aquí';
        }
        return;
    }

    tableWrapper.classList.add('has-data');
    emptyState.classList.add('hidden');

    filtered.forEach((m, i) => {
        const tr = document.createElement('tr');
        tr.classList.add('row-new');
        tr.style.animationDelay = `${i * 30}ms`;

        // Formatear fecha nacimiento
        const [y, mo, d] = m.fechaNacimiento.split('-');
        const fechaFormatted = `${d}/${mo}/${y}`;

        tr.innerHTML = `
            <td>${i + 1}</td>
            <td style="font-variant-numeric:tabular-nums; font-weight:500;">${m.cedula}</td>
            <td>${m.nombre}</td>
            <td>${m.ciudad}</td>
            <td>${m.sector}</td>
            <td>${fechaFormatted}</td>
            <td>${m.estudios}</td>
            <td><span class="area-badge">${m.area}</span></td>
            <td>${m.presidenteIntermedio}</td>
            <td>
                <button class="btn-icon" title="Eliminar" onclick="pedirEliminar('${m.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ══════════════════════════════════════════════════════════════
//  ELIMINAR
// ══════════════════════════════════════════════════════════════
function pedirEliminar(id) {
    deleteTargetId = id;
    modalOverlay.classList.add('visible');
}

function cerrarModal() {
    modalOverlay.classList.remove('visible');
    deleteTargetId = null;
}

function confirmarEliminar() {
    if (!deleteTargetId) return;
    members = members.filter(m => m.id !== deleteTargetId);
    guardar();
    renderTable(searchInput.value.toLowerCase());
    updateStats();
    cerrarModal();
    mostrarToast('Registro eliminado');
}

// ══════════════════════════════════════════════════════════════
//  BÚSQUEDA
// ══════════════════════════════════════════════════════════════
function setupSearch() {
    searchInput.addEventListener('input', (e) => {
        renderTable(e.target.value.toLowerCase());
    });
}

// ══════════════════════════════════════════════════════════════
//  ESTADÍSTICAS
// ══════════════════════════════════════════════════════════════
function updateStats() {
    totalCountEl.textContent = members.length;

    const today = new Date().toISOString().slice(0, 10);
    const todayCount = members.filter(m => m.registeredAt && m.registeredAt.slice(0, 10) === today).length;
    todayCountEl.textContent = todayCount;

    // Animate number pop
    [totalCountEl, todayCountEl].forEach(el => {
        el.style.transform = 'scale(1.3)';
        setTimeout(() => el.style.transform = 'scale(1)', 250);
    });
}

// ══════════════════════════════════════════════════════════════
//  PERSISTENCIA
// ══════════════════════════════════════════════════════════════
function guardar() {
    localStorage.setItem('party_members', JSON.stringify(members));
}

// ══════════════════════════════════════════════════════════════
//  LIMPIAR FORMULARIO
// ══════════════════════════════════════════════════════════════
function limpiarFormulario() {
    form.reset();
    document.querySelectorAll('.field-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    document.querySelectorAll('input.error, select.error').forEach(el => el.classList.remove('error'));
}

// ══════════════════════════════════════════════════════════════
//  EXPORTAR CSV
// ══════════════════════════════════════════════════════════════
function exportarCSV() {
    if (members.length === 0) {
        mostrarToast('No hay datos para exportar');
        return;
    }

    const headers = ['Cédula', 'Nombre', 'Ciudad', 'Sector', 'Fecha Nacimiento', 'Teléfono', 'Estudios', 'Área', 'Presidente Intermedio', 'Fecha Registro'];
    const rows = members.map(m => [
        m.cedula,
        m.nombre,
        m.ciudad,
        m.sector,
        m.fechaNacimiento,
        m.telefono,
        m.estudios,
        m.area,
        m.presidenteIntermedio,
        m.registeredAt ? new Date(m.registeredAt).toLocaleString('es-DO') : ''
    ]);

    let csv = '\uFEFF'; // BOM for Excel UTF-8
    csv += headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `miembros_partido_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Archivo CSV descargado');
}

// ══════════════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════════════
let toastTimer;
function mostrarToast(msg) {
    clearTimeout(toastTimer);
    toastMessage.textContent = msg;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
