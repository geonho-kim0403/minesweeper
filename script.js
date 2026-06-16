// 난이도 설정 (행, 열, 지뢰 수)
const DIFFICULTIES = {
    beginner: { rows: 9, cols: 9, mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert: { rows: 16, cols: 30, mines: 99 },
    hell: { rows: 20, cols: 30, mines: 170 }, // 지옥모드: 지뢰 밀도 약 28%
};

// 게임 상태
let board = [];          // 셀 데이터 2차원 배열
let rows = 9;
let cols = 9;
let mineCount = 10;
let flagCount = 0;
let revealedCount = 0;
let gameOver = false;
let firstClick = true;
let timer = 0;
let timerInterval = null;

// DOM 요소
const boardEl = document.getElementById("board");
const mineCountEl = document.getElementById("mine-count");
const timerEl = document.getElementById("timer");
const resetBtn = document.getElementById("reset-btn");
const diffButtons = document.querySelectorAll(".diff-btn");

// 순위표 관련 DOM
const lbTabs = document.querySelectorAll(".lb-tab");
const lbPeriodBtns = document.querySelectorAll(".lb-period");
const lbListEl = document.getElementById("leaderboard-list");
const lbModeEl = document.getElementById("leaderboard-mode");

// 시작 닉네임 모달 DOM
const startModal = document.getElementById("start-modal");
const startNameInput = document.getElementById("start-name-input");
const startConfirmBtn = document.getElementById("start-confirm-btn");

// 결과 안내 모달 DOM
const resultModal = document.getElementById("result-modal");
const resultTitle = document.getElementById("result-title");
const resultText = document.getElementById("result-text");
const resultRetryBtn = document.getElementById("result-retry-btn");
const resultCloseBtn = document.getElementById("result-close-btn");

// 플레이어 닉네임 (localStorage에 보관)
let playerName = localStorage.getItem("minesweeper_nickname") || "";

// 폭발 연출 DOM
const explosionOverlay = document.getElementById("explosion-overlay");
const explosionImg = document.getElementById("explosion-img");
const explosionEmoji = document.getElementById("explosion-emoji");

// 폭발 이미지 파일이 없으면 이모지 폴백으로 대체
explosionImg.addEventListener("error", () => {
    explosionImg.style.display = "none";
    explosionEmoji.style.display = "block";
});

// 현재 게임 난이도 / 순위표에서 보고 있는 난이도·기간
let currentLevel = "beginner";
let lbViewLevel = "beginner";
let lbViewPeriod = "daily";

// 숫자를 3자리 문자열로 변환
function pad(num) {
    return String(Math.max(0, num)).padStart(3, "0");
}

// 타이머 시작
function startTimer() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
        timer++;
        timerEl.textContent = pad(timer);
    }, 1000);
}

// 타이머 정지
function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// 게임 초기화
function initGame(level) {
    const config = DIFFICULTIES[level];
    currentLevel = level;
    rows = config.rows;
    cols = config.cols;
    mineCount = config.mines;

    flagCount = 0;
    revealedCount = 0;
    gameOver = false;
    firstClick = true;
    timer = 0;

    stopTimer();
    timerEl.textContent = pad(0);
    mineCountEl.textContent = pad(mineCount);
    resetBtn.textContent = "😊";

    // 빈 보드 생성
    board = [];
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            row.push({
                mine: false,
                revealed: false,
                flagged: false,
                adjacent: 0,
            });
        }
        board.push(row);
    }

    renderBoard();
}

