// ===== CONFIGURAÇÃO BLOCO B1 =====
const CONFIG = {
    PUBLISHED_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRg8tgkDqFmtPoXyRj4fagNVvxcrKC21dFuesMSnUWxrO4Z9nBrAxWQYMfb8UeNIiUj1_uJjSIrgY0S/pubhtml',
    DEFAULT_VALUE: 3000, // 3.000 KZ
    DUE_DAY: 10,
    CURRENCY: 'KZ',
    CACHE_DURATION: 5 * 60 * 1000,
    TOTAL_APARTMENTS: 12, // Apartamentos 1-11 + B1
    APARTMENTS_LIST: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', 'B1'],
    BUILDING_NAME: 'BLOCO B1',
    MONTH_NAMES: [
        'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
        'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
    ]
};

// ===== ESTADO E CACHE =====
const appState = {
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    filter: 'all',
    searchTerm: '',
    apartments: [],
    isOnline: true,
    isLoading: false,
    allData: {},
    cache: { timestamp: 0, data: null }
};

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    console.log(`${CONFIG.BUILDING_NAME} - Sistema iniciando...`);
    initializeApp();
});

async function initializeApp() {
    updateMonthDisplay();
    updateBuildingName();
    setupEventListeners();
    setupPrintButtons();
    
    await loadAllData();
    startAutoRefresh();
}

// ===== ATUALIZAR NOME DO PRÉDIO =====
function updateBuildingName() {
    // Atualizar no título da página
    document.title = `Controle de Pagamentos | ${CONFIG.BUILDING_NAME}`;
    
    // Atualizar no cabeçalho se existir
    const buildingTitle = document.getElementById('building-title');
    if (buildingTitle) {
        buildingTitle.textContent = CONFIG.BUILDING_NAME;
    }
    
    // Atualizar subtítulo se existir
    const buildingSubtitle = document.getElementById('building-subtitle');
    if (buildingSubtitle) {
        buildingSubtitle.textContent = `Valor base: ${formatCurrency(CONFIG.DEFAULT_VALUE)}`;
    }
}

// ===== SISTEMA DE CACHE =====
function getCacheKey() {
    return `b1_payments_cache_v2`;
}

function saveToCache(data) {
    const cacheData = {
        timestamp: Date.now(),
        data: data,
        version: '2.0'
    };
    
    try {
        localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
        appState.cache = cacheData;
    } catch (e) {
        console.log('Erro ao salvar cache:', e);
    }
}

function loadFromCache() {
    try {
        const cached = localStorage.getItem(getCacheKey());
        if (!cached) return null;
        
        const cacheData = JSON.parse(cached);
        const age = Date.now() - cacheData.timestamp;
        
        if (age < CONFIG.CACHE_DURATION) {
            appState.cache = cacheData;
            return cacheData.data;
        }
    } catch (e) {
        console.log('Erro ao carregar cache:', e);
    }
    return null;
}

// ===== CARREGAR TODOS OS DADOS =====
async function loadAllData() {
    if (appState.isLoading) return;
    
    appState.isLoading = true;
    showLoading(true);
    
    try {
        // Verificar cache primeiro
        const cachedData = loadFromCache();
        if (cachedData) {
            console.log('📦 Usando cache');
            processAllData(cachedData);
            return;
        }
        
        // Carregar da planilha
        console.log('🌐 Buscando dados online...');
        const csvData = await fetchPublishedSheet();
        
        if (csvData) {
            saveToCache(csvData);
            processAllData(csvData);
            appState.isOnline = true;
            showNotification('✓ Dados atualizados', 'success');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        
        const cachedData = loadFromCache();
        if (cachedData) {
            console.log('⚠️ Usando cache expirado');
            processAllData(cachedData);
            showNotification('⚠️ Dados podem estar desatualizados', 'warning');
        }
        
        appState.isOnline = false;
    } finally {
        appState.isLoading = false;
        showLoading(false);
        updateConnectionStatus();
    }
}

// ===== BUSCAR DA PLANILHA =====
async function fetchPublishedSheet() {
    const csvUrl = CONFIG.PUBLISHED_URL.replace('/pubhtml', '/pub?output=csv');
    
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const csvText = await response.text();
    if (!csvText || csvText.trim() === '') throw new Error('Planilha vazia');
    
    return csvText;
}

// ===== PROCESSAR TODOS OS DADOS =====
function processAllData(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error('Planilha sem dados');
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    
    // Agrupar por mês/ano
    const dataByMonth = {};
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length >= headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            
            const month = parseInt(row.mes || '0');
            const year = parseInt(row.ano || '0');
            
            if (month > 0 && year > 0) {
                const key = `${year}-${month.toString().padStart(2, '0')}`;
                if (!dataByMonth[key]) dataByMonth[key] = [];
                dataByMonth[key].push(row);
            }
        }
    }
    
    appState.allData = dataByMonth;
    updateCurrentMonthData();
}

