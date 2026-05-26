/**
 * LectorEbook Pro - Versión Corregida (TOC Recursivo, Interlineado Mandatorio e Inicial Capitular)
 */

let book = null;
let rendition = null;
let isTwoPage = true;
const STORAGE_KEY = "LectorEbook_LastPosition";

const el = {
    fileInput: document.getElementById('file-input'),
    viewer: document.getElementById('viewer-canvas'),
    tocSidebar: document.getElementById('toc-sidebar'),
    tocList: document.getElementById('toc-list'),
    dropZone: document.getElementById('drop-zone'),
    dropOverlay: document.getElementById('drop-overlay'),
    pageInfo: document.getElementById('page-info'),
    settingsPanel: document.getElementById('settings-panel'),
    toast: document.getElementById('toast'),
    exportBtn: document.getElementById('export-pdf-btn'),
    dropcapToggle: document.getElementById('dropcap-toggle')
};

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
});

function initEvents() {
    el.fileInput.addEventListener('change', handleFileSelect);
    el.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); el.dropZone.classList.add('dragover'); });
    el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
    el.dropZone.addEventListener('drop', handleDrop);

    document.getElementById('prev-btn').addEventListener('click', () => rendition?.prev());
    document.getElementById('next-btn').addEventListener('click', () => rendition?.next());
    
    document.getElementById('toggle-toc').addEventListener('click', () => el.tocSidebar.classList.add('active'));
    document.getElementById('close-toc').addEventListener('click', () => el.tocSidebar.classList.remove('active'));
    document.getElementById('settings-btn').addEventListener('click', () => el.settingsPanel.classList.toggle('hidden'));
    
    document.getElementById('theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.className = theme === 'light' ? '' : theme;
        applyThemeToRendition(theme);
    });

    document.getElementById('toggle-layout').addEventListener('click', () => {
        isTwoPage = !isTwoPage;
        if(book) renderBook();
    });

    // Escuchadores de tipografía unificados
    document.getElementById('font-range').addEventListener('input', updateTypography);
    document.getElementById('line-height').addEventListener('change', updateTypography);
    el.dropcapToggle.addEventListener('change', updateTypography);

    document.getElementById('print-btn').addEventListener('click', () => {
        if (!book) return alert("Carga un libro primero.");
        window.print();
    });

    el.exportBtn.addEventListener('click', exportToPDF);

    document.addEventListener('keydown', (e) => {
        if (!rendition) return;
        if (e.key === "ArrowLeft") rendition.prev();
        if (e.key === "ArrowRight") rendition.next();
    });
}

function handleFileSelect(e) {
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

    rendition.themes.register("dark", { body: { background: "#1e293b", color: "#f1f5f9" } });
    rendition.themes.register("sepia", { body: { background: "#f4ecd8", color: "#5b4636" } });
    
    const currentTheme = document.getElementById('theme-select').value;
    applyThemeToRendition(currentTheme);

    rendition.display();

    rendition.on("relocated", (location) => {
        updatePageInfo(location);
        savePosition(location.start.cfi);
    });

    // Aplicar las preferencias tipográficas al cambiar de capítulo
    rendition.on("rendered", () => {
        updateTypography();
    });
}

/**
 * SOLUCIÓN AL ÍNDICE INCOMPLETO: Recorrido recursivo del árbol de navegación (Navigation Object)
 */
function setupTOC() {
    book.loaded.navigation.then(nav => {
        el.tocList.innerHTML = "";
        
        // Función recursiva interna para mapear subniveles de capítulos
        function walkTOC(navItems, containerElement) {
            navItems.forEach(chapter => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                
                a.textContent = chapter.label ? chapter.label.trim() : "Sección sin título";
                a.href = "#";
                a.onclick = (e) => {
                    e.preventDefault();
                    rendition.display(chapter.href);
                    el.tocSidebar.classList.remove('active');
                };
                
                li.appendChild(a);
                containerElement.appendChild(li);
                
                // Si este capítulo contiene subcapítulos, iterar recursivamente creando sub-listas
                if (chapter.subitems && chapter.subitems.length > 0) {
                    const subUl = document.createElement('ul');
                    subUl.className = "toc-sublinks";
                    li.appendChild(subUl);
                    walkTOC(chapter.subitems, subUl);
                }
            });
        }
        
        // Iniciar recorrido desde la raíz del objeto de navegación
        if (nav && nav.toc) {
            walkTOC(nav.toc, el.tocList);
        } else if (nav) {
            walkTOC(nav, el.tocList);
        }
    });
}

