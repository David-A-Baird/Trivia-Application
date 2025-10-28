// Wait until DOM is ready before querying elements
document.addEventListener('DOMContentLoaded', () => {
    const triviaForm = document.getElementById('triviaForm');
    const questionsContainer = document.getElementById('questionsContainer');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const rememberEl = document.getElementById('rememberCreds');
    const clearCredsBtn = document.getElementById('clearCreds');
    const loginBtn = document.getElementById('loginBtn');
    const loginContainer = document.getElementById('loginContainer');

    if (!triviaForm) {
        console.error('triviaForm not found in DOM');
        return;
    }

    // Load saved credentials (if any) into the form
    loadSavedCredentials(usernameEl, passwordEl, rememberEl);

    // Clear saved credentials button
    if (clearCredsBtn) {
        clearCredsBtn.addEventListener('click', () => {
            clearSavedCredentials();
            if (usernameEl) usernameEl.value = '';
            if (passwordEl) passwordEl.value = '';
            if (rememberEl) rememberEl.checked = false;
            alert('Saved credentials cleared.');
        });
    }

    // Listen for the form submit event (button type="submit")
    triviaForm.addEventListener('submit', async (event) => {
        event.preventDefault();

    const categoryEl = document.getElementById('category');
        const difficultyEl = document.getElementById('difficulty');
        const numQuestionsEl = document.getElementById('numQuestions');

        // Read and validate number of questions (OpenTDB accepts 1-50)
        let amount = 5;
        if (numQuestionsEl) {
            const parsed = parseInt(numQuestionsEl.value, 10);
            if (!Number.isNaN(parsed)) amount = parsed;
        }
        amount = Math.max(1, Math.min(50, amount));

        const category = categoryEl ? categoryEl.value : '';
        const difficulty = difficultyEl ? difficultyEl.value : '';
        const responseType = document.getElementById('type') ? document.getElementById('type').value : 'multiple';

        // Optionally save credentials if user requested it
        saveCredentialsIfRequested(usernameEl, passwordEl, rememberEl);

        try {
            const response = await fetch(`https://opentdb.com/api.php?amount=${amount}&category=${category}&difficulty=${difficulty}&type=${responseType}`);
            const data = await response.json();
            if (typeof displayQuestions === 'function') {
                // Initialize single-question flow
                startQuiz(data.results, questionsContainer);
            } else {
                console.warn('displayQuestions function not defined; received data:', data.results);
                // Fallback: show JSON in the questionsContainer
                if (questionsContainer) {
                    questionsContainer.textContent = JSON.stringify(data.results, null, 2);
                }
            }
        } catch (error) {
            console.error('Error fetching trivia questions:', error);
        }
    });

    // Login button behavior: save credentials if requested, then show trivia form
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            // Optionally validate username/password here (simple demo: require username)
            const username = usernameEl ? usernameEl.value.trim() : '';
            if (!username) {
                alert('Please enter a username to continue.');
                return;
            }

            // Save credentials if requested
            saveCredentialsIfRequested(usernameEl, passwordEl, rememberEl);

            // Hide login container and show trivia form
            if (loginContainer) loginContainer.classList.add('hidden');
            if (triviaForm) triviaForm.classList.remove('hidden');
        });
    }

    // View Summary button
    const viewSummaryBtn = document.getElementById('viewSummaryBtn');
    if (viewSummaryBtn) {
        viewSummaryBtn.addEventListener('click', () => {
            const rawCreds = localStorage.getItem(CRED_KEY);
            const user = rawCreds ? JSON.parse(rawCreds).username : null;
            if (!user) {
                alert('No user saved. Please login first (enter username and optionally remember).');
                return;
            }
            renderSummary(user);
            // show summary in questions container
            if (triviaForm) triviaForm.classList.add('hidden');
            if (loginContainer) loginContainer.classList.remove('hidden');
        });
    }

    // Resume button wiring: show if saved progress exists for the current username
    const resumeBtn = document.getElementById('resumeBtn');
    function updateResumeButtonVisibility() {
        const uname = usernameEl ? usernameEl.value.trim() : '';
        if (!resumeBtn) return;
        if (!uname) {
            resumeBtn.classList.add('hidden');
            return;
        }
        const saved = loadQuizProgress(uname);
        if (saved) resumeBtn.classList.remove('hidden'); else resumeBtn.classList.add('hidden');
    }
    // initial visibility
    updateResumeButtonVisibility();
    // update when username changes
    if (usernameEl) usernameEl.addEventListener('input', updateResumeButtonVisibility);
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            const uname = usernameEl ? usernameEl.value.trim() : '';
            if (!uname) {
                alert('Enter a username to resume a saved quiz.');
                return;
            }
            const saved = loadQuizProgress(uname);
            if (!saved) {
                alert('No saved quiz found for this user.');
                return;
            }
            // hide login and show form
            if (loginContainer) loginContainer.classList.add('hidden');
            if (triviaForm) triviaForm.classList.remove('hidden');
            resumeQuiz(saved, questionsContainer);
        });
    }
});