// ===== ATUALIZAR DADOS DO MÊS ATUAL =====
function updateCurrentMonthData() {
    const key = `${appState.currentYear}-${(appState.currentMonth + 1).toString().padStart(2, '0')}`;
    const monthData = appState.allData[key] || [];
    
    if (monthData.length > 0) {
        appState.apartments = processMonthData(monthData);
    } else {
        generateEmptyMonth();
    }
    
    updateUI();
}

// ===== PROCESSAR DADOS DO MÊS =====
function processMonthData(monthData) {
    const today = new Date();
    const dueDate = new Date(appState.currentYear, appState.currentMonth, CONFIG.DUE_DAY);
    const isCurrentMonthOverdue = today > dueDate;
    
    const apartments = monthData.map(row => {
        const apt = row.apto || '';
        const owner = row.responsavel || 'Não informado';
        const statusRaw = (row.status || '').toUpperCase().trim();
        const paymentDate = row.data_pagamento || '';
        const baseValue = parseFloat(row.valor || CONFIG.DEFAULT_VALUE) || CONFIG.DEFAULT_VALUE;
        const extraValue = parseFloat(row.contribuicao_extra || 0) || 0;
        const observations = row.observacoes || '';
        
        let status = 'pending';
        if (statusRaw === 'PAGO') {
            status = 'paid';
        } else if (isCurrentMonthOverdue) {
            status = 'overdue';
        }
        
        let paymentDateFormatted = 'Pendente';
        if (paymentDate) {
            try {
                const [day, month, year] = paymentDate.split('/').map(Number);
                const date = new Date(year, month - 1, day);
                paymentDateFormatted = formatDate(date);
            } catch (e) {}
        }
        
        return {
            apt: apt.toString(),
            owner: owner,
            status: status,
            paymentDate: paymentDate,
            baseValue: baseValue,
            extraValue: extraValue,
            totalValue: baseValue + extraValue,
            paymentDateFormatted: paymentDateFormatted,
            observations: observations,
            month: appState.currentMonth + 1,
            year: appState.currentYear,
            fromSheet: true
        };
    });
    
    return ensureAllApartments(apartments);
}

// ===== GERAR MÊS VAZIO =====
function generateEmptyMonth() {
    const today = new Date();
    const dueDate = new Date(appState.currentYear, appState.currentMonth, CONFIG.DUE_DAY);
    const isOverdue = today > dueDate;
    
    appState.apartments = CONFIG.APARTMENTS_LIST.map(aptNumber => {
        const status = isOverdue ? 'overdue' : 'pending';
        const baseValue = CONFIG.DEFAULT_VALUE; // Todos pagam 3.000 KZ
        
        return {
            apt: aptNumber,
            owner: `Responsável ${aptNumber}`,
            status: status,
            paymentDate: null,
            baseValue: baseValue,
            extraValue: 0,
            totalValue: baseValue,
            paymentDateFormatted: 'Pendente',
            observations: '',
            month: appState.currentMonth + 1,
            year: appState.currentYear,
            fromSheet: false
        };
    });
}

