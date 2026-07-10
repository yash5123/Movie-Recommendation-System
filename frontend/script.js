document.addEventListener('DOMContentLoaded', () => {
    // Navigation Tabs
    const navSearchBtn = document.getElementById('nav-search-btn');
    const navResultsBtn = document.getElementById('nav-results-btn');
    const pageSearch = document.getElementById('page-search');
    const pageResults = document.getElementById('page-results');

    // Search Page Elements
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-btn');
    const autocompleteList = document.getElementById('autocomplete-list');
    const sourceCard = document.getElementById('source-card');
    const activeProfileBlock = document.getElementById('active-profile');
    
    // Telemetry / Details
    const telemetryMode = document.getElementById('telemetry-mode');
    const telemetryEngine = document.getElementById('telemetry-engine');

    // Recommendations Page Elements
    const resultsContent = document.getElementById('results-content');
    const methodBadge = document.getElementById('method-badge');
    const recommendationsGrid = document.getElementById('recommendations-grid');
    
    // States
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const errorDismiss = document.getElementById('error-dismiss');

    let debounceTimer;
    let activeIndex = -1;
    let suggestions = [];

    // Tab Navigation Logic
    function switchTab(pageId) {
        if (pageId === 'search') {
            pageSearch.classList.add('active-page');
            pageResults.classList.remove('active-page');
            navSearchBtn.classList.add('active');
            navResultsBtn.classList.remove('active');
        } else if (pageId === 'results') {
            pageResults.classList.add('active-page');
            pageSearch.classList.remove('active-page');
            navResultsBtn.classList.add('active');
            navSearchBtn.classList.remove('active');
        }
    }

    navSearchBtn.addEventListener('click', () => switchTab('search'));
    navResultsBtn.addEventListener('click', () => {
        if (!navResultsBtn.disabled) {
            switchTab('results');
        }
    });

    // Autocomplete Input Logic
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(debounceTimer);

        if (query.length > 0) {
            clearBtn.hidden = false;
            debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
        } else {
            clearBtn.hidden = true;
            resetState();
        }
    });

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.hidden = true;
        resetState();
        searchInput.focus();
    });

    searchInput.addEventListener('keydown', (e) => {
        const items = autocompleteList.querySelectorAll('.autocomplete-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            updateActiveItem(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex > -1 && activeIndex < items.length) {
                selectMovie(suggestions[activeIndex]);
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            hideSuggestions();
        }
    });

    errorDismiss.addEventListener('click', () => {
        errorState.hidden = true;
        emptyState.hidden = false;
        telemetryMode.textContent = 'Idle';
    });

    function resetState() {
        hideSuggestions();
        activeProfileBlock.hidden = true;
        sourceCard.innerHTML = '';
        navResultsBtn.disabled = true;
        resultsContent.hidden = true;
        emptyState.hidden = false;
        telemetryMode.textContent = 'Idle';
        telemetryEngine.textContent = 'Hybrid';
        switchTab('search');
    }

    async function fetchSuggestions(query) {
        try {
            const res = await fetch(`/search?query=${encodeURIComponent(query)}&limit=8`);
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            suggestions = data.results;
            renderSuggestions();
        } catch (err) {
            console.error(err);
        }
    }

    function renderSuggestions() {
        autocompleteList.innerHTML = '';
        activeIndex = -1;

        if (suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        suggestions.forEach((movie, index) => {
            const li = document.createElement('li');
            li.className = 'autocomplete-item';
            li.role = 'option';
            li.id = `suggestion-${index}`;
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'ac-title';
            titleSpan.textContent = movie.title;

            const metaSpan = document.createElement('span');
            metaSpan.className = 'ac-meta';
            metaSpan.textContent = movie.genres.split('|').slice(0, 2).join(', ');

            li.appendChild(titleSpan);
            li.appendChild(metaSpan);

            li.addEventListener('click', () => selectMovie(movie));
            autocompleteList.appendChild(li);
        });

        autocompleteList.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
    }

    function updateActiveItem(items) {
        items.forEach((item, index) => {
            if (index === activeIndex) {
                item.classList.add('active');
                searchInput.setAttribute('aria-activedescendant', item.id);
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    function hideSuggestions() {
        autocompleteList.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
        suggestions = [];
        activeIndex = -1;
    }

    function selectMovie(movie) {
        searchInput.value = movie.title;
        hideSuggestions();
        getRecommendations(movie.movie_id);
    }

    async function getRecommendations(movieId) {
        // Prepare view states for search
        emptyState.hidden = true;
        resultsContent.hidden = true;
        errorState.hidden = true;
        loadingState.hidden = false;
        telemetryMode.textContent = 'Searching...';
        
        // Show result view immediately during load state
        navResultsBtn.disabled = false;

        try {
            const res = await fetch(`/recommend/${movieId}?n=10`);
            if (!res.ok) throw new Error('Could not retrieve recommendations');
            const data = await res.json();
            renderResults(data);
        } catch (err) {
            loadingState.hidden = true;
            errorMessage.textContent = err.message;
            errorState.hidden = false;
            telemetryMode.textContent = 'Error';
        }
    }

    function renderResults(data) {
        loadingState.hidden = true;

        const source = data.source_movie;
        const recs = data.recommendations;

        const formattedMethod = data.method === 'collaborative' ? 'User preference' : 'Thematic similarity';
        telemetryEngine.textContent = formattedMethod;
        telemetryMode.textContent = 'Ready';

        // Render Active Card details on Page 1
        let imdbHtml = '';
        if (source.imdb_id) {
            imdbHtml = `<a href="https://www.imdb.com/title/${source.imdb_id}" target="_blank" class="imdb-stamp">IMDb Page</a>`;
        }

        sourceCard.innerHTML = `
            <div class="source-title">${source.title}</div>
            <div class="source-meta">
                ${source.genres.split('|').map(g => `<span class="catalog-tag">${g}</span>`).join('')}
                ${imdbHtml}
            </div>
        `;
        activeProfileBlock.hidden = false;

        // Render Recommendations on Page 2
        methodBadge.textContent = formattedMethod;
        methodBadge.className = `method-badge ${data.method}`;

        recommendationsGrid.innerHTML = '';
        recs.forEach((rec, index) => {
            const row = document.createElement('div');
            row.className = 'rec-row';
            row.style.animationDelay = `${index * 60}ms`;

            let recImdbHtml = '';
            if (rec.imdb_id) {
                recImdbHtml = `<a href="https://www.imdb.com/title/${rec.imdb_id}" target="_blank" class="imdb-stamp" style="font-size:10px; padding:2px 6px;">IMDb</a>`;
            }

            row.innerHTML = `
                <div class="rec-rank">${String(index + 1).padStart(2, '0')}</div>
                <div class="rec-details">
                    <div class="rec-title-wrap">
                        <span class="rec-title">${rec.title}</span>
                        ${recImdbHtml}
                    </div>
                    <div class="rec-genres-wrap">
                        ${rec.genres.split('|').map(g => `<span class="rec-genre">${g}</span>`).join('')}
                    </div>
                </div>
                <div class="rec-meta-info">
                    ID: ${rec.movie_id}
                </div>
                <div class="rec-match">
                    <span class="match-val">${Math.round(rec.similarity_score * 100)}%</span>
                    <span class="match-label">MATCH</span>
                </div>
            `;
            recommendationsGrid.appendChild(row);
        });

        resultsContent.hidden = false;
    }
});