/**
 * SOLUCIÓN AL INTERLINEADO Y ADICIÓN DE LETRA CAPITULAR
 */
function updateTypography() {
    if (!rendition) return;

    const size = document.getElementById('font-range').value;
    const lineHeight = document.getElementById('line-height').value;
    const isDropCapEnabled = el.dropcapToggle.checked;

    // 1. Ajustar Tamaño base
    rendition.themes.fontSize(`${size}%`);

    // 2. Corregir Interlineado: Forzar override directo en elementos p y body con !important
    rendition.themes.override("p", `line-height: ${lineHeight} !important; margin-bottom: 1.2em !important;`);
    rendition.themes.override("body", `line-height: ${lineHeight} !important;`);

    // 3. Control de Letra Capitular Dinámica
    if (isDropCapEnabled) {
        // Aplica un estilo elegante de capitular flotante a la primera letra del primer párrafo de la vista actual
        rendition.themes.override("p:first-of-type::first-letter", `
            font-size: 3.2em !important;
            float: left !important;
            line-height: 0.85 !important;
            margin-top: 4px !important;
            margin-right: 8px !important;
            font-weight: 800 !important;
            font-family: 'Georgia', serif !important;
            color: var(--accent, #2563eb) !important;
        `);
    } else {
        // Restaurar estado inicial removiendo la propiedad modificada
        rendition.themes.override("p:first-of-type::first-letter", `
            font-size: inherit !important;
            float: none !important;
            line-height: inherit !important;
            margin: 0 !important;
            font-weight: normal !important;
            color: inherit !important;
        `);
    }
}

async function exportToPDF() {
    if (!book) return alert("Carga un libro primero antes de exportar.");
    
    showToast("Compilando libro completo... Esto puede tomar unos segundos.");
    el.exportBtn.disabled = true;
    el.exportBtn.textContent = "Procesando...";

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        
        const margin = 50;
        let yPosition = margin;
        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const maxLineWidth = pageWidth - (margin * 2);

        for (let i = 0; i < book.spine.length; i++) {
            const item = book.spine.get(i);
            await item.load(book.load.bind(book));
            const chapterDoc = item.document;
            
            if (!chapterDoc) continue;

            const titleText = chapterDoc.querySelector('h1, h2, h3')?.textContent.trim() || `Sección ${i + 1}`;
            const paragraphs = chapterDoc.querySelectorAll('p');

            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(18);
            if (yPosition + 40 > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
            }
            pdf.text(titleText, margin, yPosition);
            yPosition += 40;

            pdf.setFont("Helvetica", "normal");
            pdf.setFontSize(11);

            paragraphs.forEach(p => {
                const text = p.textContent.trim();
                if (!text) return;

                const splitLines = pdf.splitTextToSize(text, maxLineWidth);
                
                splitLines.forEach(line => {
                    if (yPosition + 18 > pageHeight - margin) {
                        pdf.addPage();
                        yPosition = margin;
                    }
                    pdf.text(line, margin, yPosition);
                    yPosition += 18;
                });
                yPosition += 12;
            });

            yPosition += 25;
            item.unload();
        }

        const metadata = await book.loaded.metadata;
        pdf.save(`${metadata.title || 'Libro_Exportado'}.pdf`);
        showToast("¡Libro completo exportado con éxito!");

    } catch (error) {
        console.error("Error en la exportación: ", error);
        alert("Ocurrió un error al procesar el archivo completo.");
    } finally {
        el.exportBtn.disabled = false;
        el.exportBtn.innerHTML = '<i class="ph ph-file-pdf"></i> Exportar';
    }
}

function applyThemeToRendition(theme) {
    if (!rendition) return;
    if (theme === 'light') rendition.themes.select('default');
    else rendition.themes.select(theme);
}

function updatePageInfo(location) {
    if(!location || !location.start) return;
    const start = location.start.displayed.page;
    el.pageInfo.textContent = `Sección Pág. ${start}`;
}

function savePosition(cfi) {
    book.loaded.metadata.then(meta => {
        localStorage.setItem(STORAGE_KEY + "_" + meta.title, cfi);
    });
}

function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    setTimeout(() => el.toast.classList.remove('show'), 4000);
}