// ===== GARANTIR TODOS OS APARTAMENTOS =====
function ensureAllApartments(apartments) {
    const existingApts = apartments.map(a => a.apt);
    const completeList = [...apartments];
    
    CONFIG.APARTMENTS_LIST.forEach(aptNumber => {
        if (!existingApts.includes(aptNumber)) {
            const today = new Date();
            const dueDate = new Date(appState.currentYear, appState.currentMonth, CONFIG.DUE_DAY);
            const status = today > dueDate ? 'overdue' : 'pending';
            
            completeList.push({
                apt: aptNumber,
                owner: `Responsável ${aptNumber}`,
                status: status,
                paymentDate: null,
                baseValue: CONFIG.DEFAULT_VALUE,
                extraValue: 0,
                totalValue: CONFIG.DEFAULT_VALUE,
                paymentDateFormatted: 'Pendente',
                observations: '',
                month: appState.currentMonth + 1,
                year: appState.currentYear,
                fromSheet: false
            });
        }
    });
    
    return sortApartments(completeList);
}

// ===== ORDENAR =====
function sortApartments(list = appState.apartments) {
    return list.sort((a, b) => {
        const aNum = parseInt(a.apt);
        const bNum = parseInt(b.apt);
        
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        if (!isNaN(aNum)) return -1;
        if (!isNaN(bNum)) return 1;
        return a.apt.localeCompare(b.apt);
    });
}

// ===== ATUALIZAR UI =====
function updateUI() {
    calculateStats();
    renderTable();
    updateSummary();
    updateHistorySummary();
}

// ===== CALCULAR ESTATÍSTICAS =====
function calculateStats() {
    const totalApartments = appState.apartments.length;
    const paidApartments = appState.apartments.filter(a => a.status === 'paid').length;
    
    let totalToCollect = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let totalExtra = 0;
    
    appState.apartments.forEach(apt => {
        totalToCollect += apt.totalValue;
        totalExtra += apt.extraValue;
        
        if (apt.status === 'paid') {
            totalCollected += apt.totalValue;
        } else {
            totalPending += apt.totalValue;
        }
    });
    
    // Atualizar header
    safeSetText('total-collected', formatCurrency(totalCollected));
    safeSetText('total-pending', formatCurrency(totalPending));
    safeSetText('payment-count', `${paidApartments}/${totalApartments}`);
    
    // Atualizar resumo
    safeSetText('total-to-collect', formatCurrency(totalToCollect));
    safeSetText('summary-collected', formatCurrency(totalCollected));
    safeSetText('summary-pending', formatCurrency(totalPending));
    
    // Atualizar progresso
    const progressPercent = totalToCollect > 0 ? (totalCollected / totalToCollect) * 100 : 0;
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) progressFill.style.width = `${progressPercent}%`;
    safeSetText('progress-percent', `${Math.round(progressPercent)}%`);
    
    // Atualizar valor base
    const baseValueElement = document.getElementById('base-value');
    if (baseValueElement) {
        baseValueElement.textContent = formatCurrency(CONFIG.DEFAULT_VALUE);
    }
}

// ===== RESUMO DE HISTÓRICO =====
function updateHistorySummary() {
    const historySummary = document.getElementById('history-summary');
    if (!historySummary) return;
    
    let totalPaidAllTime = 0;
    let monthsWithData = 0;
    
    Object.keys(appState.allData).forEach(key => {
        const monthData = appState.allData[key];
        const paidInMonth = monthData.filter(row => 
            (row.status || '').toUpperCase() === 'PAGO'
        ).length;
        
        totalPaidAllTime += paidInMonth * CONFIG.DEFAULT_VALUE;
        if (paidInMonth > 0) monthsWithData++;
    });
    
    historySummary.innerHTML = `
        <h4><i class="fas fa-history"></i> Resumo Histórico</h4>
        <div class="history-stats">
            <div class="history-stat">
                <span>Total Arrecadado:</span>
                <strong>${formatCurrency(totalPaidAllTime)}</strong>
            </div>
            <div class="history-stat">
                <span>Meses registrados:</span>
                <strong>${monthsWithData}</strong>
            </div>
            <div class="history-stat">
                <span>Valor base:</span>
                <strong>${formatCurrency(CONFIG.DEFAULT_VALUE)}</strong>
            </div>
        </div>
        <button class="btn-action" onclick="showPaymentHistory()" style="margin-top: 10px; width: 100%;">
            <i class="fas fa-chart-line"></i> Ver Histórico Completo
        </button>
    `;
}