// 보드 렌더링
function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 32px)`;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = board[r][c];
            const cellEl = document.createElement("div");
            cellEl.classList.add("cell");
            cellEl.dataset.row = r;
            cellEl.dataset.col = c;

            if (cell.revealed) {
                cellEl.classList.add("revealed");
                if (cell.mine) {
                    cellEl.classList.add("mine");
                    cellEl.textContent = "💣";
                } else if (cell.adjacent > 0) {
                    cellEl.textContent = cell.adjacent;
                    cellEl.classList.add("n" + cell.adjacent);
                }
            } else if (cell.flagged) {
                cellEl.classList.add("flagged");
                cellEl.textContent = "🚩";
            }

            cellEl.addEventListener("click", onCellClick);
            cellEl.addEventListener("contextmenu", onCellRightClick);
            boardEl.appendChild(cellEl);
        }
    }
}

// 첫 클릭 위치를 피해서 지뢰 배치 (첫 클릭 안전 보장)
function placeMines(safeRow, safeCol) {
    let placed = 0;
    while (placed < mineCount) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);

        // 이미 지뢰이거나 첫 클릭 셀이면 건너뜀
        if (board[r][c].mine) continue;
        if (r === safeRow && c === safeCol) continue;

        board[r][c].mine = true;
        placed++;
    }

    // 각 셀의 인접 지뢰 수 계산
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c].mine) continue;
            board[r][c].adjacent = countAdjacentMines(r, c);
        }
    }
}

// 인접한 8방향 지뢰 수 세기
function countAdjacentMines(row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) {
                count++;
            }
        }
    }
    return count;
}

// 셀 좌클릭 (열기)
function onCellClick(e) {
    if (gameOver) return;

    const row = parseInt(e.currentTarget.dataset.row);
    const col = parseInt(e.currentTarget.dataset.col);
    const cell = board[row][col];

    if (cell.revealed || cell.flagged) return;

    // 첫 클릭이면 지뢰 배치 후 타이머 시작
    if (firstClick) {
        placeMines(row, col);
        firstClick = false;
        startTimer();
    }

    revealCell(row, col);

    if (cell.mine) {
        // 지뢰 밟음 - 게임 오버
        endGame(false);
    } else {
        checkWin();
        renderBoard();
    }
}

// 셀 우클릭 (깃발)
function onCellRightClick(e) {
    e.preventDefault();
    if (gameOver) return;

    const row = parseInt(e.currentTarget.dataset.row);
    const col = parseInt(e.currentTarget.dataset.col);
    const cell = board[row][col];

    if (cell.revealed) return;

    cell.flagged = !cell.flagged;
    flagCount += cell.flagged ? 1 : -1;
    mineCountEl.textContent = pad(mineCount - flagCount);
    renderBoard();
}

// 셀 열기 (빈 칸이면 재귀적으로 확장)
function revealCell(row, col) {
    const cell = board[row][col];
    if (cell.revealed || cell.flagged) return;

    cell.revealed = true;
    revealedCount++;

    // 빈 칸(인접 지뢰 0)이면 주변 셀도 자동으로 열기
    if (!cell.mine && cell.adjacent === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr;
                const nc = col + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    revealCell(nr, nc);
                }
            }
        }
    }
}

// 승리 조건 확인 (지뢰가 아닌 모든 칸을 열었는지)
function checkWin() {
    const totalCells = rows * cols;
    if (revealedCount === totalCells - mineCount) {
        endGame(true);
    }
}

// 게임 종료
function endGame(won) {
    gameOver = true;
    stopTimer();
    resetBtn.textContent = won ? "😎" : "😵";

    // 모든 지뢰 공개
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c].mine) {
                board[r][c].revealed = true;
            }
        }
    }
    renderBoard();

    if (!won) {
        playExplosion(); // 지뢰 밟음 → 폭발 연출
    }

    // 승리/실패 모두 순위표에 자동 기록 후 결과 모달 표시
    const elapsed = timer;
    setTimeout(async () => {
        await Leaderboard.submit(currentLevel, playerName || "AGENT", elapsed, won);
        activateLbTab(currentLevel);

        if (won) {
            resultTitle.textContent = "🎉 클리어!";
            resultText.textContent = `${levelLabel(currentLevel)} · 클리어 시간 ${elapsed}초 — 순위표에 등록되었습니다!`;
        } else {
            resultTitle.textContent = "💥 실패!";
            resultText.textContent = `${levelLabel(currentLevel)} · ${elapsed}초 버팀 — 도전 기록이 순위표에 남았습니다.`;
        }
        resultModal.classList.remove("hidden");
    }, won ? 200 : 750);
}

// 지뢰 폭발 연출 (이미지 + 화면 번쩍 + 보드 흔들림)
function playExplosion() {
    // 보드 흔들림
    boardEl.classList.remove("shake");
    void boardEl.offsetWidth; // 애니메이션 재시작 트릭
    boardEl.classList.add("shake");

    // 폭발 오버레이 표시
    explosionOverlay.classList.remove("hidden");
    // 애니메이션 재시작을 위해 강제 리플로우
    void explosionOverlay.offsetWidth;

    // 약 0.7초 뒤 오버레이 숨김
    setTimeout(() => {
        explosionOverlay.classList.add("hidden");
        boardEl.classList.remove("shake");
    }, 700);
}

// 난이도 한글 라벨
function levelLabel(level) {
    return { beginner: "초급", intermediate: "중급", expert: "고급", hell: "🔥 지옥" }[level] || level;
}

// 현재 선택된 난이도
function getActiveLevel() {
    return document.querySelector(".diff-btn.active").dataset.level;
}

// 이벤트 리스너 등록
diffButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        diffButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        initGame(btn.dataset.level);
    });
});

resetBtn.addEventListener("click", () => {
    initGame(getActiveLevel());
});

// 우클릭 메뉴 방지 (보드 전체)
boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

// ===== 순위표 =====

// 초 → "MM:SS" 형태로 변환
function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

// 순위 목록 렌더링
async function renderLeaderboard(level, period) {
    lbViewLevel = level;
    lbViewPeriod = period;
    lbListEl.innerHTML = `<li class="lb-empty">불러오는 중...</li>`;

    const scores = await Leaderboard.fetch(level, period);

    if (!scores.length) {
        lbListEl.innerHTML = `<li class="lb-empty">아직 기록이 없습니다.</li>`;
    } else {
        lbListEl.innerHTML = scores
            .map((s, i) => {
                // 텍스트 이스케이프 (XSS 방지)
                const name = String(s.name)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                // 1·2·3등 특별 캐릭터, 그 외 숫자
                const rankIcon = ["👑", "🥈", "🥉"][i] || `<span class="lb-rank-num">${i + 1}</span>`;
                // 성공/실패 표시
                const mark = s.success
                    ? `<span class="lb-result win">✔</span>`
                    : `<span class="lb-result lose">💥</span>`;
                const cls = s.success ? "" : " lose-row";
                return `<li class="${cls}"><span class="lb-rank">${rankIcon}</span>${mark}<span class="lb-name">${name}</span><span class="lb-time">${formatTime(s.time)}</span></li>`;
            })
            .join("");
    }

    const periodLabel = period === "weekly" ? "주간(매주 초기화)" : "일간(매일 초기화)";
    lbModeEl.textContent =
        (Leaderboard.isShared() ? "🌐 모두가 공유 · " : "💾 이 브라우저 저장 · ") + periodLabel;
}

// 순위표 난이도 탭 전환
lbTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        lbTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        renderLeaderboard(tab.dataset.level, lbViewPeriod);
    });
});

// 순위표 기간(일간/주간) 전환
lbPeriodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        lbPeriodBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderLeaderboard(lbViewLevel, btn.dataset.period);
    });
});

// 순위표 탭을 특정 난이도로 활성화
function activateLbTab(level) {
    lbTabs.forEach((t) => t.classList.toggle("active", t.dataset.level === level));
    renderLeaderboard(level, lbViewPeriod);
}

// ===== 시작 닉네임 모달 =====
function confirmNickname() {
    const name = startNameInput.value.trim().slice(0, 12) || "AGENT";
    playerName = name;
    localStorage.setItem("minesweeper_nickname", name);
    startModal.classList.add("hidden");
}

startConfirmBtn.addEventListener("click", confirmNickname);
startNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmNickname();
});

// ===== 결과 모달 =====
resultRetryBtn.addEventListener("click", () => {
    resultModal.classList.add("hidden");
    initGame(getActiveLevel());
});
resultCloseBtn.addEventListener("click", () => resultModal.classList.add("hidden"));

// ===== 초기 실행 =====
// 닉네임이 없으면 시작 모달 표시, 있으면 기존 값으로 바로 진행
if (playerName) {
    startModal.classList.add("hidden");
} else {
    startNameInput.focus();
}

// 게임 시작
initGame("beginner");
renderLeaderboard("beginner", "daily");