// Credential storage utilities
const CRED_KEY = 'trivia_app_creds_v1';
const GAMES_KEY_PREFIX = 'trivia_games_'; // followed by username
const QUIZ_SAVE_PREFIX = 'trivia_save_'; // followed by username

// Saved quiz state when resuming
let savedQuizState = null;
// Per-question answers recorded during the quiz (array of { selectedAnswerText, wasCorrect, answered } or null)
let perQuestionAnswers = [];

function loadSavedCredentials(usernameEl, passwordEl, rememberEl) {
    try {
        const raw = localStorage.getItem(CRED_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (usernameEl && parsed.username) usernameEl.value = parsed.username;
        if (passwordEl && parsed.password) passwordEl.value = parsed.password;
        if (rememberEl) rememberEl.checked = true;
    } catch (e) {
        console.warn('Failed to load saved credentials:', e);
    }
}

// Quiz state
let quizQuestions = [];
let currentIndex = 0;
let quizTimerId = null;
let remainingSeconds = 0;
// Scoring / timing
let quizStartTime = 0;
let correctCount = 0;
let answeredCount = 0;

function startQuiz(questions, container) {
    quizQuestions = questions || [];
    currentIndex = 0;
    // initialize scoring/timing
    quizStartTime = Date.now();
    correctCount = 0;
    answeredCount = 0;
    // initialize per-question answers array
    perQuestionAnswers = new Array(quizQuestions.length).fill(null);

    // mark form as in-quiz to hide setup
    const triviaFormEl = document.getElementById('triviaForm');
    if (triviaFormEl) triviaFormEl.classList.add('in-quiz');
    // Show controls and wire them using shared setup so resume and start behave the same
    const quizControls = document.getElementById('quizControls');
    if (quizControls) quizControls.classList.remove('hidden');
    setupQuizControls(container);
    renderCurrentQuestion(container);
}

// Wire quiz controls (Next, Finish, Show Score, Quit) in one place so resume works correctly
function setupQuizControls(container) {
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    const showScoreBtn = document.getElementById('showScoreBtn');
    const quitBtn = document.getElementById('quitBtn');
    const quizControls = document.getElementById('quizControls');

    if (finishBtn) finishBtn.classList.add('hidden');
    if (showScoreBtn) showScoreBtn.classList.add('hidden');
    if (nextBtn) nextBtn.disabled = true;

    if (nextBtn) {
        nextBtn.onclick = () => {
            stopTimer();
            currentIndex = Math.min(quizQuestions.length - 1, currentIndex + 1);
            renderCurrentQuestion(container);
        };
    }
    if (finishBtn) {
        finishBtn.onclick = () => {
            stopTimer();
            endQuiz(container);
        };
    }
    if (showScoreBtn) {
        showScoreBtn.onclick = () => {
            stopTimer();
            endQuiz(container);
        };
    }
    if (quitBtn) {
        quitBtn.onclick = () => {
            const usernameEl = document.getElementById('username');
            const username = usernameEl ? usernameEl.value.trim() : null;
            if (!username) {
                alert('Enter a username in the login box before quitting to save progress.');
                return;
            }
            saveQuizProgress(username);
            stopTimer();
            // clear visible question UI so it doesn't remain shown unless user explicitly resumes
            const questionsContainer = document.getElementById('questionsContainer');
            if (questionsContainer) questionsContainer.innerHTML = '';
            // reset transient in-memory quiz state so UI doesn't show previous quiz
            quizQuestions = [];
            perQuestionAnswers = [];
            currentIndex = 0;
            correctCount = 0;
            answeredCount = 0;
            quizStartTime = 0;
            // hide quiz and show login area so user can resume later
            const triviaFormEl = document.getElementById('triviaForm');
            if (triviaFormEl) triviaFormEl.classList.add('hidden');
            const loginContainer = document.getElementById('loginContainer');
            if (loginContainer) loginContainer.classList.remove('hidden');
            if (quizControls) quizControls.classList.add('hidden');
            alert('Progress saved. You can resume this quiz later from the login screen.');
            // show resume button if present
            const resumeBtn = document.getElementById('resumeBtn');
            if (resumeBtn) resumeBtn.classList.remove('hidden');
        };
    }
}

// Save current quiz progress to localStorage under the given username
function saveQuizProgress(username) {
    try {
        if (!username) return;
        const elapsedSeconds = quizStartTime ? Math.floor((Date.now() - quizStartTime) / 1000) : 0;
        const enableTimer = document.getElementById('enableTimer');
        const timerSecondsEl = document.getElementById('timerSeconds');
        const data = {
            savedAt: new Date().toISOString(),
            username,
            quizQuestions: quizQuestions || [],
            currentIndex: currentIndex || 0,
            perQuestionAnswers: perQuestionAnswers || new Array((quizQuestions||[]).length).fill(null),
            correctCount: correctCount || 0,
            answeredCount: answeredCount || 0,
            elapsedSeconds,
            timer: {
                enabled: enableTimer ? !!enableTimer.checked : false,
                timerSeconds: timerSecondsEl ? parseInt(timerSecondsEl.value, 10) || 10 : 10,
                remainingSeconds: remainingSeconds || 0
            },
            settings: {
                category: document.getElementById('category') ? document.getElementById('category').value : '',
                difficulty: document.getElementById('difficulty') ? document.getElementById('difficulty').value : '',
                type: document.getElementById('type') ? document.getElementById('type').value : '',
                amount: document.getElementById('numQuestions') ? parseInt(document.getElementById('numQuestions').value, 10) || 0 : 0
            }
        };
        const key = QUIZ_SAVE_PREFIX + username;
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save quiz progress:', e);
    }
}

// Load saved quiz progress for a username (returns object or null)
function loadQuizProgress(username) {
    try {
        if (!username) return null;
        const key = QUIZ_SAVE_PREFIX + username;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load quiz progress:', e);
        return null;
    }
}

function clearSavedProgress(username) {
    try {
        if (!username) return;
        const key = QUIZ_SAVE_PREFIX + username;
        localStorage.removeItem(key);
    } catch (e) {
        console.warn('Failed to clear saved progress:', e);
    }
}

// Resume a saved quiz state (restores globals and renders the current question)
function resumeQuiz(savedData, container) {
    if (!savedData) return;
    quizQuestions = savedData.quizQuestions || [];
    currentIndex = savedData.currentIndex || 0;
    perQuestionAnswers = savedData.perQuestionAnswers || new Array(quizQuestions.length).fill(null);
    correctCount = savedData.correctCount || 0;
    answeredCount = savedData.answeredCount || 0;
    // reconstruct quizStartTime so elapsed time continues correctly
    quizStartTime = Date.now() - ((savedData.elapsedSeconds || 0) * 1000);
    savedQuizState = savedData;
    // show quiz UI
    const triviaFormEl = document.getElementById('triviaForm');
    if (triviaFormEl) triviaFormEl.classList.remove('hidden');
    if (triviaFormEl) triviaFormEl.classList.add('in-quiz');
    const quizControls = document.getElementById('quizControls');
    if (quizControls) quizControls.classList.remove('hidden');
    // restore timer controls to saved values so renderCurrentQuestion starts with the remaining seconds
    try {
        const enableTimerEl = document.getElementById('enableTimer');
        const timerSecondsEl = document.getElementById('timerSeconds');
        if (savedData.timer) {
            if (enableTimerEl) enableTimerEl.checked = !!savedData.timer.enabled;
            if (timerSecondsEl) timerSecondsEl.value = savedData.timer.remainingSeconds || savedData.timer.timerSeconds || timerSecondsEl.value;
            // set remainingSeconds global so other code can see it
            remainingSeconds = savedData.timer.remainingSeconds || 0;
        }
    } catch (e) {
        // ignore
    }
    // Wire controls before rendering so Next/Finish/Quit work after resuming
    setupQuizControls(container);
    renderCurrentQuestion(container);
}

// After quiz ends, record a game for the current user (if available)
function recordGameResult({ username, difficulty, type, total, correct, timeSeconds }) {
    if (!username) return;
    try {
        const key = GAMES_KEY_PREFIX + username;
        const raw = localStorage.getItem(key);
        const games = raw ? JSON.parse(raw) : [];
        const entry = {
            date: new Date().toISOString(),
            difficulty: difficulty || 'any',
            type: type || 'any',
            total: total || 0,
            correct: correct || 0,
            timeSeconds: timeSeconds || 0,
        };
        games.push(entry);
        // cap to last 50 games to avoid unbounded growth
        while (games.length > 50) games.shift();
        localStorage.setItem(key, JSON.stringify(games));
    } catch (e) {
        console.warn('Failed to record game result:', e);
    }
}

function computeAggregatesForUser(username) {
    const key = GAMES_KEY_PREFIX + username;
    const raw = localStorage.getItem(key);
    const games = raw ? JSON.parse(raw) : [];

    // Aggregate by difficulty + type
    const agg = {};
    games.forEach(g => {
        const bucket = `${g.difficulty}|${g.type}`;
        if (!agg[bucket]) agg[bucket] = { games: 0, bestCorrect: 0, bestTime: null, records: [] };
        const a = agg[bucket];
        a.games += 1;
        if (g.correct > a.bestCorrect) a.bestCorrect = g.correct;
        if (a.bestTime === null || g.timeSeconds < a.bestTime) a.bestTime = g.timeSeconds;
        a.records.push(g);
    });

    return { games, agg };
}

function renderSummary(username) {
    const container = document.getElementById('questionsContainer') || document.body;
    const { games, agg } = computeAggregatesForUser(username);
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-wrapper';
    wrapper.innerHTML = `<h2>Summary for ${username}</h2>`;

    if (!games.length) {
        wrapper.innerHTML += '<p>No games played yet.</p>';
    } else {
        // average completion percent across all games
        let sumPercent = 0;
        let pctCount = 0;
        games.forEach(g => {
            if (g.total && g.total > 0) {
                sumPercent += (g.correct / g.total) * 100;
                pctCount += 1;
            }
        });
        const avgPercent = pctCount ? (sumPercent / pctCount) : 0;
        wrapper.innerHTML += `<p>Average completion: <strong>${avgPercent.toFixed(1)}%</strong></p>`;

        // overall list of recent games
        const recent = document.createElement('div');
        recent.innerHTML = '<h3>Recent games</h3>';
        const ul = document.createElement('ul');
        games.slice().reverse().forEach(g => {
            const li = document.createElement('li');
            li.textContent = `${new Date(g.date).toLocaleString()}: ${g.correct}/${g.total} (${g.difficulty} / ${g.type}) in ${formatSeconds(g.timeSeconds)}`;
            ul.appendChild(li);
        });
        recent.appendChild(ul);
        wrapper.appendChild(recent);

        // aggregates
        const aggDiv = document.createElement('div');
        aggDiv.innerHTML = '<h3>Aggregates</h3>';
        const table = document.createElement('table');
        table.innerHTML = '<tr><th>Difficulty</th><th>Type</th><th>Games</th><th>Best Correct</th><th>Fastest Time</th></tr>';
        Object.keys(agg).forEach(bucket => {
            const [difficulty, type] = bucket.split('|');
            const a = agg[bucket];
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${difficulty}</td><td>${type}</td><td>${a.games}</td><td>${a.bestCorrect}</td><td>${a.bestTime !== null ? formatSeconds(a.bestTime) : '-'}</td>`;
            table.appendChild(tr);
        });
        aggDiv.appendChild(table);
        wrapper.appendChild(aggDiv);
    }

    // replace questions container with summary
    const questionsContainer = document.getElementById('questionsContainer');
    if (questionsContainer) {
        questionsContainer.innerHTML = '';
        questionsContainer.appendChild(wrapper);
    } else {
        document.body.appendChild(wrapper);
    }
}

function formatSeconds(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
}

function renderCurrentQuestion(container) {
    if (!container) container = document.getElementById('questionsContainer');
    container.innerHTML = '';
    if (!quizQuestions || quizQuestions.length === 0) {
        container.textContent = 'No questions available.';
        return;
    }

    const q = quizQuestions[currentIndex];

    const card = document.createElement('div');
    // use Bootstrap card styles and keep question-card for minimal overrides
    card.className = 'card p-3 question-card';

    const numberEl = document.createElement('div');
    numberEl.className = 'question-number';
    numberEl.textContent = `Question ${currentIndex + 1} of ${quizQuestions.length}`;
    card.appendChild(numberEl);

    const questionEl = document.createElement('p');
    questionEl.className = 'question-text';
    questionEl.textContent = decodeHTML(q.question);
    card.appendChild(questionEl);

    const answers = [];
    answers.push({ text: decodeHTML(q.correct_answer), correct: true });
    q.incorrect_answers.forEach(ia => answers.push({ text: decodeHTML(ia), correct: false }));
    shuffle(answers);

    const answersList = document.createElement('div');
    // Use bootstrap utilities to stack buttons full width with gaps
    answersList.className = 'answers-list d-grid gap-2';

    answers.forEach((ans) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    // Use bootstrap button styles but keep the answer-option class for JS hooks
    btn.className = 'btn btn-outline-primary answer-option text-start';
        btn.dataset.correct = ans.correct ? 'true' : 'false';
        btn.textContent = ans.text;

        btn.addEventListener('click', () => {
            // If already answered, ignore
            if (card.dataset.answered === 'true') return;
            card.dataset.answered = 'true';
            stopTimer();

            // Count this answer
            answeredCount += 1;
            const wasCorrect = btn.dataset.correct === 'true';
            if (wasCorrect) correctCount += 1;

            // record per-question answer for resume
            perQuestionAnswers[currentIndex] = { selectedAnswerText: btn.textContent, wasCorrect: wasCorrect, answered: true };

            // Mark selected and reveal correctness (use bootstrap button classes)
            const optionButtons = answersList.querySelectorAll('.answer-option');
            optionButtons.forEach(ob => {
                // reset bootstrap state for safety
                ob.classList.remove('selected', 'btn-primary', 'btn-success', 'btn-danger');
                if (ob === btn) ob.classList.add('selected');
                const isCorrect = ob.dataset.correct === 'true';
                if (isCorrect) {
                    ob.classList.add('correct', 'btn-success');
                    ob.classList.remove('btn-outline-primary');
                } else if (ob === btn && !isCorrect) {
                    ob.classList.add('incorrect', 'btn-danger');
                    ob.classList.remove('btn-outline-primary');
                } else {
                    // keep neutral outline for unselected wrong options
                    ob.classList.remove('btn-success', 'btn-danger');
                    ob.classList.add('btn-outline-primary');
                }
                ob.disabled = true;
            });

            // If this was the last question, show Show Score button
            // If this was the last question, show Show Score button
            if (currentIndex >= quizQuestions.length - 1) {
                const showScoreBtnEl = document.getElementById('showScoreBtn');
                const nextBtnEl = document.getElementById('nextBtn');
                const finishBtnEl = document.getElementById('finishBtn');
                if (showScoreBtnEl) showScoreBtnEl.classList.remove('hidden');
                if (nextBtnEl) nextBtnEl.disabled = true;
                if (finishBtnEl) finishBtnEl.classList.add('hidden');
                return;
            }

            // Otherwise enable Next
            const nextBtnEl2 = document.getElementById('nextBtn');
            if (nextBtnEl2) nextBtnEl2.disabled = false;
        });

        answersList.appendChild(btn);
    });

    card.appendChild(answersList);
    container.appendChild(card);

    // If this question was already answered (from perQuestionAnswers or savedQuizState), reflect that in the UI
    try {
        const savedAns = (perQuestionAnswers && perQuestionAnswers[currentIndex]) || (savedQuizState && savedQuizState.perQuestionAnswers && savedQuizState.perQuestionAnswers[currentIndex]);
        if (savedAns && savedAns.answered) {
            const optionButtons = answersList.querySelectorAll('.answer-option');
            optionButtons.forEach(ob => {
                const isCorrect = ob.dataset.correct === 'true';
                if (savedAns.selectedAnswerText && ob.textContent === savedAns.selectedAnswerText) {
                    ob.classList.add('selected');
                    if (isCorrect) {
                        ob.classList.add('correct', 'btn-success');
                        ob.classList.remove('btn-outline-primary');
                    } else {
                        ob.classList.add('incorrect', 'btn-danger');
                        ob.classList.remove('btn-outline-primary');
                    }
                } else if (isCorrect) {
                    ob.classList.add('correct', 'btn-success');
                    ob.classList.remove('btn-outline-primary');
                } else {
                    ob.classList.add('btn-outline-primary');
                }
                ob.disabled = true;
            });
            card.dataset.answered = 'true';
            const nextBtnEl = document.getElementById('nextBtn');
            const finishBtnEl = document.getElementById('finishBtn');
            const showScoreBtnEl = document.getElementById('showScoreBtn');
            if (currentIndex >= quizQuestions.length - 1) {
                if (showScoreBtnEl) showScoreBtnEl.classList.remove('hidden');
                if (nextBtnEl) nextBtnEl.disabled = true;
                if (finishBtnEl) finishBtnEl.classList.add('hidden');
            } else {
                if (nextBtnEl) nextBtnEl.disabled = false;
            }
        }
    } catch (e) {
        // ignore errors reflecting saved answers
    }

    // Start timer if enabled
    const enableTimer = document.getElementById('enableTimer');
    const timerSecondsEl = document.getElementById('timerSeconds');
    if (enableTimer && enableTimer.checked) {
        const seconds = timerSecondsEl ? parseInt(timerSecondsEl.value, 10) || 10 : 10;
        startTimer(seconds, () => {
            // Auto-select nothing, reveal correct answer, count as answered, and allow moving on
            if (card.dataset.answered !== 'true') {
                card.dataset.answered = 'true';
                answeredCount += 1;
                // record unanswered (expired) state for resume
                perQuestionAnswers[currentIndex] = { selectedAnswerText: null, wasCorrect: false, answered: true };
            }
            const optionButtons = answersList.querySelectorAll('.answer-option');
            optionButtons.forEach(ob => {
                const isCorrect = ob.dataset.correct === 'true';
                if (isCorrect) {
                    ob.classList.add('correct', 'btn-success');
                    ob.classList.remove('btn-outline-primary');
                } else {
                    ob.classList.remove('btn-success');
                    ob.classList.add('btn-outline-primary');
                }
                ob.disabled = true;
            });
            // If last question, finish
            if (currentIndex >= quizQuestions.length - 1) {
                const showScoreBtnEl = document.getElementById('showScoreBtn');
                const nextBtnEl = document.getElementById('nextBtn');
                const finishBtnEl = document.getElementById('finishBtn');
                if (showScoreBtnEl) showScoreBtnEl.classList.remove('hidden');
                if (nextBtnEl) nextBtnEl.disabled = true;
                if (finishBtnEl) finishBtnEl.classList.add('hidden');
                return;
            }
            // otherwise enable Next
            const nextBtn = document.getElementById('nextBtn');
            if (nextBtn) nextBtn.disabled = false;
        });
    }
}

function endQuiz(container) {
    if (!container) container = document.getElementById('questionsContainer');
    const quizControls = document.getElementById('quizControls');
    if (quizControls) quizControls.classList.add('hidden');

    // remove in-quiz marker (restore setup visibility)
    const triviaFormEl = document.getElementById('triviaForm');
    if (triviaFormEl) triviaFormEl.classList.remove('in-quiz');

    // compute elapsed time
    const endTime = Date.now();
    const elapsedMs = quizStartTime ? Math.max(0, endTime - quizStartTime) : 0;
    const seconds = Math.floor(elapsedMs / 1000);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    const timeString = `${minutesPart}:${String(secondsPart).padStart(2, '0')}`;

    const total = quizQuestions.length || 0;
    const correct = correctCount;

    // record result for user if possible
    try {
        const rawCreds = localStorage.getItem(CRED_KEY);
        const user = rawCreds ? JSON.parse(rawCreds).username : null;
        const difficulty = document.getElementById('difficulty') ? document.getElementById('difficulty').value : 'any';
        const type = document.getElementById('type') ? document.getElementById('type').value : 'any';
        recordGameResult({ username: user, difficulty, type, total, correct, timeSeconds: Math.floor(elapsedMs / 1000) });
        // Clear any saved mid-quiz progress for this user since the quiz finished
        if (user) clearSavedProgress(user);
    } catch (e) {
        console.warn('Failed to persist game result', e);
    }

    container.innerHTML = '';
    const summary = document.createElement('div');
    summary.className = 'quiz-summary';
        summary.innerHTML = `
                <h2>Quiz Results</h2>
                <p>Total time: <strong>${timeString}</strong></p>
                <p>Correct: <strong>${correct}</strong> out of <strong>${total}</strong></p>
                <div class="summary-actions">
                    <button id="restartBtn" type="button" class="btn btn-primary">Play again</button>
                </div>
        `;
    container.appendChild(summary);

    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }
}

function startTimer(seconds, onExpired) {
    stopTimer();
    remainingSeconds = seconds;
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.textContent = `Time left: ${remainingSeconds}s`;
    quizTimerId = setInterval(() => {
        remainingSeconds -= 1;
        if (timerDisplay) timerDisplay.textContent = `Time left: ${remainingSeconds}s`;
        if (remainingSeconds <= 0) {
            stopTimer();
            if (typeof onExpired === 'function') onExpired();
        }
    }, 1000);
}

function stopTimer() {
    if (quizTimerId) {
        clearInterval(quizTimerId);
        quizTimerId = null;
    }
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.textContent = '';
}

function saveCredentialsIfRequested(usernameEl, passwordEl, rememberEl) {
    try {
        if (!rememberEl || !rememberEl.checked) return;
        const username = usernameEl ? usernameEl.value : '';
        const password = passwordEl ? passwordEl.value : '';
        // Note: storing plaintext passwords in localStorage is insecure. This is a simple demo.
        const payload = { username, password };
        localStorage.setItem(CRED_KEY, JSON.stringify(payload));
    } catch (e) {
        console.warn('Failed to save credentials:', e);
    }
}

function clearSavedCredentials() {
    try {
        localStorage.removeItem(CRED_KEY);
    } catch (e) {
        console.warn('Failed to clear saved credentials:', e);
    }
}

// Utility: decode HTML entities returned by OpenTDB
function decodeHTML(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
}

// Shuffle helper (Fisher-Yates)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Render questions into the container. Uses classes for selectable options and marks correct/incorrect on selection.
function displayQuestions(questions = [], container) {
    if (!container) {
        container = document.getElementById('questionsContainer');
    }
    if (!container) return;

    container.innerHTML = '';

    questions.forEach((q, qi) => {
    const card = document.createElement('div');
    card.className = 'card p-3 question-card';

    // Show question number
    const numberEl = document.createElement('div');
    numberEl.className = 'question-number';
    numberEl.textContent = `Question ${qi + 1} of ${questions.length}`;
    card.appendChild(numberEl);

    const questionEl = document.createElement('p');
    questionEl.className = 'question-text';
    questionEl.textContent = decodeHTML(q.question);
    card.appendChild(questionEl);

        // Build answers array with objects marking correctness
        const answers = [];
        answers.push({ text: decodeHTML(q.correct_answer), correct: true });
        q.incorrect_answers.forEach(ia => answers.push({ text: decodeHTML(ia), correct: false }));

        shuffle(answers);

    const answersList = document.createElement('div');
    answersList.className = 'answers-list d-grid gap-2';

        answers.forEach((ans, ai) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-outline-primary answer-option text-start';
            btn.dataset.correct = ans.correct ? 'true' : 'false';
            btn.textContent = ans.text;

            // Allow selecting only once per question
            btn.addEventListener('click', () => {
                // If already answered, ignore further clicks
                if (card.dataset.answered === 'true') return;

                card.dataset.answered = 'true';

                // Mark selected
                btn.classList.add('selected');

                // Reveal correct/incorrect states (use bootstrap button classes)
                const optionButtons = answersList.querySelectorAll('.answer-option');
                optionButtons.forEach(ob => {
                    ob.classList.remove('selected', 'btn-primary', 'btn-success', 'btn-danger');
                    if (ob === btn) ob.classList.add('selected');
                    const isCorrect = ob.dataset.correct === 'true';
                    if (isCorrect) {
                        ob.classList.add('correct', 'btn-success');
                        ob.classList.remove('btn-outline-primary');
                    } else if (ob === btn && !isCorrect) {
                        ob.classList.add('incorrect', 'btn-danger');
                        ob.classList.remove('btn-outline-primary');
                    } else {
                        ob.classList.remove('btn-success', 'btn-danger');
                        ob.classList.add('btn-outline-primary');
                    }
                            // disable all options
                            ob.disabled = true;
                });
                        // record per-question answer so resume can restore this selection
                        perQuestionAnswers[qi] = { selectedAnswerText: btn.textContent, wasCorrect: btn.dataset.correct === 'true', answered: true };
            });

                // record per-question answer for resume in displayQuestions (bulk mode)
                // when clicked above we will set perQuestionAnswers[qi], so no extra action here

            answersList.appendChild(btn);
        });

        card.appendChild(answersList);
        container.appendChild(card);
    });
}