// ===== RENDERIZAR TABELA =====
function renderTable() {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    
    const filteredApartments = filterApartments();
    
    tableBody.innerHTML = filteredApartments.map(apartment => `
        <tr class="${apartment.status}">
            <td class="col-apt">
                <strong>${apartment.apt}</strong>
                ${apartment.apt === 'B1' ? '<span class="building-badge" title="Bloco B1">🏢</span>' : ''}
                ${!apartment.fromSheet ? '<span class="local-badge" title="Sem dados na planilha">📱</span>' : ''}
            </td>
            <td class="col-owner">
                ${apartment.owner}
                ${apartment.observations ? `
                    <span class="tooltip" title="${apartment.observations}">
                        <i class="fas fa-info-circle"></i>
                    </span>
                ` : ''}
            </td>
            <td class="col-status">
                <span class="status-badge status-${apartment.status}">
                    <i class="fas ${getStatusIcon(apartment.status)}"></i>
                    ${getStatusText(apartment.status)}
                </span>
            </td>
            <td class="col-date">
                ${apartment.paymentDateFormatted}
            </td>
            <td class="col-value">
                ${formatCurrency(apartment.totalValue)}
                ${apartment.extraValue > 0 ? `
                    <span class="extra-badge" title="Contribuição extra: ${formatCurrency(apartment.extraValue)}">
                        +${formatCurrency(apartment.extraValue)}
                    </span>
                ` : ''}
            </td>
            <td class="col-actions">
                <button class="btn-action" onclick="showApartmentDetails('${apartment.apt}')">
                    <i class="fas fa-eye"></i>
                    Detalhes
                </button>
            </td>
        </tr>
    `).join('');
}

// ===== FILTRAR =====
function filterApartments() {
    let filtered = [...appState.apartments];
    
    if (appState.filter !== 'all') {
        filtered = filtered.filter(apt => apt.status === appState.filter);
    }
    
    if (appState.searchTerm) {
        const term = appState.searchTerm.toLowerCase();
        filtered = filtered.filter(apt => 
            apt.apt.toLowerCase().includes(term) ||
            apt.owner.toLowerCase().includes(term) ||
            (apt.observations && apt.observations.toLowerCase().includes(term))
        );
    }
    
    return filtered;
}

// ===== NAVEGAÇÃO DE MESES =====
async function changeMonth(direction) {
    if (appState.isLoading) return;
    
    if (direction === 'next') {
        if (appState.currentMonth === 11) {
            appState.currentMonth = 0;
            appState.currentYear++;
        } else {
            appState.currentMonth++;
        }
    } else {
        if (appState.currentMonth === 0) {
            appState.currentMonth = 11;
            appState.currentYear--;
        } else {
            appState.currentMonth--;
        }
    }
    
    updateMonthDisplay();
    updateCurrentMonthData();
}

// ===== FUNÇÕES AUXILIARES =====
function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-AO', {
        style: 'currency',
        currency: 'AOA',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

