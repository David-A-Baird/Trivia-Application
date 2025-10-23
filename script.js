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
});

// Credential storage utilities
const CRED_KEY = 'trivia_app_creds_v1';

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
    const quizControls = document.getElementById('quizControls');
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    const showScoreBtn = document.getElementById('showScoreBtn');
    const timerDisplay = document.getElementById('timerDisplay');

    if (quizControls) quizControls.classList.remove('hidden');
    if (finishBtn) finishBtn.classList.add('hidden');
    if (showScoreBtn) showScoreBtn.classList.add('hidden');
    if (nextBtn) nextBtn.disabled = true;

    // Wire navigation buttons
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

    renderCurrentQuestion(container);
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
    card.className = 'question-card';

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
    answersList.className = 'answers-list';

    answers.forEach((ans) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'answer-option';
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

            // Mark selected and reveal correctness
            const optionButtons = answersList.querySelectorAll('.answer-option');
            optionButtons.forEach(ob => {
                ob.classList.remove('selected');
                if (ob === btn) ob.classList.add('selected');
                const isCorrect = ob.dataset.correct === 'true';
                if (isCorrect) {
                    ob.classList.add('correct');
                } else if (ob === btn && !isCorrect) {
                    ob.classList.add('incorrect');
                }
                ob.disabled = true;
            });

            // If this was the last question, show Show Score button
            if (currentIndex >= quizQuestions.length - 1) {
                if (showScoreBtn) showScoreBtn.classList.remove('hidden');
                if (nextBtn) nextBtn.disabled = true;
                if (finishBtn) finishBtn.classList.add('hidden');
                return;
            }

            // Otherwise enable Next
            if (nextBtn) nextBtn.disabled = false;
        });

        answersList.appendChild(btn);
    });

    card.appendChild(answersList);
    container.appendChild(card);

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
            }
            const optionButtons = answersList.querySelectorAll('.answer-option');
            optionButtons.forEach(ob => {
                const isCorrect = ob.dataset.correct === 'true';
                if (isCorrect) ob.classList.add('correct');
                ob.disabled = true;
            });
            // If last question, finish
            if (currentIndex >= quizQuestions.length - 1) {
                if (showScoreBtn) showScoreBtn.classList.remove('hidden');
                if (nextBtn) nextBtn.disabled = true;
                if (finishBtn) finishBtn.classList.add('hidden');
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

    // compute elapsed time
    const endTime = Date.now();
    const elapsedMs = quizStartTime ? Math.max(0, endTime - quizStartTime) : 0;
    const seconds = Math.floor(elapsedMs / 1000);
    const minutesPart = Math.floor(seconds / 60);
    const secondsPart = seconds % 60;
    const timeString = `${minutesPart}:${String(secondsPart).padStart(2, '0')}`;

    const total = quizQuestions.length || 0;
    const correct = correctCount;

    container.innerHTML = '';
    const summary = document.createElement('div');
    summary.className = 'quiz-summary';
    summary.innerHTML = `
        <h2>Quiz Results</h2>
        <p>Total time: <strong>${timeString}</strong></p>
        <p>Correct: <strong>${correct}</strong> out of <strong>${total}</strong></p>
        <div class="summary-actions">
          <button id="restartBtn" type="button">Play again</button>
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
        card.className = 'question-card';

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
        answersList.className = 'answers-list';

        answers.forEach((ans, ai) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'answer-option';
            btn.dataset.correct = ans.correct ? 'true' : 'false';
            btn.textContent = ans.text;

            // Allow selecting only once per question
            btn.addEventListener('click', () => {
                // If already answered, ignore further clicks
                if (card.dataset.answered === 'true') return;

                card.dataset.answered = 'true';

                // Mark selected
                btn.classList.add('selected');

                // Reveal correct/incorrect states
                const optionButtons = answersList.querySelectorAll('.answer-option');
                optionButtons.forEach(ob => {
                    ob.classList.remove('selected');
                    if (ob === btn) ob.classList.add('selected');
                    const isCorrect = ob.dataset.correct === 'true';
                    if (isCorrect) {
                        ob.classList.add('correct');
                    } else if (ob === btn && !isCorrect) {
                        ob.classList.add('incorrect');
                    }
                    // disable all options
                    ob.disabled = true;
                });
            });

            answersList.appendChild(btn);
        });

        card.appendChild(answersList);
        container.appendChild(card);
    });
}