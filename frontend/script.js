document.addEventListener('DOMContentLoaded', () => {
    // Search Console Elements
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-btn');
    const autocompleteList = document.getElementById('autocomplete-list');
    const sourceCard = document.getElementById('source-card');
    const activeProfileBlock = document.getElementById('active-profile');

    // Telemetry / Status Elements
    const telemetryMode = document.getElementById('telemetry-mode');
    const telemetryEngine = document.getElementById('telemetry-engine');

    // Recommendations Dashboard Elements
    const resultsContent = document.getElementById('results-content');
    const methodBadge = document.getElementById('method-badge');
    const recommendationsGrid = document.getElementById('recommendations-grid');
    const resultsPanel = document.getElementById('results-panel');

    // State Containers
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const errorDismiss = document.getElementById('error-dismiss');

    let debounceTimer;
    let activeIndex = -1;
    let suggestions = [];

    // Autocomplete Input Key Listeners
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim();
        clearTimeout(debounceTimer);

        if (query.length > 0) {
            clearBtn.hidden = false;
            debounceTimer = setTimeout(() => fetchSuggestions(query), 250);
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
            } else if (items.length > 0) {
                // Select first option if Enter is hit without navigation
                selectMovie(suggestions[0]);
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            hideSuggestions();
        }
    });

    errorDismiss.addEventListener('click', () => {
        errorState.hidden = true;
        emptyState.hidden = false;
        telemetryMode.textContent = 'idle';
    });

    // Reset View State to Idle
    function resetState() {
        hideSuggestions();
        activeProfileBlock.hidden = true;
        sourceCard.innerHTML = '';
        resultsContent.hidden = true;
        emptyState.hidden = false;
        loadingState.hidden = true;
        errorState.hidden = true;
        telemetryMode.textContent = 'idle';
        telemetryEngine.textContent = 'ratings & genre hybrid';
    }

    // Query movies backend API
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

    // Render drop-down list items
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
            titleSpan.textContent = movie.title.toLowerCase();

            const metaSpan = document.createElement('span');
            metaSpan.className = 'ac-meta';
            const genresList = movie.genres.split('|').slice(0, 2).join(', ').toLowerCase();
            metaSpan.textContent = `${movie.year} · ${genresList}`;

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

    // Retrieve hybrid recommendations for selected film
    async function getRecommendations(movieId) {
        emptyState.hidden = true;
        resultsContent.hidden = true;
        errorState.hidden = true;
        loadingState.hidden = false;
        telemetryMode.textContent = 'calculating...';

        try {
            const res = await fetch(`/recommend/${movieId}?n=10`);
            if (!res.ok) throw new Error('Could not retrieve recommendations');
            const data = await res.json();
            renderResults(data);

            // Smoothly scroll to results panel on smaller screens
            if (window.innerWidth < 900) {
                resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (err) {
            loadingState.hidden = true;
            errorMessage.textContent = err.message.toLowerCase();
            errorState.hidden = false;
            telemetryMode.textContent = 'error';
        }
    }

    function renderResults(data) {
        loadingState.hidden = true;

        const source = data.source_movie;
        const recs = data.recommendations;

        const formattedMethod = data.method === 'collaborative' ? 'community ratings' : 'similar genres & tags';
        telemetryEngine.textContent = formattedMethod;
        telemetryMode.textContent = 'ready';

        // Render profile card details
        let imdbHtml = '';
        if (source.imdb_id) {
            imdbHtml = `<a href="https://www.imdb.com/title/${source.imdb_id}" target="_blank" class="imdb-stamp">imdb link</a>`;
        }

        let ratingHtml = '';
        if (source.rating_count > 0) {
            ratingHtml = `<span class="rating-badge">${source.avg_rating.toFixed(1)} / 5</span><span class="rating-count">(${source.rating_count.toLocaleString()} user ratings)</span>`;
        } else {
            ratingHtml = `<span class="rating-badge">— / 5</span><span class="rating-count">(no ratings yet)</span>`;
        }

        sourceCard.innerHTML = `
            <div class="source-title">${source.title.toLowerCase()}</div>
            <div class="source-meta">
                ${source.genres.split('|').map(g => `<span class="catalog-tag">${g.toLowerCase()}</span>`).join('')}
                ${imdbHtml}
            </div>
            <div class="source-rating">
                ${ratingHtml}
            </div>
        `;
        activeProfileBlock.hidden = false;

        // Render similar films list
        methodBadge.textContent = formattedMethod;
        methodBadge.className = `method-badge ${data.method}`;

        recommendationsGrid.innerHTML = '';
        recs.forEach((rec, index) => {
            const row = document.createElement('div');
            row.className = 'rec-row';
            row.style.animationDelay = `${index * 50}ms`;

            let recImdbHtml = '';
            if (rec.imdb_id) {
                recImdbHtml = `<a href="https://www.imdb.com/title/${rec.imdb_id}" target="_blank" class="imdb-stamp">imdb</a>`;
            }

            row.innerHTML = `
                <div class="rec-rank">${String(index + 1).padStart(2, '0')}</div>
                <div class="rec-details">
                    <div class="rec-title-wrap">
                        <span class="rec-title">${rec.title.toLowerCase()}</span>
                        ${recImdbHtml}
                    </div>
                    <div class="rec-genres-wrap">
                        ${rec.genres.split('|').map(g => `<span class="rec-genre">${g.toLowerCase()}</span>`).join('')}
                    </div>
                </div>
                <div class="rec-match">
                    <span class="match-val">${Math.round(rec.similarity_score * 100)}%</span>
                    <span class="match-label">match</span>
                </div>
            `;

            // Allow row items to be clicked to fetch recommendations for *them* as well
            row.querySelector('.rec-title').addEventListener('click', (e) => {
                e.preventDefault();
                searchInput.value = rec.title;
                getRecommendations(rec.movie_id);
            });

            recommendationsGrid.appendChild(row);
        });

        resultsContent.hidden = false;
    }
});