function formatDate(date) {
    return date.toLocaleDateString('pt-AO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function getStatusIcon(status) {
    const icons = {
        paid: 'fa-check-circle',
        pending: 'fa-clock',
        overdue: 'fa-exclamation-circle'
    };
    return icons[status] || 'fa-question-circle';
}

function getStatusText(status) {
    const texts = {
        paid: 'Pago',
        pending: 'Pendente',
        overdue: 'Em Atraso'
    };
    return texts[status] || 'Desconhecido';
}

function updateMonthDisplay() {
    safeSetText('current-month-year', `${CONFIG.MONTH_NAMES[appState.currentMonth]} ${appState.currentYear}`);
}

function parseCSVLine(line) {
    const values = [];
    let currentValue = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    
    values.push(currentValue.trim());
    return values.map(v => v.replace(/^"|"$/g, ''));
}

// ===== DETALHES DO APARTAMENTO =====
window.showApartmentDetails = function(aptNumber) {
    console.log('Mostrando detalhes do apartamento:', aptNumber);
    
    const apartment = appState.apartments.find(a => a.apt === aptNumber);
    if (!apartment) {
        showNotification('Apartamento não encontrado', 'error');
        return;
    }
    
    const modalContent = `
        <div class="modal-details">
            <div class="detail-header">
                <h4><i class="fas fa-home"></i> Apartamento ${apartment.apt}</h4>
                <span class="status-badge status-${apartment.status}">
                    <i class="fas ${getStatusIcon(apartment.status)}"></i>
                    ${getStatusText(apartment.status)}
                </span>
            </div>
            
            <div class="detail-section">
                <h5><i class="fas fa-user"></i> Informações do Responsável</h5>
                <div class="detail-item">
                    <span class="detail-label">Nome:</span>
                    <span class="detail-value">${apartment.owner}</span>
                </div>
                
                ${apartment.observations ? `
                    <div class="detail-item">
                        <span class="detail-label">Observações:</span>
                        <span class="detail-value">${apartment.observations}</span>
                    </div>
                ` : ''}
            </div>
            
            <div class="detail-section">
                <h5><i class="fas fa-money-bill-wave"></i> Informações Financeiras</h5>
                <div class="detail-item">
                    <span class="detail-label">Cota Mensal:</span>
                    <span class="detail-value">${formatCurrency(apartment.baseValue)}</span>
                </div>
                
                ${apartment.extraValue > 0 ? `
                    <div class="detail-item extra-contribution">
                        <span class="detail-label">Contribuição Extra:</span>
                        <span class="detail-value">+ ${formatCurrency(apartment.extraValue)}</span>
                    </div>
                ` : ''}
                
                <div class="detail-item total-value">
                    <span class="detail-label">Valor Total:</span>
                    <span class="detail-value">${formatCurrency(apartment.totalValue)}</span>
                </div>
                
                <div class="detail-item">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value status-${apartment.status}">
                        <i class="fas ${getStatusIcon(apartment.status)}"></i>
                        ${getStatusText(apartment.status)}
                    </span>
                </div>
                
                <div class="detail-item">
                    <span class="detail-label">Data do Pagamento:</span>
                    <span class="detail-value">${apartment.paymentDateFormatted}</span>
                </div>
                
                <div class="detail-item">
                    <span class="detail-label">Vencimento:</span>
                    <span class="detail-value">
                        Dia ${CONFIG.DUE_DAY} de ${CONFIG.MONTH_NAMES[appState.currentMonth].toLowerCase()}
                    </span>
                </div>
            </div>
            
            <div class="detail-section">
                <h5><i class="fas fa-building"></i> Informações do Prédio</h5>
                <div class="detail-item">
                    <span class="detail-label">Bloco:</span>
                    <span class="detail-value">${CONFIG.BUILDING_NAME}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Valor Base:</span>
                    <span class="detail-value">${formatCurrency(CONFIG.DEFAULT_VALUE)}</span>
                </div>
            </div>
        </div>
    `;
    
    const modalContentEl = document.getElementById('modal-content');
    if (modalContentEl) {
        modalContentEl.innerHTML = modalContent;
    }
    
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('active');
    }
};

// ===== ATUALIZAÇÃO AUTOMÁTICA =====
function startAutoRefresh() {
    setInterval(async () => {
        if (appState.isOnline && !appState.isLoading) {
            await loadAllData();
        }
    }, CONFIG.CACHE_DURATION);
}

