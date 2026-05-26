/**
 * LectorEbook Pro - Lógica de aplicación
 */

let book = null;
let rendition = null;
let isTwoPage = true;
const STORAGE_KEY = "LectorEbook_LastPosition";

// Elementos del DOM
const el = {
    fileInput: document.getElementById('file-input'),
    viewer: document.getElementById('viewer-canvas'),
    tocSidebar: document.getElementById('toc-sidebar'),
    tocList: document.getElementById('toc-list'),
    dropZone: document.getElementById('drop-zone'),
    dropOverlay: document.getElementById('drop-overlay'),
    pageInfo: document.getElementById('page-info'),
    settingsPanel: document.getElementById('settings-panel'),
    toast: document.getElementById('toast')
};

// --- INICIALIZACIÓN ---

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si hay una sesión previa
    const lastFile = localStorage.getItem('LectorEbook_LastFile');
    if (lastFile) {
        // En una app real aquí cargaríamos el ArrayBuffer guardado en IndexedDB
        // Por seguridad del navegador, no podemos cargar archivos locales automáticamente
        console.log("Sesión previa detectada. Por favor, recargue el archivo.");
    }
    
    initEvents();
});

function initEvents() {
    // Carga de Archivos
    el.fileInput.addEventListener('change', handleFileSelect);
    
    // Drag & Drop
    el.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropZone.classList.add('dragover'); });
    el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
    el.dropZone.addEventListener('drop', handleDrop);

    // Navegación
    document.getElementById('prev-btn').addEventListener('click', () => rendition?.prev());
    document.getElementById('next-btn').addEventListener('click', () => rendition?.next());
    
    // Interfaz
    document.getElementById('toggle-toc').addEventListener('click', () => el.tocSidebar.classList.add('active'));
    document.getElementById('close-toc').addEventListener('click', () => el.tocSidebar.classList.remove('active'));
    document.getElementById('settings-btn').addEventListener('click', () => el.settingsPanel.classList.toggle('hidden'));
    
    // Temas
    document.getElementById('theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.className = theme === 'light' ? '' : theme;
        applyThemeToRendition(theme);
    });

    // Diseño (1 vs 2 páginas)
    document.getElementById('toggle-layout').addEventListener('click', () => {
        isTwoPage = !isTwoPage;
        if(book) renderBook();
    });

    // Ajustes de texto
    document.getElementById('font-range').addEventListener('input', (e) => {
        rendition?.themes.fontSize(`${e.target.value}%`);
    });

    document.getElementById('line-height').addEventListener('change', (e) => {
        rendition?.themes.default({ 'line-height': e.target.value });
    });

    // Impresión
    document.getElementById('print-btn').addEventListener('click', () => window.print());

    // Teclado
    document.addEventListener('keydown', (e) => {
        if (!rendition) return;
        if (e.key === "ArrowLeft") rendition.prev();
        if (e.key === "ArrowRight") rendition.next();
    });
}

// --- LÓGICA DEL LIBRO ---

async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) loadBook(file);
}

function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.epub')) loadBook(file);
}

function loadBook(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = e.target.result;
        
        if (book) book.destroy();
        
        book = ePub(data);
        el.dropOverlay.classList.add('hidden');
        
        await renderBook();
        setupTOC();
        
        // Cargar última posición guardada para este libro específico
        book.loaded.metadata.then(meta => {
            const savedPos = localStorage.getItem(STORAGE_KEY + "_" + meta.title);
            if (savedPos) {
                rendition.display(savedPos);
                showToast("Continuando desde donde lo dejaste");
            }
        });
    };
    reader.readAsArrayBuffer(file);
}

async function renderBook() {
    const container = document.getElementById('viewer-canvas');
    container.innerHTML = "";

    rendition = book.renderTo("viewer-canvas", {
        width: "100%",
        height: "100%",
        flow: "paginated",
        manager: "default",
        spread: isTwoPage ? "auto" : "none"
    });

    // Configurar temas internos del iframe
    rendition.themes.register("dark", { body: { background: "#1e293b", color: "#f1f5f9" } });
    rendition.themes.register("sepia", { body: { background: "#f4ecd8", color: "#5b4636" } });
    
    const currentTheme = document.getElementById('theme-select').value;
    applyThemeToRendition(currentTheme);

    rendition.display();

    // Evento al cambiar de página: Guardar posición
    rendition.on("relocated", (location) => {
        updatePageInfo(location);
        savePosition(location.start.cfi);
    });
}

function setupTOC() {
    book.loaded.navigation.then(nav => {
        el.tocList.innerHTML = "";
        nav.forEach(chapter => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = chapter.label;
            a.href = "#";
            a.onclick = (e) => {
                e.preventDefault();
                rendition.display(chapter.href);
                el.tocSidebar.classList.remove('active');
            };
            li.appendChild(a);
            el.tocList.appendChild(li);
        });
    });
}

// --- UTILIDADES ---

function applyThemeToRendition(theme) {
    if (!rendition) return;
    if (theme === 'light') rendition.themes.select('default');
    else rendition.themes.select(theme);
}

function updatePageInfo(location) {
    const start = location.start.displayed.page;
    const end = location.end.displayed.page;
    const total = book.locations.length();
    
    el.pageInfo.textContent = total > 0 
        ? `Pág. ${start} de ${book.locations.total}`
        : `Sección: ${start}`;
}

function savePosition(cfi) {
    book.loaded.metadata.then(meta => {
        localStorage.setItem(STORAGE_KEY + "_" + meta.title, cfi);
    });
}

function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    setTimeout(() => el.toast.classList.remove('show'), 3000);
}
