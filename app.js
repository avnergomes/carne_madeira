// Carne e Madeira PR - Dashboard Application
// ============================================

// Register Chart.js plugins globally except datalabels (we'll use it selectively)
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', {
    display: false  // Disable by default, enable only where needed
});

// Global State
const appState = {
    currentYear: 2013,
    currentMapType: 'ilpf',
    currentTab: 'mapa',
    data: {
        madeira: [],
        carne: [],
        geojson: null
    },
    charts: {},
    map: null
};

// Configuration
const CONFIG = {
    MAP_CENTER: [-24.7, -51.5],
    MAP_ZOOM: 7,
    YEARS: Array.from({length: 10}, (_, i) => 2013 + i),
    COLORS: {
        madeira: '#2c7a3e',
        carne: '#c44536',
        ilpf: ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84']
    }
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard iniciando...');
    setupEventListeners();
    await loadData();

    // Aguardar um pouco para garantir que o DOM está pronto
    setTimeout(() => {
        initializeMap();
        updateDashboard();
        hideLoading();
        console.log('Dashboard carregado!');
    }, 100);
});

function setupEventListeners() {
    // Year slider
    document.getElementById('yearSlider').addEventListener('input', (e) => {
        appState.currentYear = parseInt(e.target.value);
        document.getElementById('yearValue').textContent = appState.currentYear;
        updateDashboard();
    });

    // Map type selector
    document.getElementById('mapType').addEventListener('change', (e) => {
        appState.currentMapType = e.target.value;
        updateMap();
    });

    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabName);
        });
    });
}

// ============================================
// Data Loading
// ============================================

async function loadData() {
    try {
        // Load all data in parallel
        const [madeiraData, carneData, geojsonData] = await Promise.all([
            fetch('data/madeira.json').then(r => r.json()),
            fetch('data/carne.json').then(r => r.json()),
            fetch('mun_PR.json').then(r => r.json())
        ]);

        appState.data.madeira = madeiraData;
        appState.data.carne = carneData;
        appState.data.geojson = geojsonData;

        console.log('Data loaded successfully');
        console.log(`Madeira: ${madeiraData.length} records`);
        console.log(`Carne: ${carneData.length} records`);
        console.log(`GeoJSON: ${geojsonData.features.length} municipalities`);
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Erro ao carregar dados. Verifique se os arquivos JSON estão no diretório correto.');
    }
}

// ============================================
// Dashboard Update
// ============================================

function updateDashboard() {
    updateMetrics();
    updateMap();
    updateCharts();
    updateRankings();
}

function updateMetrics() {
    const year = appState.currentYear.toString();

    // Filter data for current year
    const madeiraYear = appState.data.madeira.filter(d => d.ano === year);
    const carneYear = appState.data.carne.filter(d => d.ano === year);

    // Calculate totals
    const totalMadeira = madeiraYear.reduce((sum, d) => sum + d.valor, 0);
    const totalCarne = carneYear.reduce((sum, d) => sum + d.valor, 0);

    // Count municipalities with both
    const munMadeira = new Set(madeiraYear.filter(d => d.valor > 0).map(d => d.cod_ibge));
    const munCarne = new Set(carneYear.filter(d => d.valor > 0).map(d => d.cod_ibge));
    const munAmbos = new Set([...munMadeira].filter(x => munCarne.has(x)));

    // Update UI
    document.getElementById('metricMadeira').textContent = (totalMadeira / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('metricCarne').textContent = (totalCarne / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('metricMunicipios').textContent = munAmbos.size;
}

// ============================================
// Map Functions
// ============================================

function initializeMap() {
    try {
        console.log('Inicializando mapa...');

        // Verificar se o container existe
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('Container do mapa não encontrado!');
            return;
        }

        // Create map
        appState.map = L.map('map', {
            center: CONFIG.MAP_CENTER,
            zoom: CONFIG.MAP_ZOOM,
            zoomControl: true
        });

        console.log('Mapa criado, adicionando tiles...');

        // Add base layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CARTO',
            maxZoom: 19
        }).addTo(appState.map);

        console.log('Mapa inicializado com sucesso!');
    } catch (error) {
        console.error('Erro ao inicializar mapa:', error);
    }
}

