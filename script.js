/**
 * LectorEbook Pro - Lógica de aplicación con exportación jsPDF
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
    exportBtn: document.getElementById('export-pdf-btn')
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

    document.getElementById('font-range').addEventListener('input', (e) => {
        rendition?.themes.fontSize(`${e.target.value}%`);
    });

    document.getElementById('line-height').addEventListener('change', (e) => {
        rendition?.themes.default({ 'line-height': e.target.value });
    });

    document.getElementById('print-btn').addEventListener('click', () => {
        if (!book) return alert("Carga un libro primero.");
        window.print();
    });

    // Evento del nuevo botón para exportar todo a PDF con jsPDF
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

/**
 * Función Principal de Exportación Total usando jsPDF
 */
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

        // Iterar de forma limpia sobre toda la columna vertebral del libro (capítulos)
        for (let i = 0; i < book.spine.length; i++) {
            const item = book.spine.get(i);
            
            // Forzar carga del documento en memoria sin alterar el flujo visual actual del lector
            await item.load(book.load.bind(book));
            const chapterDoc = item.document;
            
            if (!chapterDoc) continue;

            const titleText = chapterDoc.querySelector('h1, h2, h3')?.textContent.trim() || `Sección ${i + 1}`;
            const paragraphs = chapterDoc.querySelectorAll('p');

            // Insertar título del capítulo con validación de espacio en página
            pdf.setFont("Helvetica", "bold");
            pdf.setFontSize(18);
            if (yPosition + 40 > pageHeight - margin) {
                pdf.addPage();
                yPosition = margin;
            }
            pdf.text(titleText, margin, yPosition);
            yPosition += 40;

            // Procesar párrafos secuencialmente
            pdf.setFont("Helvetica", "normal");
            pdf.setFontSize(11);

            paragraphs.forEach(p => {
                const text = p.textContent.trim();
                if (!text) return;

                // Segmentar texto de manera automática según las dimensiones de página del PDF
                const splitLines = pdf.splitTextToSize(text, maxLineWidth);
                
                splitLines.forEach(line => {
                    if (yPosition + 18 > pageHeight - margin) {
                        pdf.addPage();
                        yPosition = margin;
                    }
                    pdf.text(line, margin, yPosition);
                    yPosition += 18; // Alto de línea proporcional
                });
                yPosition += 12; // Espacio libre post-párrafo
            });

            yPosition += 25; // Separador entre capítulos
            item.unload(); // Liberar memoria del DOM virtual
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
