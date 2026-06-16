// 순위표 클라이언트: 서버 API 우선, 실패 시 localStorage 폴백
// - 배포 환경(Vercel + KV): 모두가 같은 순위표 공유
// - 로컬 파일 실행 / API 미설정: 브라우저 localStorage에 개별 저장
const Leaderboard = (() => {
    const MAX_ENTRIES = 20;
    // file:// 로 열면 API 호출 불가 → 곧바로 로컬 모드
    let useApi = location.protocol === "http:" || location.protocol === "https:";

    function storageKey(level) {
        return `minesweeper_leaderboard_${level}`;
    }

    // localStorage 읽기
    function getLocal(level) {
        try {
            const raw = localStorage.getItem(storageKey(level));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    // localStorage 저장
    function saveLocal(level, scores) {
        scores.sort((a, b) => a.time - b.time);
        const top = scores.slice(0, MAX_ENTRIES);
        try {
            localStorage.setItem(storageKey(level), JSON.stringify(top));
        } catch {
            /* 저장 실패 무시 */
        }
        return top;
    }

    // 순위 목록 조회
    async function fetch_(level) {
        if (useApi) {
            try {
                const res = await fetch(`/api/scores?level=${encodeURIComponent(level)}`);
                if (res.ok) {
                    const data = await res.json();
                    return data.scores || [];
                }
                // API 응답이 비정상이면 로컬 모드로 전환
                useApi = false;
            } catch {
                useApi = false;
            }
        }
        return getLocal(level);
    }

    // 점수 제출
    async function submit(level, name, time) {
        if (useApi) {
            try {
                const res = await fetch("/api/scores", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ level, name, time }),
                });
                if (res.ok) {
                    const data = await res.json();
                    return data.scores || [];
                }
                useApi = false;
            } catch {
                useApi = false;
            }
        }
        // 로컬 폴백
        const scores = getLocal(level);
        scores.push({ name, time: Math.round(time), date: new Date().toISOString() });
        return saveLocal(level, scores);
    }

    // 현재 모드 (UI 안내용)
    function isShared() {
        return useApi;
    }

    return { fetch: fetch_, submit, isShared };
})();