function updateMap() {
    if (!appState.map) {
        console.error('Mapa não inicializado!');
        return;
    }

    if (!appState.data.geojson) {
        console.error('GeoJSON não carregado!');
        return;
    }

    console.log('Atualizando mapa...');

    // Remove existing layers
    appState.map.eachLayer(layer => {
        if (layer instanceof L.GeoJSON) {
            appState.map.removeLayer(layer);
        }
    });

    const year = appState.currentYear.toString();
    const mapType = appState.currentMapType;

    console.log(`Ano: ${year}, Tipo: ${mapType}`);

    // Get data for current year
    const madeiraYear = appState.data.madeira.filter(d => d.ano === year);
    const carneYear = appState.data.carne.filter(d => d.ano === year);

    console.log(`Dados filtrados - Madeira: ${madeiraYear.length}, Carne: ${carneYear.length}`);

    // Create lookup objects
    const madeiraLookup = {};
    const carneLookup = {};

    madeiraYear.forEach(d => {
        madeiraLookup[d.cod_ibge] = d.valor;
    });

    carneYear.forEach(d => {
        carneLookup[d.cod_ibge] = d.valor;
    });

    // Add GeoJSON layer
    try {
        console.log(`Adicionando GeoJSON com ${appState.data.geojson.features.length} features...`);

        const geoJsonLayer = L.geoJSON(appState.data.geojson, {
            style: (feature) => getFeatureStyle(feature, mapType, madeiraLookup, carneLookup),
            onEachFeature: (feature, layer) => {
                const codarea = feature.properties.CodIbge;
                const nome = feature.properties.Municipio || 'Desconhecido';
                const madeira = madeiraLookup[codarea] || 0;
                const carne = carneLookup[codarea] || 0;

                let popupContent = `<strong>${nome}</strong><br>`;

                if (mapType === 'ilpf') {
                    popupContent += `Madeira: R$ ${madeira.toLocaleString('pt-BR')} mil<br>`;
                    popupContent += `Carne: R$ ${carne.toLocaleString('pt-BR')} mil`;
                } else if (mapType === 'madeira') {
                    popupContent += `Valor: R$ ${madeira.toLocaleString('pt-BR')} mil`;
                } else {
                    popupContent += `Valor: R$ ${carne.toLocaleString('pt-BR')} mil`;
                }

                layer.bindPopup(popupContent);
            }
        }).addTo(appState.map);

        console.log('GeoJSON adicionado com sucesso!');

        // Invalidate size to ensure proper rendering
        setTimeout(() => {
            appState.map.invalidateSize();
        }, 100);

        updateMapLegend(mapType);
    } catch (error) {
        console.error('Erro ao adicionar GeoJSON:', error);
    }
}

function getFeatureStyle(feature, mapType, madeiraLookup, carneLookup) {
    const codarea = feature.properties.CodIbge;
    const madeira = madeiraLookup[codarea] || 0;
    const carne = carneLookup[codarea] || 0;

    let fillColor = '#cccccc';
    let fillOpacity = 0.5;

    if (mapType === 'ilpf') {
        // Calculate ILPF index (normalized combination)
        const maxMadeira = Math.max(...Object.values(madeiraLookup));
        const maxCarne = Math.max(...Object.values(carneLookup));

        const normMadeira = maxMadeira > 0 ? madeira / maxMadeira : 0;
        const normCarne = maxCarne > 0 ? carne / maxCarne : 0;
        const ilpfIndex = (normMadeira + normCarne) / 2;

        fillColor = getColorILPF(ilpfIndex);
        fillOpacity = 0.7;
    } else if (mapType === 'madeira') {
        const maxVal = Math.max(...Object.values(madeiraLookup));
        fillColor = getColorMadeira(madeira, maxVal);
        fillOpacity = 0.7;
    } else if (mapType === 'carne') {
        const maxVal = Math.max(...Object.values(carneLookup));
        fillColor = getColorCarne(carne, maxVal);
        fillOpacity = 0.7;
    }

    return {
        fillColor: fillColor,
        weight: 1,
        opacity: 1,
        color: '#white',
        fillOpacity: fillOpacity
    };
}

function getColorILPF(value) {
    const colors = CONFIG.COLORS.ilpf;
    const index = Math.min(Math.floor(value * colors.length), colors.length - 1);
    return colors[index];
}

function getColorMadeira(value, max) {
    if (value === 0) return '#f0f0f0';
    const intensity = Math.min(value / max, 1);
    const green = Math.floor(122 + (255 - 122) * (1 - intensity));
    return `rgb(44, ${green}, 62)`;
}

