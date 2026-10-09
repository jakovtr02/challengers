
"use strict";

(() => {
  // ========================================
  // CONSTANTS
  // ========================================

  const MAX_TRIES = 5;
  const QUICK_ROUNDS = 5;
  const THEME_ROUNDS = 8;

  const BASE_POINTS = [100, 75, 50, 25, 10];

  const STORAGE_KEY = "challengers.stats.v1";
  const SOUND_KEY = "challengers.sound.v1";

  const MODE_NAMES = {
    quick: "Quick Play",
    theme: "Theme Challenge",
    endless: "Endless"
  };

  // ========================================
  // STATE
  // ========================================

  const state = {
    screen: "menu",
    mode: "quick",
    difficulty: "medium",
    theme: "",
    words: [],
    usedAnswers: new Set(),
    currentWord: null,
    round: 0,
    tries: 0,
    guesses: [],
    revealedPositions: new Set(),
    score: 0,
    streak: 0,
    bestSessionStreak: 0,
    solved: 0,
    totalSolveTries: 0,
    results: [],
    roundOver: false,
    soundEnabled: true,
    audioContext: null,
    previousBest: 0,
    stats: {
      bestScores: {
        quick: 0,
        theme: 0,
        endless: 0
      },
      bestStreak: 0,
      totalSolved: 0,
      gamesPlayed: 0
    }
  };

  // ========================================
  // DOM REFERENCES
  // ========================================

  const $ = id => document.getElementById(id);

  const dom = {
    screens: document.querySelectorAll(".screen"),
    brandLink: $("brandLink"),
    soundButton: $("soundButton"),

    menuScreen: $("menuScreen"),
    modeButtons: document.querySelectorAll(".mode-card"),
    difficultyButtons:
      document.querySelectorAll(".difficulty-button"),
    themePicker: $("themePicker"),
    themeSelect: $("themeSelect"),
    startButton: $("startButton"),
    howToPlayButton: $("howToPlayButton"),
    menuBestScore: $("menuBestScore"),
    menuBestStreak: $("menuBestStreak"),
    menuTotalSolved: $("menuTotalSolved"),
    menuGamesPlayed: $("menuGamesPlayed"),

    gameScreen: $("gameScreen"),
    roundCounter: $("roundCounter"),
    quitButton: $("quitButton"),
    gameScore: $("gameScore"),
    gameStreak: $("gameStreak"),
    gameCard: $("gameCard"),
    themeBadge: $("themeBadge"),
    roundDifficulty: $("roundDifficulty"),
    cluesContainer: $("cluesContainer"),
    letterSlots: $("letterSlots"),
    triesText: $("triesText"),
    triesPips: $("triesPips"),
    guessForm: $("guessForm"),
    guessInput: $("guessInput"),
    submitButton: $("submitButton"),
    guessFeedback: $("guessFeedback"),
    guessHistory: $("guessHistory"),
    historyCount: $("historyCount"),

    roundScreen: $("roundScreen"),
    resultIcon: $("resultIcon"),
    roundResultEyebrow: $("roundResultEyebrow"),
    roundResultTitle: $("roundResultTitle"),
    revealedAnswer: $("revealedAnswer"),
    pointsEarned: $("pointsEarned"),
    roundFact: $("roundFact"),
    roundDetail: $("roundDetail"),
    nextButton: $("nextButton"),

    finalScreen: $("finalScreen"),
    highScoreBanner: $("highScoreBanner"),
    finalScore: $("finalScore"),
    finalSolved: $("finalSolved"),
    finalAverage: $("finalAverage"),
    finalStreak: $("finalStreak"),
    emojiSummary: $("emojiSummary"),
    shareButton: $("shareButton"),
    shareFeedback: $("shareFeedback"),
    playAgainButton: $("playAgainButton"),
    menuButton: $("menuButton"),

    howToPlayModal: $("howToPlayModal"),
    closeModalButton: $("closeModalButton"),
    gotItButton: $("gotItButton"),
    confettiLayer: $("confettiLayer")
  };

  // ========================================
  // UTILITIES
  // ========================================

  function shuffle(items) {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replace(/[’‘]/g, "'")
      .replace(/^the[\s\W_]+/i, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function displayMode(mode) {
    return MODE_NAMES[mode] || mode;
  }

  function getAnswerCharacters(answer) {
    return Array.from(answer);
  }

  function isLetter(character) {
    return /[a-z0-9]/i.test(character);
  }

  function getLetterPositions(answer) {
    return getAnswerCharacters(answer)
      .map((character, index) =>
        isLetter(character) ? index : -1
      )
      .filter(index => index !== -1);
  }

  function isCorrectGuess(guess, word) {
    const accepted = [
      word.answer,
      ...(word.aliases || [])
    ];

    return accepted.some(
      answer => normalize(answer) === normalize(guess)
    );
  }

  function countExactMatches(guess, answer) {
    const actual = normalize(answer);
    const attempt = normalize(guess);

    let matching = 0;

    for (let i = 0; i < Math.min(
      actual.length,
      attempt.length
    ); i++) {
      if (actual[i] === attempt[i]) {
        matching++;
      }
    }

    return matching;
  }

  function currentMultiplier(streak) {
    return 1 + Math.min(
      Math.max(0, streak - 1) * 0.1,
      0.5
    );
  }

  function setFeedback(message, type = "") {
    dom.guessFeedback.textContent = message;
    dom.guessFeedback.className =
      `feedback ${type}`.trim();
  }

  function formatRoundCounter() {
    if (state.mode === "endless") {
      return `ROUND ${state.round + 1} / ∞`;
    }

    return `ROUND ${state.round + 1} / ${
      state.words.length
    }`;
  }

  function animateShake(element) {
    element.classList.remove("shake");
    void element.offsetWidth;
    element.classList.add("shake");
  }

  function showScreen(name) {
    state.screen = name;

    dom.screens.forEach(screen => {
      const active = screen.id === `${name}Screen`;
      screen.classList.toggle("active", active);

      if (active) {
        screen.removeAttribute("aria-hidden");
      } else {
        screen.setAttribute("aria-hidden", "true");
      }
    });

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  function focusGuess() {
    if (state.screen !== "game" || state.roundOver) {
      return;
    }

    requestAnimationFrame(() => {
      dom.guessInput.focus({ preventScroll: true });
    });
  }

  // ========================================
  // PERSISTENCE
  // ========================================

  function safeRead(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function loadStats() {
    try {
      const saved = JSON.parse(
        safeRead(STORAGE_KEY) || "null"
      );

      if (!saved || typeof saved !== "object") return;

      const safeNumber = value =>
        Number.isFinite(value) && value >= 0
          ? value
          : 0;

      for (const mode of Object.keys(MODE_NAMES)) {
        state.stats.bestScores[mode] = safeNumber(
          saved.bestScores?.[mode]
        );
      }

      state.stats.bestStreak = safeNumber(
        saved.bestStreak
      );
      state.stats.totalSolved = safeNumber(
        saved.totalSolved
      );
      state.stats.gamesPlayed = safeNumber(
        saved.gamesPlayed
      );
    } catch {
      // Damaged or inaccessible storage is ignored.
    }
  }

  function saveStats() {
    safeWrite(STORAGE_KEY, JSON.stringify(state.stats));
  }

  function loadSoundPreference() {
    const stored = safeRead(SOUND_KEY);
    state.soundEnabled = stored !== "false";
    renderSoundButton();
  }

  // ========================================
  // AUDIO
  // ========================================

  function playSound(type) {
    if (!state.soundEnabled) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) return;

      if (!state.audioContext) {
        state.audioContext = new AudioContextClass();
      }

      const context = state.audioContext;

      if (context.state === "suspended") {
        context.resume().catch(() => {});
      }

      const now = context.currentTime;

      const notes = {
        correct: [523.25, 659.25, 783.99],
        wrong: [220, 185],
        click: [440]
      };

      (notes[type] || notes.click)
        .forEach((frequency, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();

          const start = now + index * 0.085;
          const duration = type === "wrong" ? 0.14 : 0.13;

          oscillator.type =
            type === "wrong" ? "triangle" : "sine";

          oscillator.frequency.value = frequency;

          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(
            0.075,
            start + 0.012
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            start + duration
          );

          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.02);
        });
    } catch {
      // Audio is an optional enhancement.
    }
  }

  function renderSoundButton() {
    dom.soundButton.textContent =
      state.soundEnabled ? "♪" : "♪̸";

    dom.soundButton.setAttribute(
      "aria-pressed",
      String(!state.soundEnabled)
    );

    dom.soundButton.setAttribute(
      "aria-label",
      state.soundEnabled ? "Mute sound" : "Enable sound"
    );
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    safeWrite(SOUND_KEY, String(state.soundEnabled));
    renderSoundButton();
    playSound("click");
  }

  // ========================================
  // GAME FLOW
  // ========================================

  function getFilteredWords() {
    let pool = window.WORDS || [];

    if (state.difficulty !== "mixed") {
      pool = pool.filter(
        word => word.difficulty === state.difficulty
      );
    }

    if (state.mode === "theme") {
      pool = pool.filter(
        word => word.theme === state.theme
      );
    }

    return shuffle(pool);
  }

  function startGame() {
    const pool = getFilteredWords();

    if (!pool.length) {
      window.alert(
        "No words are available for that combination. " +
        "Try Mixed difficulty or another theme."
      );
      return;
    }

    state.words = state.mode === "quick"
      ? pool.slice(0, QUICK_ROUNDS)
      : state.mode === "theme"
        ? pool.slice(0, THEME_ROUNDS)
        : pool;

    state.usedAnswers = new Set();
    state.currentWord = null;
    state.round = 0;
    state.tries = 0;
    state.guesses = [];
    state.revealedPositions = new Set();
    state.score = 0;
    state.streak = 0;
    state.bestSessionStreak = 0;
    state.solved = 0;
    state.totalSolveTries = 0;
    state.results = [];
    state.roundOver = false;

    state.previousBest =
      state.stats.bestScores[state.mode] || 0;

    state.stats.gamesPlayed++;
    saveStats();

    loadRound();
  }

  function replenishEndlessPool() {
    const candidates = getFilteredWords().filter(
      word => !state.usedAnswers.has(
        normalize(word.answer)
      )
    );

    if (candidates.length) {
      state.words.push(...candidates);
      return true;
    }

    return false;
  }

  function loadRound() {
    if (state.round >= state.words.length) {
      if (
        state.mode !== "endless" ||
        !replenishEndlessPool()
      ) {
        showResults();
        return;
      }
    }

    state.currentWord = state.words[state.round];
    state.usedAnswers.add(
      normalize(state.currentWord.answer)
    );

    state.tries = 0;
    state.guesses = [];
    state.revealedPositions = new Set();
    state.roundOver = false;

    dom.guessInput.value = "";
    dom.guessInput.disabled = false;
    dom.submitButton.disabled = false;

    setFeedback("");
    renderGame();
    showScreen("game");
    focusGuess();
  }

  function checkGuess(rawGuess) {
    if (state.roundOver) return;

    const guess = rawGuess.trim();
    const normalized = normalize(guess);

    if (!normalized) {
      setFeedback("Enter a word before guessing.");
      focusGuess();
      return;
    }

    if (
      state.guesses.some(
        item => item.normalized === normalized
      )
    ) {
      setFeedback(
        "You've already tried that one. Give another answer a shot."
      );
      focusGuess();
      return;
    }

    if (isCorrectGuess(guess, state.currentWord)) {
      state.tries++;
      finishRound(true);
      return;
    }

    state.tries++;

    const matches = countExactMatches(
      guess,
      state.currentWord.answer
    );

    state.guesses.push({
      text: guess,
      normalized,
      matches
    });

    dom.guessInput.value = "";
    playSound("wrong");
    animateShake(dom.gameCard);

    if (state.tries >= MAX_TRIES) {
      finishRound(false);
      return;
    }

    revealNextHint();

    const label = matches === 1
      ? "letter"
      : "letters";

    setFeedback(
      `Not quite. ${matches} ${label} in the correct position.`
    );

    renderTries();
    renderHistory();
    focusGuess();
  }

  function revealNextHint() {
    const answer = state.currentWord.answer;
    const positions = getLetterPositions(answer);

    if (state.tries === 3 && positions.length) {
      state.revealedPositions.add(positions[0]);
    }

    if (state.tries === 4) {
      const available = positions.filter(
        index => !state.revealedPositions.has(index)
      );

      if (available.length) {
        const index = available[
          Math.floor(Math.random() * available.length)
        ];

        state.revealedPositions.add(index);
      }
    }

    renderClues();
    renderSlots();
  }

  function finishRound(solved) {
    if (state.roundOver) return;

    state.roundOver = true;
    dom.guessInput.disabled = true;
    dom.submitButton.disabled = true;

    let points = 0;
    let multiplier = 1;

    if (solved) {
      state.streak++;
      state.solved++;
      state.totalSolveTries += state.tries;

      state.bestSessionStreak = Math.max(
        state.bestSessionStreak,
        state.streak
      );

      state.stats.totalSolved++;

      multiplier = currentMultiplier(state.streak);

      points = Math.round(
        BASE_POINTS[state.tries - 1] * multiplier
      );

      state.score += points;

      state.stats.bestStreak = Math.max(
        state.stats.bestStreak,
        state.streak
      );

      playSound("correct");
      launchConfetti();
    } else {
      state.streak = 0;
      playSound("wrong");
    }

    state.results.push({
      answer: state.currentWord.answer,
      solved,
      tries: state.tries,
      points
    });

    updateHighScore();
    saveStats();
    renderRoundResult(solved, points, multiplier);

    showScreen("round");
    dom.nextButton.focus({ preventScroll: true });
  }

  function nextRound() {
    if (!state.roundOver) return;

    if (
      state.mode === "endless" &&
      !state.results.at(-1)?.solved
    ) {
      showResults();
      return;
    }

    state.round++;
    loadRound();
  }

  function quitGame() {
    if (
      !window.confirm(
        "End your current challenge and view your results?"
      )
    ) {
      return;
    }

    showResults();
  }

  function updateHighScore() {
    const best = state.stats.bestScores[state.mode];

    if (state.score > best) {
      state.stats.bestScores[state.mode] = state.score;
    }
  }

  function showResults() {
    updateHighScore();
    saveStats();
    renderFinalResults();
    showScreen("final");
    dom.shareButton.focus({ preventScroll: true });
  }

  function returnToMenu() {
    renderMenu();
    showScreen("menu");
    dom.startButton.focus({ preventScroll: true });
  }

  // ========================================
  // RENDERING
  // ========================================

  function renderMenu() {
    const themes = [
      ...new Set(window.WORDS.map(word => word.theme))
    ].sort((a, b) => a.localeCompare(b));

    const previous = state.theme;

    dom.themeSelect.replaceChildren();

    for (const theme of themes) {
      const option = document.createElement("option");
      option.value = theme;
      option.textContent = theme;
      dom.themeSelect.appendChild(option);
    }

    state.theme = themes.includes(previous)
      ? previous
      : themes[0] || "";

    dom.themeSelect.value = state.theme;

    dom.themePicker.classList.toggle(
      "hidden",
      state.mode !== "theme"
    );

    dom.modeButtons.forEach(button => {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    dom.difficultyButtons.forEach(button => {
      const selected =
        button.dataset.difficulty === state.difficulty;

      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    dom.menuBestScore.textContent =
      state.stats.bestScores[state.mode];

    dom.menuBestStreak.textContent =
      state.stats.bestStreak;

    dom.menuTotalSolved.textContent =
      state.stats.totalSolved;

    dom.menuGamesPlayed.textContent =
      state.stats.gamesPlayed;
  }

  function renderGame() {
    const word = state.currentWord;

    dom.roundCounter.textContent = formatRoundCounter();
    dom.gameScore.textContent = state.score;
    dom.gameStreak.textContent = `${state.streak} 🔥`;

    dom.themeBadge.textContent = word.theme;
    dom.roundDifficulty.textContent = word.difficulty;

    renderClues();
    renderSlots();
    renderTries();
    renderHistory();
  }

  function renderClues() {
    const visibleCount = Math.min(
      state.tries + 1,
      3
    );

    dom.cluesContainer.replaceChildren();

    for (let i = 0; i < visibleCount; i++) {
      const article = document.createElement("article");
      article.className = "clue-item";

      const label = document.createElement("span");
      label.className = "clue-number";
      label.textContent = `CLUE ${i + 1}`;

      const paragraph = document.createElement("p");
      paragraph.textContent = state.currentWord.clues[i];

      article.append(label, paragraph);
      dom.cluesContainer.appendChild(article);
    }
  }

  function renderSlots() {
    dom.letterSlots.replaceChildren();

    const characters = getAnswerCharacters(
      state.currentWord.answer
    );

    // Group letters into words, preserving spaces.
    // Indexes still refer to the original answer.
    let currentGroup = document.createElement("span");
    currentGroup.className = "word-group";
    dom.letterSlots.appendChild(currentGroup);

    characters.forEach((character, index) => {
      if (character === " ") {
        currentGroup = document.createElement("span");
        currentGroup.className = "word-group";
        dom.letterSlots.appendChild(currentGroup);
        return;
      }

      const slot = document.createElement("span");
      slot.className = "letter-slot";

      if (isLetter(character)) {
        const revealed =
          state.revealedPositions.has(index);

        slot.textContent = revealed
          ? character.toUpperCase()
          : "";

        if (revealed) {
          slot.classList.add("revealed");
        }
      } else {
        slot.textContent = character;
        slot.classList.add("revealed");
      }

      currentGroup.appendChild(slot);
    });

    const revealedLetters = characters
      .map((character, index) => {
        if (!isLetter(character)) return character;

        return state.revealedPositions.has(index)
          ? character
          : "blank";
      })
      .join(" ");

    dom.letterSlots.setAttribute(
      "aria-label",
      `Hidden answer: ${revealedLetters}`
    );
  }

  function renderTries() {
    const remaining = MAX_TRIES - state.tries;

    dom.triesText.textContent =
      `${remaining} remaining`;

    dom.triesPips.setAttribute(
      "aria-label",
      `${remaining} of ${MAX_TRIES} attempts remaining`
    );

    dom.triesPips.replaceChildren();

    for (let i = 0; i < MAX_TRIES; i++) {
      const pip = document.createElement("span");
      pip.className = "try-pip";

      if (i < state.tries) {
        pip.classList.add("used");
      }

      dom.triesPips.appendChild(pip);
    }
  }

  function renderHistory() {
    dom.guessHistory.replaceChildren();

    dom.historyCount.textContent =
      `${state.guesses.length} / ${MAX_TRIES}`;

    for (const guess of state.guesses) {
      const item = document.createElement("li");

      const name = document.createElement("strong");
      name.textContent = guess.text;

      const feedback = document.createElement("span");
      feedback.textContent =
        `${guess.matches} exact-position matches`;

      item.append(name, feedback);
      dom.guessHistory.appendChild(item);
    }
  }

  function renderRoundResult(solved, points, multiplier) {
    const answer = state.currentWord.answer;

    dom.resultIcon.textContent = solved ? "✦" : "✕";
    dom.resultIcon.classList.toggle("failed", !solved);

    dom.roundResultEyebrow.textContent =
      solved ? "WORD SOLVED" : "OUT OF TRIES";

    dom.roundResultTitle.textContent =
      solved
        ? ["Outstanding.", "Well played.", "Brilliant."][
            (state.round + state.tries) % 3
          ]
        : "Not this time.";

    dom.revealedAnswer.textContent = answer;
    dom.pointsEarned.textContent = `+${points}`;
    dom.roundFact.textContent = state.currentWord.fact;

    dom.roundDetail.textContent = solved
      ? `Solved in ${state.tries} ${
          state.tries === 1 ? "try" : "tries"
        } · ${Math.round((multiplier - 1) * 100)}% streak bonus`
      : "The streak resets, but there's always another challenge.";

    const lastRound =
      state.mode !== "endless" &&
      state.round + 1 >= state.words.length;

    dom.nextButton.textContent =
      lastRound ||
      (state.mode === "endless" && !solved)
        ? "SEE FINAL RESULTS ↗"
        : "NEXT ROUND ↗";
  }

  function getRoundEmoji(result) {
    if (!result.solved) return "🟥";
    if (result.tries === 5) return "🟨";
    return "🟩";
  }

  function renderFinalResults() {
    const average = state.solved
      ? (state.totalSolveTries / state.solved).toFixed(1)
      : "—";

    dom.finalScore.textContent = state.score;

    dom.finalSolved.textContent =
      `${state.solved} / ${state.results.length}`;

    dom.finalAverage.textContent = average;

    dom.finalStreak.textContent =
      state.bestSessionStreak;

    dom.highScoreBanner.classList.toggle(
      "hidden",
      state.score <= state.previousBest ||
      state.score === 0
    );

    dom.emojiSummary.textContent = state.results
      .map(result =>
        `${getRoundEmoji(result)} ${
          result.solved
            ? `Try ${result.tries}`
            : "Failed"
        }`
      )
      .join("  |  ");

    dom.shareFeedback.textContent = "";
  }

  // ========================================
  // SHARING
  // ========================================

  function buildShareText() {
    const rounds = state.results.map(result =>
      `${getRoundEmoji(result)} ${
        result.solved
          ? `Try ${result.tries}`
          : "Failed"
      }`
    );

    return [
      "Challengers 🎯",
      `Mode: ${displayMode(state.mode)}`,
      `Score: ${state.score}`,
      rounds.join(" | ")
    ].join("\n");
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;

    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      textarea.remove();
    }

    return copied;
  }

  async function shareResult() {
    const text = buildShareText();
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      // Try the legacy copy method below.
    }

    if (!copied) {
      copied = fallbackCopy(text);
    }

    if (copied) {
      dom.shareFeedback.textContent =
        "Copied! Share your challenge with a friend.";
    } else {
      dom.shareFeedback.textContent =
        "Automatic copy isn't available. Select and copy the result below.";

      const output = document.createElement("textarea");
      output.value = text;
      output.readOnly = true;
      output.setAttribute(
        "aria-label",
        "Shareable result text"
      );
      output.style.marginTop = "12px";

      const existing = $("manualShareText");
      existing?.remove();

      output.id = "manualShareText";

      dom.shareFeedback.after(output);
      output.focus();
      output.select();
    }
  }

  // ========================================
  // CONFETTI
  // ========================================

  function launchConfetti() {
    if (
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches
    ) {
      return;
    }

    const colors = [
      "#c9ff4a",
      "#8af3b6",
      "#ffffff",
      "#ffe09a",
      "#a3afff"
    ];

    dom.confettiLayer.replaceChildren();

    for (let i = 0; i < 45; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";

      piece.style.left = `${Math.random() * 100}%`;
      piece.style.backgroundColor =
        colors[i % colors.length];
      piece.style.animationDelay =
        `${Math.random() * .3}s`;
      piece.style.animationDuration =
        `${1.1 + Math.random() * .8}s`;
      piece.style.transform =
        `rotate(${Math.random() * 360}deg)`;

      piece.addEventListener(
        "animationend",
        () => piece.remove(),
        { once: true }
      );

      dom.confettiLayer.appendChild(piece);
    }
  }

  // ========================================
  // EVENT LISTENERS
  // ========================================

  function registerEvents() {
    dom.modeButtons.forEach(button => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        renderMenu();
        playSound("click");
      });
    });

    dom.difficultyButtons.forEach(button => {
      button.addEventListener("click", () => {
        state.difficulty = button.dataset.difficulty;
        renderMenu();
        playSound("click");
      });
    });

    dom.themeSelect.addEventListener("change", event => {
      state.theme = event.target.value;
    });

    dom.startButton.addEventListener("click", startGame);

    dom.guessForm.addEventListener("submit", event => {
      event.preventDefault();
      checkGuess(dom.guessInput.value);
    });

    dom.nextButton.addEventListener("click", nextRound);

    dom.quitButton.addEventListener("click", quitGame);

    dom.playAgainButton.addEventListener(
      "click",
      startGame
    );

    dom.menuButton.addEventListener(
      "click",
      returnToMenu
    );

    dom.shareButton.addEventListener(
      "click",
      shareResult
    );

    dom.soundButton.addEventListener(
      "click",
      toggleSound
    );

    dom.brandLink.addEventListener("click", event => {
      event.preventDefault();

      if (state.screen === "game") {
        quitGame();
      } else {
        returnToMenu();
      }
    });

    dom.howToPlayButton.addEventListener("click", () => {
      dom.howToPlayModal.showModal();
    });

    dom.closeModalButton.addEventListener("click", () => {
      dom.howToPlayModal.close();
    });

    dom.gotItButton.addEventListener("click", () => {
      dom.howToPlayModal.close();
    });

    dom.howToPlayModal.addEventListener(
      "click",
      event => {
        if (event.target === dom.howToPlayModal) {
          dom.howToPlayModal.close();
        }
      }
    );

    dom.gameCard.addEventListener(
      "animationend",
      event => {
        if (event.animationName === "shake") {
          dom.gameCard.classList.remove("shake");
        }
      }
    );
  }

  // ========================================
  // INIT
  // ========================================

  function validateDatabase() {
    if (!Array.isArray(window.WORDS)) {
      throw new Error(
        "WORDS was not loaded. Check words.js."
      );
    }

    const seen = new Set();

    for (const word of window.WORDS) {
      if (
        !word.theme ||
        !word.answer ||
        !["easy", "medium", "hard"].includes(
          word.difficulty
        ) ||
        !Array.isArray(word.aliases) ||
        !Array.isArray(word.clues) ||
        word.clues.length !== 3 ||
        word.clues.some(clue => !clue?.trim()) ||
        !word.fact
      ) {
        throw new Error(
          `Invalid word entry: ${word.answer || "unknown"}`
        );
      }

      const key = normalize(word.answer);

      if (seen.has(key)) {
        throw new Error(
          `Duplicate answer: ${word.answer}`
        );
      }

      seen.add(key);
    }
  }

  function init() {
    validateDatabase();
    loadStats();
    loadSoundPreference();
    registerEvents();
    renderMenu();
    showScreen("menu");
  }

  init();
})();
