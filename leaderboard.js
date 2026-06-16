// 순위표 클라이언트: 서버 API 우선, 실패 시 localStorage 폴백
// - 배포 환경(Vercel + KV): 모두가 같은 순위표 공유
// - 로컬 파일 실행 / API 미설정: 브라우저 localStorage에 개별 저장
// - 일간/주간 기간별 순위 지원 + 지난 기간 자동 초기화
const Leaderboard = (() => {
    const MAX_ENTRIES = 20;
    // file:// 로 열면 API 호출 불가 → 곧바로 로컬 모드
    let useApi = location.protocol === "http:" || location.protocol === "https:";

    // 한국 표준시(KST) 기준 현재 시각
    function nowKST() {
        return new Date(Date.now() + 9 * 3600 * 1000);
    }

    // ISO 주차 (월요일 시작)
    function isoWeek(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = (d.getUTCDay() + 6) % 7;
        d.setUTCDate(d.getUTCDate() - dayNum + 3);
        const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
        const week =
            1 +
            Math.round(
                ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
            );
        return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }

    // 기간 키 (일간: YYYY-MM-DD, 주간: YYYY-Www)
    function periodKey(period) {
        const k = nowKST();
        if (period === "weekly") return isoWeek(k);
        const y = k.getUTCFullYear();
        const m = String(k.getUTCMonth() + 1).padStart(2, "0");
        const d = String(k.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    // localStorage 키
    function storageKey(level, period) {
        return `minesweeper_lb_${level}_${period}_${periodKey(period)}`;
    }

    // 지난 기간의 localStorage 데이터 정리 (자동 초기화)
    function cleanupOldLocal(level, period) {
        const prefix = `minesweeper_lb_${level}_${period}_`;
        const current = storageKey(level, period);
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix) && key !== current) {
                    localStorage.removeItem(key);
                }
            }
        } catch {
            /* 무시 */
        }
    }

    // localStorage 읽기
    function getLocal(level, period) {
        cleanupOldLocal(level, period);
        try {
            const raw = localStorage.getItem(storageKey(level, period));
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    // 순위 비교: 승리 우선(빠른 순), 실패는 아래(오래 버틴 순)
    function compareScores(a, b) {
        if (!!a.success !== !!b.success) return a.success ? -1 : 1;
        if (a.success) return a.time - b.time;
        return b.time - a.time;
    }

    // localStorage 저장
    function saveLocal(level, period, scores) {
        scores.sort(compareScores);
        const top = scores.slice(0, MAX_ENTRIES);
        try {
            localStorage.setItem(storageKey(level, period), JSON.stringify(top));
        } catch {
            /* 저장 실패 무시 */
        }
        return top;
    }

    // 순위 목록 조회
    async function fetch_(level, period) {
        if (useApi) {
            try {
                const res = await fetch(
                    `/api/scores?level=${encodeURIComponent(level)}&period=${encodeURIComponent(period)}`
                );
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
        return getLocal(level, period);
    }

    // 점수 제출 (일간·주간 모두 반영, 성공/실패 포함)
    async function submit(level, name, time, success) {
        if (useApi) {
            try {
                const res = await fetch("/api/scores", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ level, name, time, success }),
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
        // 로컬 폴백: 일간·주간 양쪽에 저장
        const entry = {
            name,
            time: Math.round(time),
            success: success === true,
            date: new Date().toISOString(),
        };
        let daily = [];
        for (const period of ["daily", "weekly"]) {
            const scores = getLocal(level, period);
            scores.push({ ...entry });
            const top = saveLocal(level, period, scores);
            if (period === "daily") daily = top;
        }
        return daily;
    }

    // 현재 모드 (UI 안내용)
    function isShared() {
        return useApi;
    }

    return { fetch: fetch_, submit, isShared };
})();