function getColorCarne(value, max) {
    if (value === 0) return '#f0f0f0';
    const intensity = Math.min(value / max, 1);
    const lightness = Math.floor(100 - (45 * intensity));
    return `hsl(6, 56%, ${lightness}%)`;
}

function updateMapLegend(mapType) {
    const legend = document.getElementById('mapLegend');

    if (mapType === 'ilpf') {
        legend.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Índice ILPF</div>
            <div class="legend-item">
                <div class="legend-color" style="background: ${CONFIG.COLORS.ilpf[0]}"></div>
                <span>Baixo</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: ${CONFIG.COLORS.ilpf[3]}"></div>
                <span>Médio</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: ${CONFIG.COLORS.ilpf[6]}"></div>
                <span>Alto</span>
            </div>
        `;
    } else if (mapType === 'madeira') {
        legend.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Valor - Madeira (R$ mil)</div>
            <div class="legend-item">
                <div class="legend-color" style="background: #a6d96a"></div>
                <span>Baixo</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #2c7a3e"></div>
                <span>Alto</span>
            </div>
        `;
    } else {
        legend.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Valor - Carne (R$ mil)</div>
            <div class="legend-item">
                <div class="legend-color" style="background: #fc8d59"></div>
                <span>Baixo</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #c44536"></div>
                <span>Alto</span>
            </div>
        `;
    }
}

// ============================================
// Charts Functions
// ============================================

function updateCharts() {
    // Only create charts when on series tab
    if (appState.currentTab === 'series') {
        createTimeSeriesCharts();
        createMunicipiosChart();
    }
}

function createTimeSeriesCharts() {
    // Aggregate data by year
    const madeiraByYear = {};
    const carneByYear = {};

    appState.data.madeira.forEach(d => {
        if (!madeiraByYear[d.ano]) madeiraByYear[d.ano] = 0;
        madeiraByYear[d.ano] += d.valor;
    });

    appState.data.carne.forEach(d => {
        if (!carneByYear[d.ano]) carneByYear[d.ano] = 0;
        carneByYear[d.ano] += d.valor;
    });

    const years = CONFIG.YEARS.map(y => y.toString());
    const madeiraValues = years.map(y => (madeiraByYear[y] || 0) / 1000); // Convert to millions
    const carneValues = years.map(y => (carneByYear[y] || 0) / 1000); // Convert to millions

    // Combined comparison chart
    createOrUpdateChart('chartComparacao', {
        type: 'line',
        data: {
            labels: years,
            datasets: [
                {
                    label: 'Madeira',
                    data: madeiraValues,
                    borderColor: CONFIG.COLORS.madeira,
                    backgroundColor: CONFIG.COLORS.madeira + '20',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                },
                {
                    label: 'Carne',
                    data: carneValues,
                    borderColor: CONFIG.COLORS.carne,
                    backgroundColor: CONFIG.COLORS.carne + '20',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += 'R$ ' + context.parsed.y.toLocaleString('pt-BR') + 'M';
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => `R$ ${value.toLocaleString('pt-BR')}M`
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function createMunicipiosChart() {
    const municipiosByYear = CONFIG.YEARS.map(year => {
        const yearStr = year.toString();
        const madeiraYear = appState.data.madeira.filter(d => d.ano === yearStr);
        const carneYear = appState.data.carne.filter(d => d.ano === yearStr);

        const munMadeira = new Set(madeiraYear.filter(d => d.valor > 0).map(d => d.cod_ibge));
        const munCarne = new Set(carneYear.filter(d => d.valor > 0).map(d => d.cod_ibge));
        const munAmbos = new Set([...munMadeira].filter(x => munCarne.has(x)));

        return munAmbos.size;
    });

    createOrUpdateChart('chartAmbos', {
        type: 'bar',
        data: {
            labels: CONFIG.YEARS.map(y => y.toString()),
            datasets: [{
                label: 'Municípios com ambas produções',
                data: municipiosByYear,
                backgroundColor: CONFIG.COLORS.ilpf[5]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    formatter: (value) => value,
                    font: {
                        weight: 'bold',
                        size: 12
                    },
                    color: '#333'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 400,
                    ticks: {
                        stepSize: 50
                    }
                }
            }
        }
    });
}

function createOrUpdateChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Destroy existing chart
    if (appState.charts[canvasId]) {
        appState.charts[canvasId].destroy();
    }

    // Create new chart
    appState.charts[canvasId] = new Chart(canvas, config);
}

// ============================================
// Rankings
// ============================================

function updateRankings() {
    const year = appState.currentYear.toString();

    // Get data for current year
    const madeiraYear = appState.data.madeira.filter(d => d.ano === year);
    const carneYear = appState.data.carne.filter(d => d.ano === year);

    // Calculate max values for scaling
    const maxMadeira = Math.max(...madeiraYear.map(d => d.valor));
    const maxCarne = Math.max(...carneYear.map(d => d.valor));

    // Create lookup objects for combined ranking
    const madeiraLookup = {};
    const carneLookup = {};

    madeiraYear.forEach(d => {
        madeiraLookup[d.cod_ibge] = d.valor;
    });

    carneYear.forEach(d => {
        carneLookup[d.cod_ibge] = d.valor;
    });

    // Get all unique municipalities
    const allMunicipios = new Set([
        ...madeiraYear.map(d => d.cod_ibge),
        ...carneYear.map(d => d.cod_ibge)
    ]);

    // Calculate scaled combined score for each municipality
    const combinedRanking = [];

    allMunicipios.forEach(codIbge => {
        const madeiraValor = madeiraLookup[codIbge] || 0;
        const carneValor = carneLookup[codIbge] || 0;

        // Scale to 0-1
        const madeiraScaled = maxMadeira > 0 ? madeiraValor / maxMadeira : 0;
        const carneScaled = maxCarne > 0 ? carneValor / maxCarne : 0;

        // Combined score (sum of scaled values)
        const combinedScore = madeiraScaled + carneScaled;

        // Get municipality name
        const madeiraData = madeiraYear.find(d => d.cod_ibge === codIbge);
        const carneData = carneYear.find(d => d.cod_ibge === codIbge);
        const municipio = madeiraData?.municipio || carneData?.municipio || 'Desconhecido';

        combinedRanking.push({
            cod_ibge: codIbge,
            municipio: municipio,
            combinedScore: combinedScore,
            madeiraValor: madeiraValor,
            carneValor: carneValor,
            madeiraScaled: madeiraScaled,
            carneScaled: carneScaled
        });
    });

    // Sort by combined score and get top 10
    const top10Combined = combinedRanking
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, 10);

    // Update Combined ranking
    const combinedHtml = top10Combined.map((d, i) => `
        <div class="ranking-item">
            <div class="ranking-position ${i < 3 ? 'top-' + (i+1) : ''}">${i + 1}</div>
            <div class="ranking-name">${d.municipio}</div>
            <div class="ranking-value">
                🌲 ${(d.madeiraScaled * 100).toFixed(0)}% +
                🥩 ${(d.carneScaled * 100).toFixed(0)}% =
                ${(d.combinedScore * 100).toFixed(0)}
            </div>
        </div>
    `).join('');
    document.getElementById('rankingCombinado').innerHTML = combinedHtml;

    // Top 10 for individual rankings
    const top10Madeira = madeiraYear
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    const top10Carne = carneYear
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 10);

    // Update Madeira ranking
    const madeiraHtml = top10Madeira.map((d, i) => `
        <div class="ranking-item">
            <div class="ranking-position ${i < 3 ? 'top-' + (i+1) : ''}">${i + 1}</div>
            <div class="ranking-name">${d.municipio}</div>
            <div class="ranking-value">R$ ${d.valor.toLocaleString('pt-BR')} mil</div>
        </div>
    `).join('');
    document.getElementById('rankingMadeira').innerHTML = madeiraHtml;

    // Update Carne ranking
    const carneHtml = top10Carne.map((d, i) => `
        <div class="ranking-item">
            <div class="ranking-position ${i < 3 ? 'top-' + (i+1) : ''}">${i + 1}</div>
            <div class="ranking-name">${d.municipio}</div>
            <div class="ranking-value">R$ ${d.valor.toLocaleString('pt-BR')} mil</div>
        </div>
    `).join('');
    document.getElementById('rankingCarne').innerHTML = carneHtml;
}

// ============================================
// Tab Navigation
// ============================================

function switchTab(tabName) {
    appState.currentTab = tabName;

    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Resize map if switching to map tab
    if (tabName === 'mapa' && appState.map) {
        setTimeout(() => appState.map.invalidateSize(), 100);
    }

    // Update charts if switching to series tab
    if (tabName === 'series') {
        updateCharts();
    }
}

// ============================================
// Utilities
// ============================================

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('hidden');
    setTimeout(() => overlay.style.display = 'none', 300);
}