// ===== SETUP DE IMPRESSÃO =====
function setupPrintButtons() {
    const printSection = document.querySelector('.actions-content');
    if (printSection) {
        const printBtn = document.createElement('button');
        printBtn.className = 'action-btn';
        printBtn.innerHTML = '<i class="fas fa-print"></i> Imprimir Relatório';
        printBtn.onclick = printDetailedReport;
        printSection.appendChild(printBtn);
    }
}

function printDetailedReport() {
    const printWindow = window.open('', '_blank');
    
    const monthName = CONFIG.MONTH_NAMES[appState.currentMonth];
    const year = appState.currentYear;
    
    const paidApartments = appState.apartments.filter(a => a.status === 'paid');
    const pendingApartments = appState.apartments.filter(a => a.status !== 'paid');
    
    let totalCollected = 0;
    let totalPending = 0;
    
    appState.apartments.forEach(apt => {
        if (apt.status === 'paid') {
            totalCollected += apt.totalValue;
        } else {
            totalPending += apt.totalValue;
        }
    });
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório - ${CONFIG.BUILDING_NAME} - ${monthName} ${year}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .header h1 { color: #1e40af; }
                .building-info { 
                    background: #f3f4f6; 
                    padding: 15px; 
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .summary { margin-bottom: 30px; }
                .summary-grid { 
                    display: grid; 
                    grid-template-columns: repeat(3, 1fr); 
                    gap: 20px; 
                    margin-bottom: 20px;
                }
                .summary-card { 
                    border: 1px solid #ddd; 
                    padding: 15px; 
                    border-radius: 8px; 
                    text-align: center;
                }
                .summary-value { 
                    font-size: 24px; 
                    font-weight: bold; 
                    margin-top: 10px; 
                }
                .paid { color: #059669; }
                .pending { color: #d97706; }
                .total { color: #1e40af; }
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    margin-top: 20px;
                }
                th, td { 
                    border: 1px solid #ddd; 
                    padding: 10px; 
                    text-align: left;
                }
                th { 
                    background-color: #f3f4f6; 
                    font-weight: bold;
                }
                .status-paid { background-color: #d1fae5; }
                .status-pending { background-color: #fef3c7; }
                .status-overdue { background-color: #fee2e2; }
                .footer { 
                    margin-top: 30px; 
                    text-align: center; 
                    font-size: 12px; 
                    color: #666;
                }
                @media print {
                    .no-print { display: none; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${CONFIG.BUILDING_NAME} - Controle de Pagamentos</h1>
                <h2>${monthName} de ${year}</h2>
                <p>Relatório gerado em: ${formatDate(new Date())}</p>
            </div>
            
            <div class="building-info">
                <p><strong>Valor base por apartamento:</strong> ${formatCurrency(CONFIG.DEFAULT_VALUE)}</p>
                <p><strong>Vencimento:</strong> Dia ${CONFIG.DUE_DAY} de cada mês</p>
                <p><strong>Total de apartamentos:</strong> ${CONFIG.TOTAL_APARTMENTS}</p>
            </div>
            
            <div class="summary">
                <div class="summary-grid">
                    <div class="summary-card">
                        <h3>Total Arrecadado</h3>
                        <div class="summary-value paid">${formatCurrency(totalCollected)}</div>
                        <p>${paidApartments.length} apartamentos pagos</p>
                    </div>
                    <div class="summary-card">
                        <h3>A Receber</h3>
                        <div class="summary-value pending">${formatCurrency(totalPending)}</div>
                        <p>${pendingApartments.length} apartamentos pendentes</p>
                    </div>
                    <div class="summary-card">
                        <h3>Total Geral</h3>
                        <div class="summary-value total">${formatCurrency(totalCollected + totalPending)}</div>
                        <p>${CONFIG.TOTAL_APARTMENTS} apartamentos</p>
                    </div>
                </div>
            </div>
            
            <h3>Lista de Apartamentos</h3>
            <table>
                <thead>
                    <tr>
                        <th>APTO</th>
                        <th>RESPONSÁVEL</th>
                        <th>STATUS</th>
                        <th>DATA PAGAMENTO</th>
                        <th>VALOR (KZ)</th>
                        <th>OBSERVAÇÕES</th>
                    </tr>
                </thead>
                <tbody>
                    ${appState.apartments.map(apt => `
                        <tr class="status-${apt.status}">
                            <td><strong>${apt.apt}</strong></td>
                            <td>${apt.owner}</td>
                            <td>${getStatusText(apt.status)}</td>
                            <td>${apt.paymentDateFormatted}</td>
                            <td>${formatCurrency(apt.totalValue)}</td>
                            <td>${apt.observations || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div class="footer">
                <p>Sistema de Controle Financeiro - ${CONFIG.BUILDING_NAME}</p>
                <p>Relatório gerado automaticamente</p>
            </div>
            
            <div class="no-print" style="margin-top: 20px; text-align: center;">
                <button onclick="window.print()" style="padding: 10px 20px; background: #1e40af; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Imprimir
                </button>
                <button onclick="window.close()" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 5px; cursor: pointer; margin-left: 10px;">
                    Fechar
                </button>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
}

// ===== FUNÇÕES RESTANTES =====
function updateSummary() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
    const dateString = formatDate(now);
    safeSetText('last-update', `${dateString} às ${timeString}`);
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status') || createConnectionStatus();
    if (appState.isOnline) {
        statusElement.innerHTML = '<i class="fas fa-wifi"></i> Online';
        statusElement.className = 'status-online';
    } else {
        statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
        statusElement.className = 'status-offline';
    }
}

function createConnectionStatus() {
    const status = document.createElement('div');
    status.id = 'connection-status';
    status.style.cssText = `
        position: fixed;
        bottom: 70px;
        right: 20px;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 6px;
    `;
    document.body.appendChild(status);
    return status;
}

function showLoading(show) {
    let loader = document.getElementById('loading-overlay');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.id = 'loading-overlay';
        loader.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando dados...</p>
            </div>
        `;
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255, 255, 255, 0.9);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        `;
        document.body.appendChild(loader);
    }
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showNotification(message, type = 'info') {
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    
    const bgColor = {
        success: '#059669',
        error: '#dc2626',
        warning: '#d97706',
        info: '#2563eb'
    }[type] || '#2563eb';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 3000);
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Filtros
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.filter = btn.dataset.filter;
            renderTable();
        });
    });
    
    // Busca
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            appState.searchTerm = e.target.value;
            renderTable();
        });
    }
    
    // Navegação meses
    const prevMonth = document.getElementById('prev-month');
    const nextMonth = document.getElementById('next-month');
    
    if (prevMonth) prevMonth.addEventListener('click', () => changeMonth('prev'));
    if (nextMonth) nextMonth.addEventListener('click', () => changeMonth('next'));
    
    // Botões
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => loadAllData());
    
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportReport);
    
    // Modal
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalOverlay = document.getElementById('modal-overlay');
    
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalCancel) modalCancel.addEventListener('click', closeModal);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
}

// ===== FUNÇÕES GLOBAIS =====
window.closeModal = function() {
    document.getElementById('modal-overlay').classList.remove('active');
};

function exportReport() {
    const data = appState.apartments.map(apt => ({
        Apartamento: apt.apt,
        Responsável: apt.owner,
        Status: getStatusText(apt.status),
        'Valor Base': formatCurrency(apt.baseValue),
        'Contribuição Extra': formatCurrency(apt.extraValue),
        'Valor Total': formatCurrency(apt.totalValue),
        'Data Pagamento': apt.paymentDateFormatted,
        Observações: apt.observations
    }));
    
    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pagamentos-${CONFIG.BUILDING_NAME}-${CONFIG.MONTH_NAMES[appState.currentMonth]}-${appState.currentYear}.csv`;
    link.click();
}

function convertToCSV(data) {
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => 
        headers.map(header => {
            const value = obj[header];
            return value.includes(',') ? `"${value}"` : value;
        }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
}
